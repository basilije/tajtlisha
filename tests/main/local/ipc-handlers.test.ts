/* @vitest-environment node */
import { basename } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors';
import { IPC_CHANNELS } from '../../../src/shared/types/ipc';
import type { JobOwner } from '../../../src/main/jobs/job-registry';
import { JobRegistry } from '../../../src/main/jobs/job-registry';
import { registerExportIpc } from '../../../src/main/ipc/export.ipc';
import { registerJobsIpc } from '../../../src/main/ipc/jobs.ipc';
import { getFfmpegStatus } from '../../../src/main/ipc/media.ipc';
import { registerProjectIpc } from '../../../src/main/ipc/project.ipc';
import { registerWorkflowIpc } from '../../../src/main/ipc/workflow.ipc';
import type { DesktopDialogs, DesktopShell, IpcEvent } from '../../../src/main/ipc/types';
import { mainStringsFor } from '../../../src/main/i18n';
import { FfmpegService } from '../../../src/main/ffmpeg';

type Handler = (event: IpcEvent, ...args: any[]) => unknown;

/** Map-backed stand-in for ipcMain. invoke() mirrors ipcRenderer.invoke: sync throws become rejections. */
function fakeIpc() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    handle(channel: string, listener: Handler) {
      handlers.set(channel, listener);
    },
    invoke: async (channel: string, owner: JobOwner, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({ sender: owner }, ...args);
    }
  };
}

type FakeOwner = JobOwner & { sent: Array<{ channel: string; payload: unknown }> };

function fakeOwner(id: number): FakeOwner {
  const sent: FakeOwner['sent'] = [];
  return {
    id,
    sent,
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  };
}

const ENGLISH = mainStringsFor('en');

function fakeDialogs(overrides: Partial<DesktopDialogs> = {}): DesktopDialogs {
  return {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: vi.fn(async () => ({ response: 2 })),
    ...overrides
  };
}

/** Stand-in for the protocol URL: the real one is minted by MediaTokenMap. */
const fakeVideoUrl = (path: string) => `tajtlisha-media://video/fake-${basename(path)}`;

const exportPayload = {
  jobId: 'export-1',
  inputPath: '/videos/clip.mp4',
  outputFolder: '/videos/out',
  baseName: 'clip',
  videoWidth: 1280,
  videoHeight: 720,
  trim: { startMs: 0, endMs: 4000 },
  captions: [],
  sourceLanguage: 'en',
  targetLanguage: 'sr-Latn',
  style: {},
  outputs: { originalSrt: true, translationSrt: false, video: 'none' },
  overwritePolicy: 'ask'
};

function setupExport(options: { responses: number; exportProject?: ReturnType<typeof vi.fn> }) {
  const ipc = fakeIpc();
  const dialogs = fakeDialogs({ showMessageBox: vi.fn(async () => ({ response: options.responses })) });
  const exportProject =
    options.exportProject ??
    vi.fn(async (request: { overwritePolicy: string }) => {
      if (request.overwritePolicy === 'ask') {
        throw new AppError('OUTPUT_EXISTS', '/videos/out/clip.original.srt\n/videos/out/clip.srt');
      }
      return { files: [{ kind: 'original_srt', path: '/videos/out/clip.original.srt' }] };
    });
  const shell: DesktopShell = { showItemInFolder: vi.fn() };
  registerExportIpc({
    ipc,
    jobs: new JobRegistry(),
    exporter: { exportProject: exportProject as never },
    dialogs,
    shell,
    strings: async () => ENGLISH,
    pathExists: async (path) => path === '/videos/out'
  });
  return { ipc, dialogs, exportProject, shell };
}

describe('export:project output conflicts', () => {
  it('Replace retries the same job with overwrite', async () => {
    const { ipc, dialogs, exportProject } = setupExport({ responses: 0 });
    const owner = fakeOwner(1);

    const result = await ipc.invoke(IPC_CHANNELS.exportProject, owner, exportPayload);

    expect(result).toEqual({ files: [{ kind: 'original_srt', path: '/videos/out/clip.original.srt' }] });
    expect(exportProject).toHaveBeenCalledTimes(2);
    expect(exportProject.mock.calls[1]?.[0]).toMatchObject({ overwritePolicy: 'overwrite' });
    expect(dialogs.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('Create copies retries with create_copy', async () => {
    const { ipc, exportProject } = setupExport({ responses: 1 });

    await ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload);

    expect(exportProject.mock.calls[1]?.[0]).toMatchObject({ overwritePolicy: 'create_copy' });
  });

  it('Cancel rejects with EXPORT_CANCELED and does not retry', async () => {
    const { ipc, exportProject } = setupExport({ responses: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload)).rejects.toThrow('[EXPORT_CANCELED]');
    expect(exportProject).toHaveBeenCalledTimes(1);
  });

  it('shows the conflicting paths and the translated buttons in the dialog', async () => {
    const { ipc, dialogs } = setupExport({ responses: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), exportPayload)).rejects.toThrow('[EXPORT_CANCELED]');
    expect(dialogs.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        detail: '/videos/out/clip.original.srt\n/videos/out/clip.srt',
        buttons: [ENGLISH.exportConflictReplace, ENGLISH.exportConflictCreateCopies, ENGLISH.exportConflictCancel]
      })
    );
  });

  it('does not show the dialog when the caller chose a policy other than ask', async () => {
    const exportProject = vi.fn(async () => {
      throw new AppError('OUTPUT_EXISTS', '/videos/out/clip.srt');
    });
    const { ipc, dialogs } = setupExport({ responses: 0, exportProject });

    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, overwritePolicy: 'overwrite' })
    ).rejects.toThrow('[OUTPUT_EXISTS]');
    expect(dialogs.showMessageBox).not.toHaveBeenCalled();
  });

  it('rejects an invalid overwrite policy at the boundary', async () => {
    const { ipc, exportProject } = setupExport({ responses: 0 });

    await expect(
      ipc.invoke(IPC_CHANNELS.exportProject, fakeOwner(1), { ...exportPayload, overwritePolicy: 'always' })
    ).rejects.toThrow('[UNKNOWN] overwritePolicy must be one of ask, overwrite, create_copy.');
    expect(exportProject).not.toHaveBeenCalled();
  });
});

describe('export:showInFolder and output folder', () => {
  it('reveals only existing absolute paths', async () => {
    const { ipc, shell } = setupExport({ responses: 0 });

    await expect(ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), 'relative/out')).rejects.toThrow('[UNKNOWN]');
    await expect(ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), '/videos/missing')).rejects.toThrow('[UNKNOWN]');
    await ipc.invoke(IPC_CHANNELS.exportShowInFolder, fakeOwner(1), '/videos/out');

    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1);
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/videos/out');
  });

  it('returns null when the folder dialog is canceled', async () => {
    const { ipc } = setupExport({ responses: 0 });

    expect(await ipc.invoke(IPC_CHANNELS.exportSelectOutputFolder, fakeOwner(1))).toBeNull();
  });
});

describe('jobs:cancel scoping', () => {
  function setupWorkflow() {
    const ipc = fakeIpc();
    const jobs = new JobRegistry();
    const transcribe = vi.fn(
      (_request: unknown, context: { signal: AbortSignal; onProgress(event: { stage: string }): void }) =>
        new Promise<never>((_resolve, reject) => {
          context.onProgress({ stage: 'transcribing' });
          context.signal.addEventListener('abort', () => reject(new Error('child exited with SIGTERM')));
        })
    );
    registerWorkflowIpc({ ipc, jobs, workflow: { transcribe, translate: vi.fn() } as never });
    registerJobsIpc({ ipc, jobs });
    return { ipc, transcribe };
  }

  it('only the window that started a job can cancel it', async () => {
    const { ipc } = setupWorkflow();
    const starter = fakeOwner(1);
    const other = fakeOwner(2);
    let settled = false;
    const running = ipc
      .invoke(IPC_CHANNELS.workflowTranscribe, starter, transcribeRequest('job-1'))
      .finally(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await ipc.invoke(IPC_CHANNELS.jobsCancel, other, 'job-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    await ipc.invoke(IPC_CHANNELS.jobsCancel, starter, 'job-1');
    await expect(running).rejects.toThrow('[JOB_CANCELED]');
  });

  it('rejects a missing jobId at the boundary', async () => {
    const { ipc } = setupWorkflow();

    await expect(ipc.invoke(IPC_CHANNELS.jobsCancel, fakeOwner(1), '')).rejects.toThrow('[UNKNOWN] jobId must be a non-empty string.');
  });
});

describe('workflow handlers', () => {
  it('pass a signal and forward stage progress to the owner window', async () => {
    const ipc = fakeIpc();
    const jobs = new JobRegistry();
    let receivedSignal: AbortSignal | undefined;
    const transcribe = vi.fn(async (_request: unknown, context: { signal: AbortSignal; onProgress(event: { stage: string; progress?: number }): void }) => {
      receivedSignal = context.signal;
      context.onProgress({ stage: 'extracting_audio' });
      context.onProgress({ stage: 'transcribing', progress: 0.5 });
      return { language: 'en', captions: [], timingSource: 'word' };
    });
    registerWorkflowIpc({ ipc, jobs, workflow: { transcribe, translate: vi.fn() } as never });
    const owner = fakeOwner(7);

    const result = await ipc.invoke(IPC_CHANNELS.workflowTranscribe, owner, transcribeRequest('job-7'));

    expect(result).toEqual({ language: 'en', captions: [], timingSource: 'word' });
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ jobId: 'job-7', providerId: 'openai', trim: { startMs: 0, endMs: 4000 } });
    expect(owner.sent.map((message) => message.channel)).toEqual([IPC_CHANNELS.jobsProgress, IPC_CHANNELS.jobsProgress]);
    expect(owner.sent.map((message) => message.payload)).toEqual([
      { jobId: 'job-7', stage: 'extracting_audio', progress: undefined },
      { jobId: 'job-7', stage: 'transcribing', progress: 0.5 }
    ]);
  });

  it('rejects an invalid time range before starting work', async () => {
    const ipc = fakeIpc();
    const transcribe = vi.fn();
    registerWorkflowIpc({ ipc, jobs: new JobRegistry(), workflow: { transcribe, translate: vi.fn() } as never });

    await expect(
      ipc.invoke(IPC_CHANNELS.workflowTranscribe, fakeOwner(1), { ...transcribeRequest('job-1'), trim: { startMs: 5000, endMs: 1000 } })
    ).rejects.toThrow('[UNKNOWN] trim must be a range with 0 <= startMs < endMs.');
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe('project:selectVideo', () => {
  function setupProject(probe: Record<string, unknown>, selected: string | null = '/videos/clip.mp4') {
    const ipc = fakeIpc();
    const dialogs = fakeDialogs({
      showOpenDialog: vi.fn(async () =>
        selected === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [selected] }
      )
    });
    registerProjectIpc({
      ipc,
      jobs: new JobRegistry(),
      dialogs,
      mediaService: { probe: vi.fn(async () => probe), createPreviewProxy: vi.fn() } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: vi.fn() } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH,
      statFile: async () => ({ size: 1234, mtimeMs: 99 })
    });
    return { ipc, dialogs };
  }

  it('returns a ProjectSource with fresh fileUrl and file stats', async () => {
    const { ipc } = setupProject({ hasVideo: true, hasAudio: true, durationMs: 4000, width: 1280, height: 720 });

    expect(await ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).toEqual({
      inputPath: '/videos/clip.mp4',
      fileUrl: 'tajtlisha-media://video/fake-clip.mp4',
      durationMs: 4000,
      width: 1280,
      height: 720,
      hasAudio: true,
      fileSizeBytes: 1234,
      mtimeMs: 99
    });
  });

  it('opens the dialog with the video filters and returns null on cancel', async () => {
    const { ipc, dialogs } = setupProject({ hasVideo: true, durationMs: 1000, width: 2, height: 2 }, null);

    expect(await ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).toBeNull();
    expect(dialogs.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: ENGLISH.videoFilterName, extensions: ['mp4', 'm4v', 'mov', 'mkv', 'webm'] }]
      })
    );
  });

  it('rejects a file without a video stream', async () => {
    const { ipc } = setupProject({ hasVideo: false, hasAudio: true, durationMs: 4000 });

    await expect(ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).rejects.toThrow(
      '[UNKNOWN] The selected file has no video stream.'
    );
  });

  it('rejects a file whose duration is unknown', async () => {
    const { ipc } = setupProject({ hasVideo: true, width: 2, height: 2 });

    await expect(ipc.invoke(IPC_CHANNELS.projectSelectVideo, fakeOwner(1))).rejects.toThrow('[UNKNOWN]');
  });
});

describe('project:createPreviewProxy', () => {
  it('reports rendering progress from ffmpeg time against the probed duration', async () => {
    const ipc = fakeIpc();
    let now = 1000;
    const jobs = new JobRegistry(() => now);
    const createPreviewProxy = vi.fn(
      async (_input: string, _output: string, options: { onProgress?: (outTimeMs: number) => void }) => {
        options.onProgress?.(0);
        now += 1000;
        options.onProgress?.(5000);
      }
    );
    registerProjectIpc({
      ipc,
      jobs,
      dialogs: fakeDialogs(),
      mediaService: { probe: vi.fn(async () => ({ hasVideo: true, durationMs: 10000 })), createPreviewProxy } as never,
      projectStore: { loadLast: vi.fn(), save: vi.fn() } as never,
      previewProxies: { get: async (_input: string, create: (output: string) => Promise<void>) => (await create('/tmp/preview.mp4'), '/tmp/preview.mp4') } as never,
      exporter: { renderPreviewFrame: vi.fn() } as never,
      createVideoUrl: fakeVideoUrl,
      strings: async () => ENGLISH
    });
    const owner = fakeOwner(3);

    const result = await ipc.invoke(IPC_CHANNELS.projectCreatePreviewProxy, owner, { jobId: 'preview-1', inputPath: '/videos/clip.mkv' });

    expect(result).toEqual({ fileUrl: 'tajtlisha-media://video/fake-preview.mp4' });
    expect(createPreviewProxy.mock.calls[0]?.[0]).toBe('/videos/clip.mkv');
    expect(owner.sent.map((message) => message.payload)).toEqual([
      { jobId: 'preview-1', stage: 'rendering_video', progress: 0 },
      { jobId: 'preview-1', stage: 'rendering_video', progress: 0.5 }
    ]);
  });
});

describe('media:getFfmpegStatus', () => {
  it('is unavailable with missing features when ffmpeg cannot run', async () => {
    const ffmpeg = new FfmpegService({ ffmpegPath: '/nonexistent/ffmpeg-for-test', ffprobePath: '/nonexistent/ffprobe-for-test' });

    const status = await getFfmpegStatus(ffmpeg);

    expect(status.available).toBe(false);
    expect(status.missing).toEqual(expect.arrayContaining(['ffmpeg', 'ffprobe', 'ass filter (libass)']));
    expect(status.capabilities).toEqual({ ffprobe: false, assFilter: false, libx264: false, aac: false, mp3: false });
  });
});

function transcribeRequest(jobId: string) {
  return {
    jobId,
    inputPath: '/videos/clip.mp4',
    trim: { startMs: 0, endMs: 4000 },
    providerId: 'openai',
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  };
}
