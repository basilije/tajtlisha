import { app, dialog, ipcMain, type IpcMain } from 'electron';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AudioExtractRequest, CreatePreviewProxyRequest, MediaProbeRequest, TrimRequest } from '../../shared/types/media';
import { MediaService } from '../media';

type MediaIpcOptions = {
  ipc?: IpcMain;
  mediaService?: MediaService;
  createVideoUrl?: (inputPath: string) => string;
};

export function registerMediaIpc({
  ipc = ipcMain as IpcMain,
  mediaService = new MediaService(),
  createVideoUrl = (inputPath) => pathToFileURL(inputPath).toString()
}: MediaIpcOptions = {}): void {
  const previewProxyPath = join(tmpdir(), `tajtlisha-preview-${process.pid}.mp4`);

  ipc.handle('media:selectVideo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'MP4 video', extensions: ['mp4', 'm4v', 'mov'] }]
    });

    const inputPath = result.filePaths[0];
    if (result.canceled || !inputPath) {
      return null;
    }

    const probe = await mediaService.probe({ inputPath });
    if (!probe.hasVideo) {
      throw new Error('The selected file does not contain a video stream.');
    }

    return {
      ...probe,
      fileUrl: createVideoUrl(inputPath)
    };
  });
  ipc.handle('media:createPreviewProxy', async (_event, input: CreatePreviewProxyRequest) => {
    await mediaService.createPreviewProxy(input.inputPath, previewProxyPath);
    return { fileUrl: createVideoUrl(previewProxyPath) };
  });
  ipc.handle('media:getFfmpegStatus', () => mediaService.getFfmpegStatus());
  ipc.handle('media:probe', (_event, input: MediaProbeRequest) => mediaService.probe(input));
  ipc.handle('media:trim', (_event, input: TrimRequest) => mediaService.trim(input));
  ipc.handle('media:extractAudio', (_event, input: AudioExtractRequest) => mediaService.extractAudio(input));

  app.once('will-quit', () => {
    void rm(previewProxyPath, { force: true });
  });
}
