import type { PolishMode, TranscribeClipRequest, TranslateCaptionsRequest } from '../../shared/types/jobs';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { SubtitleWorkflowService } from '../ai';
import { type JobRegistry, runJob } from '../jobs/job-registry';
import {
  requireArray,
  requireFiniteNumber,
  requireJobId,
  requireOneOf,
  requireProviderId,
  requireRecord,
  requireString,
  requireText,
  requireTimeRange
} from './validation';
import type { IpcRegistrar } from './types';

export type WorkflowIpcDeps = {
  ipc: IpcRegistrar;
  jobs: JobRegistry;
  workflow: Pick<SubtitleWorkflowService, 'transcribe' | 'translate'>;
};

export function registerWorkflowIpc({ ipc, jobs, workflow }: WorkflowIpcDeps): void {
  ipc.handle(IPC_CHANNELS.workflowTranscribe, (event, payload: unknown) => {
    const request = toTranscribeRequest(payload);
    return runJob(jobs, event.sender, request.jobId, (context) => workflow.transcribe(request, context));
  });

  ipc.handle(IPC_CHANNELS.workflowTranslate, (event, payload: unknown) => {
    const request = toTranslateRequest(payload);
    return runJob(jobs, event.sender, request.jobId, (context) => workflow.translate(request, context));
  });
}

function toTranscribeRequest(payload: unknown): TranscribeClipRequest {
  const input = requireRecord(payload, 'request');
  const maxLinesPerCaption = requireFiniteNumber(input.maxLinesPerCaption, 'maxLinesPerCaption');
  return {
    jobId: requireJobId(input.jobId),
    inputPath: requireString(input.inputPath, 'inputPath'),
    trim: requireTimeRange(input.trim, 'trim'),
    providerId: requireProviderId(input.providerId),
    modelId: optionalString(input.modelId, 'modelId'),
    language: optionalString(input.language, 'language'),
    maxCharsPerLine: requireFiniteNumber(input.maxCharsPerLine, 'maxCharsPerLine'),
    maxLinesPerCaption: maxLinesPerCaption === 1 ? 1 : 2
  };
}

function toTranslateRequest(payload: unknown): TranslateCaptionsRequest {
  const input = requireRecord(payload, 'request');
  const maxLinesPerCaption = requireFiniteNumber(input.maxLinesPerCaption, 'maxLinesPerCaption');
  return {
    jobId: requireJobId(input.jobId),
    providerId: requireProviderId(input.providerId),
    modelId: optionalString(input.modelId, 'modelId'),
    sourceLanguage: requireString(input.sourceLanguage, 'sourceLanguage'),
    targetLanguage: requireString(input.targetLanguage, 'targetLanguage'),
    captions: requireArray(input.captions, 'captions').map((caption, index) => {
      const row = requireRecord(caption, `captions[${index}]`);
      return { id: requireString(row.id, `captions[${index}].id`), text: requireText(row.text, `captions[${index}].text`) };
    }),
    polish: toPolishMode(input.polish),
    maxCharsPerLine: requireFiniteNumber(input.maxCharsPerLine, 'maxCharsPerLine'),
    maxLinesPerCaption: maxLinesPerCaption === 1 ? 1 : 2
  };
}

function toPolishMode(value: unknown): PolishMode {
  return requireOneOf<PolishMode>(value, ['none', 'conservative', 'social_caption'], 'polish');
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireString(value, field);
}
