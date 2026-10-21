import { basename, extname, join } from 'node:path';
import type { SubtitleTrack } from '../../shared/types/subtitles';

export type ExportFilenameInput = {
  inputPath: string;
  outputFolder: string;
  track: Pick<SubtitleTrack, 'kind' | 'language' | 'targetLanguage'>;
  extension: string;
  pattern?: string;
};

export function buildExportFilename(input: ExportFilenameInput): string {
  const extension = input.extension.startsWith('.') ? input.extension : `.${input.extension}`;
  const sourceName = basename(input.inputPath, extname(input.inputPath));
  const language = input.track.targetLanguage ?? input.track.language;
  const pattern = input.pattern?.trim() || '{name}.{track}';
  const fileName = pattern
    .replaceAll('{name}', sanitizeFilePart(sourceName))
    .replaceAll('{track}', sanitizeFilePart(input.track.kind))
    .replaceAll('{language}', sanitizeFilePart(language));

  return join(input.outputFolder, `${fileName}${extension}`);
}

export function buildCopyFilename(path: string, copyIndex: number): string {
  if (copyIndex < 1 || !Number.isInteger(copyIndex)) {
    throw new Error('copyIndex must be a positive integer.');
  }

  const extension = extname(path);
  const name = path.slice(0, -extension.length);
  return `${name} (${copyIndex + 1})${extension}`;
}

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, 'untitled');
}
