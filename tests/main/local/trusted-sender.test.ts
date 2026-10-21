/* @vitest-environment node */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { guardIpc, isRendererEntryUrl, rendererEntryFor, assertTrustedSender, type SenderPolicy } from '../../../src/main/ipc/trusted-sender';
import type { IpcEvent } from '../../../src/main/ipc/types';

const ENTRY_FILE = join('/opt/tajtlisha/resources/app/out/renderer', 'index.html');
const ENTRY_URL = pathToFileURL(ENTRY_FILE).href;

const ownWindow = 4;

/** The policy the app builds from its real renderer entry file. */
function policyFor(windows: number[] = [ownWindow]): SenderPolicy {
  const entry = rendererEntryFor({ entryFile: ENTRY_FILE });
  return {
    isOwnWebContents: (id) => windows.includes(id),
    isRendererEntry: (url) => isRendererEntryUrl(entry, url)
  };
}

function eventFrom(url: string, options: { id?: number; parent?: object | null } = {}): IpcEvent {
  return {
    sender: { id: options.id ?? ownWindow, send: () => undefined },
    senderFrame: { url, parent: options.parent === undefined ? null : options.parent }
  };
}

describe('renderer entry matching', () => {
  it('packaged: accepts the exact renderer file, ignoring query and hash', () => {
    const entry = rendererEntryFor({ entryFile: ENTRY_FILE });

    expect(isRendererEntryUrl(entry, ENTRY_URL)).toBe(true);
    expect(isRendererEntryUrl(entry, `${ENTRY_URL}#/editor`)).toBe(true);
  });

  it('packaged: rejects other files in the same folder, other protocols and remote pages', () => {
    const entry = rendererEntryFor({ entryFile: ENTRY_FILE });

    expect(isRendererEntryUrl(entry, pathToFileURL(join('/opt/tajtlisha/resources/app/out/renderer', 'other.html')).href)).toBe(false);
    expect(isRendererEntryUrl(entry, 'file:///etc/passwd')).toBe(false);
    expect(isRendererEntryUrl(entry, 'https://example.com/index.html')).toBe(false);
    expect(isRendererEntryUrl(entry, 'not a url')).toBe(false);
  });

  it('dev: accepts the dev server origin and rejects any other origin', () => {
    const entry = rendererEntryFor({ devRendererUrl: 'http://localhost:5173/', entryFile: ENTRY_FILE });

    expect(isRendererEntryUrl(entry, 'http://localhost:5173/')).toBe(true);
    expect(isRendererEntryUrl(entry, 'http://localhost:5173/#/settings')).toBe(true);
    expect(isRendererEntryUrl(entry, 'http://localhost:9999/')).toBe(false);
    expect(isRendererEntryUrl(entry, ENTRY_URL)).toBe(false);
  });
});

describe('assertTrustedSender', () => {
  it('accepts the main frame of one of our windows showing the renderer entry', () => {
    const policy = policyFor();

    expect(() => assertTrustedSender(eventFrom(ENTRY_URL), policy)).not.toThrow();
  });

  it('rejects a subframe, even when it shows the renderer entry', () => {
    const policy = policyFor();

    expect(() => assertTrustedSender(eventFrom(ENTRY_URL, { parent: {} }), policy)).toThrow('[UNKNOWN] untrusted sender');
  });

  it('rejects a frame with no sender information', () => {
    const policy = policyFor();

    expect(() => assertTrustedSender({ sender: { id: ownWindow, send: vi.fn() } }, policy)).toThrow('[UNKNOWN] untrusted sender');
    expect(() => assertTrustedSender({ sender: { id: ownWindow, send: vi.fn() }, senderFrame: null }, policy)).toThrow('[UNKNOWN] untrusted sender');
  });

  it('rejects a web contents that is not one of our windows', () => {
    const policy = policyFor([ownWindow]);

    expect(() => assertTrustedSender(eventFrom(ENTRY_URL, { id: 99 }), policy)).toThrow('[UNKNOWN] untrusted sender');
  });

  it('rejects a main frame that navigated somewhere else', () => {
    const policy = policyFor();

    expect(() => assertTrustedSender(eventFrom('https://attacker.example/'), policy)).toThrow('[UNKNOWN] untrusted sender');
  });
});

describe('guardIpc', () => {
  it('runs the handler for trusted senders and passes its result through', async () => {
    const handlers = new Map<string, (event: IpcEvent, ...args: unknown[]) => unknown>();
    const guarded = guardIpc({ handle: (channel, listener) => void handlers.set(channel, listener as never) }, policyFor());
    const handler = vi.fn(() => 'ok');

    guarded.handle('test:channel', handler);

    await expect(Promise.resolve(handlers.get('test:channel')?.(eventFrom(ENTRY_URL), 'arg'))).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledWith(expect.anything(), 'arg');
  });

  it('never runs the handler for an untrusted sender', async () => {
    const handlers = new Map<string, (event: IpcEvent, ...args: unknown[]) => unknown>();
    const guarded = guardIpc({ handle: (channel, listener) => void handlers.set(channel, listener as never) }, policyFor());
    const handler = vi.fn(() => 'secret');

    guarded.handle('settings:get', handler);

    const attempt = Promise.resolve().then(() => handlers.get('settings:get')?.(eventFrom('https://attacker.example/')));
    await expect(attempt).rejects.toThrow('[UNKNOWN] untrusted sender');
    expect(handler).not.toHaveBeenCalled();
  });
});
