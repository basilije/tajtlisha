import { app } from 'electron';
import { join } from 'node:path';

/**
 * Folder with bundled runtime resources (fonts). In packaged builds
 * electron-builder copies `resources/` to `process.resourcesPath` via
 * extraResources; in development it lives at the repository root.
 */
export function bundledResourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
}

export function bundledFontsDir(): string {
  return join(bundledResourcesDir(), 'fonts');
}
