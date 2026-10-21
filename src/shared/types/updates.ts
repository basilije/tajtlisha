/**
 * Auto-update state shown in Settings. Updates come from GitHub Releases via
 * electron-updater and only work in packaged builds (AppImage on Linux, NSIS on
 * Windows). In development and in .deb installs the status is 'unsupported'.
 */
export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not_available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  /** Version offered by the update server, when known. */
  availableVersion?: string;
  /** 0..1 while downloading. */
  downloadProgress?: number;
  /** Release notes (plain text or markdown) of the available version. */
  releaseNotes?: string;
  /** Error detail when status is 'error'. */
  message?: string;
};
