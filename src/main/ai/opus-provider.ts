import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { AppError } from '../../shared/errors';
import { validatePath } from '../media/contracts';
import {
  OPUS_API,
  alignSrtToCaptions,
  buildClipProjectBody,
  formatUsage,
  isFailedStage,
  isFinishedStage,
  opusLanguage,
  parseUsage,
  type OpusUsage
} from './opus-api';
import {
  BaseAiProvider,
  scrubSecrets,
  type AiProviderContext,
  type ProviderDefinition,
  type ProviderVideoTranslateRequest,
  type ProviderVideoTranslateResult
} from './provider';

/** Counts bytes as a file stream is read, so a large upload can report how far it has gone. */
export function byteCounter(onBytes?: (loaded: number) => void): Transform {
  let loaded = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      loaded += chunk.length;
      onBytes?.(loaded);
      callback(null, chunk);
    }
  });
}

export const opusProviderDefinition: ProviderDefinition = {
  id: 'opus',
  displayName: 'Opus',
  authModes: ['api_key'],
  capabilities: {
    detectLanguage: false,
    transcription: false,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: false,
    textToSpeech: false
  },
  modelDescriptors: []
};

const POLL_MS = 15_000;
const TIMEOUT_MS = 90 * 60 * 1000;

export class OpusProvider extends BaseAiProvider {
  protected readonly modelsUrl = `${OPUS_API}/api-usage?q=mine`;
  override readonly translatesFromVideo = true;

  constructor(context: AiProviderContext) {
    super(opusProviderDefinition, context);
  }

  override async testConnection() {
    const checkedAt = new Date().toISOString();
    if (!(await this.credentialStore.get(this.id))) {
      return { ok: false, providerId: this.id, checkedAt, message: 'Opus is not connected.' };
    }

    try {
      const usage = await this.readUsage();
      const balance = formatUsage(usage);
      return {
        ok: true,
        providerId: this.id,
        checkedAt,
        message: balance ? `Opus connection verified. ${balance}.` : 'Opus connection verified.'
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'JOB_CANCELED') throw error;
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: error instanceof AppError ? error.detail : 'Opus connection could not be verified.'
      };
    }
  }

  override async translateFromVideo(request: ProviderVideoTranslateRequest): Promise<ProviderVideoTranslateResult> {
    validatePath(request.inputPath, 'inputPath');
    const targetLanguage = opusLanguage(request.targetLanguage);
    const sourceLanguage = opusLanguage(request.sourceLanguage);
    if (!targetLanguage) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Opus needs a target language.');
    }
    if (sourceLanguage && sourceLanguage === targetLanguage) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Opus target language is the same as the source language.');
    }

    let before: OpusUsage | undefined;
    try {
      before = await this.readUsage(request.signal);
      request.onProgress?.(0.02);
      const file = await stat(request.inputPath).catch(() => {
        throw new AppError('PROVIDER_REQUEST_FAILED', 'The open video could not be read.');
      });
      const contentType = contentTypeFor(request.inputPath);
      const upload = await this.createUpload(request.signal);
      request.onProgress?.(0.08);
      const sessionUrl = await this.startResumable(upload.url, contentType, request.signal);
      request.onUpload?.(0, file.size);
      await this.putFile(sessionUrl, request.inputPath, file.size, contentType, request.signal, (loaded) =>
        request.onUpload?.(loaded, file.size)
      );
      request.onUpload?.(file.size, file.size);
      request.onProgress?.(0.45);
      const title = `${basename(request.inputPath, extname(request.inputPath))} [${targetLanguage}]`.slice(0, 180);
      const created = await this.postJson(
        '/clip-projects',
        buildClipProjectBody({
          uploadId: upload.uploadId,
          title,
          sourceLanguage,
          targetLanguage
        }),
        request.signal
      );
      const projectId = stringField(created, 'projectId') || stringField(created, 'id');
      if (!projectId) {
        throw new AppError('PROVIDER_REQUEST_FAILED', 'Opus did not return a project id.');
      }
      request.onProgress?.(0.5);
      const transcriptUrl = await this.waitForTranscript(projectId, request.signal, request.onProgress);
      const srtResponse = await fetch(transcriptUrl, { signal: request.signal });
      if (!srtResponse.ok) {
        throw new AppError('PROVIDER_REQUEST_FAILED', `Opus transcript download failed (HTTP ${srtResponse.status}).`);
      }
      const items = alignSrtToCaptions(await srtResponse.text(), request.cues);
      const after = await this.readUsage(request.signal);
      request.onProgress?.(1);
      return {
        items,
        credits: { beforeMinutes: before.remainingMinutes, afterMinutes: after.remainingMinutes }
      };
    } catch (error) {
      throw await this.withCredits(error, before, request.signal);
    }
  }

  private async readUsage(signal?: AbortSignal): Promise<OpusUsage> {
    return parseUsage(await this.getJson('/api-usage?q=mine', signal));
  }

  private async createUpload(signal?: AbortSignal): Promise<{ url: string; uploadId: string }> {
    const body = await this.postJson('/upload-links', { video: { usecase: 'LocalUpload' } }, signal);
    const url = stringField(body, 'url');
    const uploadId = stringField(body, 'uploadId');
    if (!url || !uploadId) {
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Opus did not return an upload link.');
    }
    return { url, uploadId };
  }

  private async startResumable(url: string, contentType: string, signal?: AbortSignal): Promise<string> {
    const secret = await this.requireSecret();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-resumable': 'start',
          'Content-Type': contentType,
          'Content-Length': '0'
        },
        body: '',
        redirect: 'manual',
        signal
      });
    } catch (error) {
      throwIfAbort(error, signal);
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Unable to reach Opus storage. Check your internet connection and try again.');
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new AppError(
        'PROVIDER_REQUEST_FAILED',
        `Opus storage did not start the upload (HTTP ${response.status}). ${scrubSecrets(await response.text(), secret).slice(0, 200)}`
      );
    }
    return location;
  }

  private async putFile(
    url: string,
    inputPath: string,
    size: number,
    contentType: string,
    signal?: AbortSignal,
    onBytes?: (loaded: number) => void
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(size)
        },
        body: Readable.toWeb(createReadStream(inputPath).pipe(byteCounter(onBytes))) as BodyInit,
        duplex: 'half',
        signal
      } as RequestInit);
    } catch (error) {
      throwIfAbort(error, signal);
      throw new AppError('PROVIDER_REQUEST_FAILED', 'The video upload to Opus was interrupted. Try again.');
    }
    if (!response.ok) {
      throw new AppError('PROVIDER_REQUEST_FAILED', `Opus rejected the video upload (HTTP ${response.status}).`);
    }
  }

  private async waitForTranscript(
    projectId: string,
    signal: AbortSignal | undefined,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const deadline = Date.now() + TIMEOUT_MS;
    let lastStage = 'QUEUED';
    while (Date.now() <= deadline) {
      throwIfAbort(undefined, signal);
      const project = await this.getJson(`/clip-projects/${encodeURIComponent(projectId)}`, signal);
      lastStage = stringField(project, 'stage') || lastStage;
      const transcriptUrl = stringField(project, 'transcriptSrtUrl');
      if (isFailedStage(lastStage, isRecord(project) ? project.error : undefined)) {
        throw new AppError('PROVIDER_REQUEST_FAILED', `Opus project ${projectId} failed (${lastStage}).`);
      }
      if (isFinishedStage(lastStage, isRecord(project) ? project.error : undefined, transcriptUrl)) {
        return transcriptUrl;
      }
      onProgress?.(Math.min(0.9, 0.5 + (1 - (deadline - Date.now()) / TIMEOUT_MS) * 0.4));
      await delay(POLL_MS, signal);
    }
    throw new AppError('PROVIDER_REQUEST_FAILED', `Opus project ${projectId} did not finish (last stage ${lastStage}).`);
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    return this.send('GET', `${OPUS_API}${path}`, undefined, signal);
  }

  private async postJson(path: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.send('POST', `${OPUS_API}${path}`, payload, signal);
  }

  private async send(method: 'GET' | 'POST', url: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    const secret = await this.requireSecret();
    const headers = new Headers({
      authorization: `Bearer ${secret}`,
      accept: 'application/json'
    });
    let body: string | undefined;
    if (payload !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(payload);
    }

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal });
    } catch (error) {
      throwIfAbort(error, signal);
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Unable to reach Opus. Check your internet connection and try again.');
    }

    const text = await response.text();
    if (!response.ok) {
      throw opusHttpError(response.status, text, secret);
    }
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throwIfAbort(error, signal);
      throw new AppError('PROVIDER_REQUEST_FAILED', 'Opus returned an unreadable response. Please try again.');
    }
  }

  private async withCredits(error: unknown, before: OpusUsage | undefined, signal?: AbortSignal): Promise<AppError> {
    if (error instanceof AppError && error.code === 'JOB_CANCELED') return error;
    let after: OpusUsage | undefined;
    try {
      after = await this.readUsage(signal);
    } catch {
      after = undefined;
    }
    const note = creditNote(before, after);
    const appError = error instanceof AppError ? error : new AppError('PROVIDER_REQUEST_FAILED', 'Opus translation failed.');
    const detail = [appError.detail, note].filter(Boolean).join(' ');
    return new AppError(appError.code, detail || undefined);
  }
}

function creditNote(before: OpusUsage | undefined, after: OpusUsage | undefined): string {
  if (!before && !after) return '';
  const start = before?.remainingMinutes ?? 'unknown';
  const end = after?.remainingMinutes ?? 'unknown';
  return `Credits before ${start} min, after ${end} min.`;
}

function opusHttpError(status: number, text: string, secret: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError('PROVIDER_AUTH_FAILED', 'Opus rejected the API key.');
  }
  if (status === 429) {
    return new AppError('PROVIDER_RATE_LIMITED', 'Opus rate limit or quota blocked this request.');
  }
  let message = '';
  try {
    const payload = JSON.parse(text) as { message?: unknown; error?: { message?: unknown } | string };
    if (typeof payload.message === 'string') message = payload.message;
    else if (typeof payload.error === 'string') message = payload.error;
    else if (payload.error && typeof payload.error.message === 'string') message = payload.error.message;
  } catch {
    message = text;
  }
  const clean = scrubSecrets(message, secret).replace(/\s+/g, ' ').trim().slice(0, 300);
  return new AppError('PROVIDER_REQUEST_FAILED', clean ? `Opus request failed (HTTP ${status}): ${clean}` : `Opus request failed (HTTP ${status}).`);
}

function contentTypeFor(inputPath: string): string {
  switch (extname(inputPath).toLowerCase()) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function stringField(value: unknown, key: string): string {
  if (!isRecord(value)) return '';
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function throwIfAbort(error: unknown, signal?: AbortSignal): void {
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    throw new AppError('JOB_CANCELED');
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError('JOB_CANCELED'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AppError('JOB_CANCELED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
