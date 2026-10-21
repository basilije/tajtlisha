import { dialog, ipcMain, type IpcMain } from 'electron';
import type { BurnSubtitlesRequest, ExportProjectRequest, WriteSrtRequest } from '../../shared/types/export';
import { ProjectExportService, SubtitleBurnService, writeSrt } from '../export';
import { ExportOutputConflictError } from '../export/project-export-service';

export function registerExportIpc(
  ipc = ipcMain as IpcMain,
  subtitleBurnService = new SubtitleBurnService(),
  projectExportService = new ProjectExportService()
): void {
  ipc.handle('export:selectOutputFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });

    const outputFolder = result.filePaths[0];
    if (result.canceled || !outputFolder) {
      return null;
    }

    return { outputFolder };
  });
  ipc.handle('export:writeSrt', (_event, input: WriteSrtRequest) => writeSrt(input));
  ipc.handle('export:burnSubtitles', (_event, input: BurnSubtitlesRequest) => subtitleBurnService.burnSubtitles(input));
  ipc.handle('export:project', async (_event, input: ExportProjectRequest) => {
    try {
      return await projectExportService.exportProject(input);
    } catch (error) {
      if (!(error instanceof ExportOutputConflictError) || (input.overwritePolicy ?? 'ask') !== 'ask') {
        throw error;
      }

      const response = await dialog.showMessageBox({
        type: 'warning',
        message: 'Some export files already exist.',
        detail: error.paths.join('\n'),
        buttons: ['Cancel', 'Replace files', 'Create copies'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });

      if (response.response === 1) {
        return projectExportService.exportProject({ ...input, overwritePolicy: 'overwrite' });
      }
      if (response.response === 2) {
        return projectExportService.exportProject({ ...input, overwritePolicy: 'create_copy' });
      }
      throw new Error('Export canceled because output files already exist.');
    }
  });
}
