import { extname } from 'node:path';

/** Inserts ' (n)' before the extension: 'clip.en.srt' with copyIndex 1 becomes 'clip.en (2).srt'. */
export function buildCopyFilename(path: string, copyIndex: number): string {
  if (copyIndex < 1 || !Number.isInteger(copyIndex)) {
    throw new Error('copyIndex must be a positive integer.');
  }

  const extension = extname(path);
  const name = path.slice(0, path.length - extension.length);
  return `${name} (${copyIndex + 1})${extension}`;
}

export function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, 'untitled');
}
