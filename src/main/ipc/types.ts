import type { JobOwner } from '../jobs/job-registry';

/** The frame that sent an IPC message. Electron's WebFrameMain satisfies it. */
export type SenderFrame = { url: string; parent: object | null };

/**
 * The subset of IpcMainInvokeEvent the handlers read. Electron's event satisfies
 * it. `senderFrame` is only read by the trust check, so tests may leave it out.
 */
export type IpcEvent = { sender: JobOwner; senderFrame?: SenderFrame | null };

/**
 * Only `handle` is used. Electron's ipcMain satisfies this, and tests pass a
 * Map-backed fake. Method syntax keeps the listener parameter bivariant.
 */
export type IpcRegistrar = {
  handle(channel: string, listener: (event: IpcEvent, ...args: any[]) => unknown): void;
};

export type OpenDialogRequest = {
  title?: string;
  properties: Array<'openFile' | 'openDirectory' | 'createDirectory'>;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export type OpenDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

export type MessageBoxRequest = {
  type: 'warning';
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: boolean;
};

/** Native dialogs and shell actions, adapted from Electron in index.ts. */
export type DesktopDialogs = {
  showOpenDialog(request: OpenDialogRequest): Promise<OpenDialogResult>;
  showMessageBox(request: MessageBoxRequest): Promise<{ response: number }>;
};

export type DesktopShell = {
  showItemInFolder(fullPath: string): void;
};
