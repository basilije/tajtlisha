import { pathToFileURL } from 'node:url';
import { AppError } from '../../shared/errors';
import type { IpcEvent, IpcRegistrar } from './types';

/**
 * Where the app's own renderer lives. Dev: the Vite dev server origin. Packaged:
 * the exact renderer/index.html file. Anything else is not ours.
 */
export type RendererEntry = { kind: 'origin'; origin: string } | { kind: 'file'; pathname: string };

export function rendererEntryFor(options: { devRendererUrl?: string; entryFile: string }): RendererEntry {
  if (options.devRendererUrl) {
    return { kind: 'origin', origin: new URL(options.devRendererUrl).origin };
  }
  return { kind: 'file', pathname: new URL(pathToFileURL(options.entryFile).href).pathname };
}

/** Compares protocol and origin/path only. Query and hash are ignored. */
export function isRendererEntryUrl(entry: RendererEntry, url: string): boolean {
  try {
    const parsed = new URL(url);
    if (entry.kind === 'origin') return parsed.origin === entry.origin;
    return parsed.protocol === 'file:' && parsed.pathname === entry.pathname;
  } catch {
    return false;
  }
}

export type SenderPolicy = {
  /** True for a WebContents id that belongs to one of the app's windows. */
  isOwnWebContents(id: number): boolean;
  isRendererEntry(url: string): boolean;
};

/**
 * Only the main frame of one of our windows, showing the renderer entry, may
 * call IPC. Subframes and foreign pages are rejected with a generic message.
 */
export function assertTrustedSender(event: IpcEvent, policy: SenderPolicy): void {
  const frame = event.senderFrame;
  const trusted =
    frame !== undefined &&
    frame !== null &&
    frame.parent === null &&
    policy.isOwnWebContents(event.sender.id) &&
    policy.isRendererEntry(frame.url);
  if (!trusted) {
    throw new AppError('UNKNOWN', 'untrusted sender');
  }
}

/**
 * Wraps a registrar so every handler checks the sender first. Modules register
 * through this, so a new channel is guarded without the module having to ask.
 */
export function guardIpc(ipc: IpcRegistrar, policy: SenderPolicy): IpcRegistrar {
  return {
    handle(channel, listener) {
      ipc.handle(channel, (event, ...args) => {
        assertTrustedSender(event, policy);
        return listener(event, ...args);
      });
    }
  };
}
