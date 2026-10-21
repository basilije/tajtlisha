import { AppError } from '../../shared/errors';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { ProjectDocument, ProjectSource } from '../../shared/types/project';
import type { PreviewFrameRequest, PreviewFrameResult, ProjectExportService } from '../export';
import type { MediaService } from '../media';
import { type JobRegistry, runJob } from '../jobs/job-registry';
import type { MainStrings } from '../i18n';
import { defaultStatFile, type ProjectStore, type StatFile } from '../project/project-store';
import type { PreviewProxyCache } from '../project/preview-proxy-cache';
import {
  requireFiniteNumber,
  requireJobId,
  requireRecord,
  requireString,
  requireText
} from './validation';
import type { DesktopDialogs, IpcRegistrar } from './types';

export type ProjectIpcDeps = {
  ipc: IpcRegistrar;
  jobs: JobRegistry;
  dialogs: Pick<DesktopDialogs, 'showOpenDialog'>;
  mediaService: Pick<MediaService, 'probe' | 'createPreviewProxy'>;
  projectStore: Pick<ProjectStore, 'loadLast' | 'save'>;
  previewProxies: Pick<PreviewProxyCache, 'get'>;
  exporter: Pick<ProjectExportService, 'renderPreviewFrame'>;
  /** Protocol URL for a local file; the same path always yields the same URL. */
  createVideoUrl: (inputPath: string) => string;
  strings: () => Promise<MainStrings>;
  statFile?: StatFile;
};

/** Extensions Chromium may or may not decode; files Chromium cannot play go through the preview proxy. */
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'mkv', 'webm'];

export function registerProjectIpc({
  ipc,
  jobs,
  dialogs,
  mediaService,
  projectStore,
  previewProxies,
  exporter,
  createVideoUrl,
  strings,
  statFile = defaultStatFile
}: ProjectIpcDeps): void {
  ipc.handle(IPC_CHANNELS.projectSelectVideo, async () => {
    const s = await strings();
    const result = await dialogs.showOpenDialog({
      title: s.selectVideoTitle,
      properties: ['openFile'],
      filters: [{ name: s.videoFilterName, extensions: VIDEO_EXTENSIONS }]
    });
    const inputPath = result.canceled ? undefined : result.filePaths[0];
    if (!inputPath) return null;

    return buildProjectSource(inputPath);
  });

  ipc.handle(IPC_CHANNELS.projectLoadLast, () => projectStore.loadLast());

  ipc.handle(IPC_CHANNELS.projectSave, (_event, payload: unknown) => projectStore.save(toProjectDocument(payload)));

  ipc.handle(IPC_CHANNELS.projectCreatePreviewProxy, (event, payload: unknown) => {
    const input = requireRecord(payload, 'request');
    const jobId = requireJobId(input.jobId);
    const inputPath = requireString(input.inputPath, 'inputPath');

    return runJob(jobs, event.sender, jobId, async (context) => {
      context.onProgress({ stage: 'rendering_video', progress: 0 });
      const outputPath = await previewProxies.get(inputPath, async (output) => {
        const { durationMs } = await mediaService.probe({ inputPath });
        await mediaService.createPreviewProxy(inputPath, output, {
          signal: context.signal,
          onProgress: (outTimeMs) =>
            context.onProgress({
              stage: 'rendering_video',
              progress: durationMs && durationMs > 0 ? clamp01(outTimeMs / durationMs) : undefined
            })
        });
      });
      return { fileUrl: createVideoUrl(outputPath) };
    });
  });

  ipc.handle(IPC_CHANNELS.projectRenderPreviewFrame, (_event, payload: unknown): Promise<PreviewFrameResult> => {
    const request = toPreviewFrameRequest(payload);
    return exporter.renderPreviewFrame(request);
  });

  /** Builds the source record for the import: probed size and duration plus file size and mtime for change detection. */
  async function buildProjectSource(inputPath: string): Promise<ProjectSource> {
    let probe: Awaited<ReturnType<MediaService['probe']>>;
    try {
      probe = await mediaService.probe({ inputPath });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new AppError('UNKNOWN', `The file could not be read as a video: ${reason}`);
    }

    if (!probe.hasVideo) {
      throw new AppError('UNKNOWN', 'The selected file has no video stream.');
    }
    if (probe.durationMs === undefined || probe.durationMs <= 0) {
      throw new AppError('UNKNOWN', 'The duration of the selected video could not be determined.');
    }
    if (probe.width === undefined || probe.height === undefined) {
      throw new AppError('UNKNOWN', 'The size of the selected video could not be determined.');
    }

    const stats = await statFile(inputPath);
    return {
      inputPath,
      fileUrl: createVideoUrl(inputPath),
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio ?? false,
      fileSizeBytes: stats.size,
      mtimeMs: stats.mtimeMs
    };
  }
}

function toProjectDocument(payload: unknown): ProjectDocument {
  const input = requireRecord(payload, 'project');
  requireString(input.id, 'project.id');
  requireFiniteNumber(input.revision, 'project.revision');
  // Structural checks beyond id and revision happen in ProjectStore on load.
  return input as unknown as ProjectDocument;
}

function toPreviewFrameRequest(payload: unknown): PreviewFrameRequest {
  const input = requireRecord(payload, 'request');
  return {
    inputPath: requireString(input.inputPath, 'inputPath'),
    atMs: requireFiniteNumber(input.atMs, 'atMs'),
    videoWidth: requireFiniteNumber(input.videoWidth, 'videoWidth'),
    videoHeight: requireFiniteNumber(input.videoHeight, 'videoHeight'),
    text: requireText(input.text, 'text'),
    style: requireRecord(input.style, 'style') as unknown as PreviewFrameRequest['style']
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
