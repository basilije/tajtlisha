import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BurnSubtitlesRequest, BurnSubtitlesResult } from '../../shared/types/export';
import { FfmpegService } from '../ffmpeg';
import { validatePath } from '../media/contracts';
import { writeSrt } from './srt';

export class SubtitleBurnService {
  constructor(private readonly ffmpeg = new FfmpegService()) {}

  async burnSubtitles(input: BurnSubtitlesRequest): Promise<BurnSubtitlesResult> {
    validatePath(input.inputPath, 'inputPath');
    validatePath(input.outputPath, 'outputPath');

    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-subtitles-'));
    const tempSrtPath = join(tempDir, 'subtitles.srt');

    try {
      await writeSrt({ outputPath: tempSrtPath, track: input.track });
      await this.ffmpeg.run([
        input.overwriteExisting ? '-y' : '-n',
        '-i',
        input.inputPath,
        '-vf',
        `subtitles=${quoteFilterValue(tempSrtPath)}:force_style=${quoteFilterValue(styleToForceStyle(input.style))}`,
        '-c:a',
        'copy',
        input.outputPath
      ]);

      return { outputPath: input.outputPath };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function quoteFilterValue(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function styleToForceStyle(style: BurnSubtitlesRequest['style']): string {
  const alignment = alignmentFor(style.position, style.align);
  const parts = [
    `FontName=${sanitizeForceStyleValue(style.fontFamily)}`,
    `FontSize=${style.fontSizePx}`,
    `PrimaryColour=${hexToAssColor(style.textColor)}`,
    `Bold=${style.fontWeight === 'bold' || style.fontWeight === 'semibold' ? 1 : 0}`,
    `Italic=${style.italic ? 1 : 0}`,
    `Outline=${style.outlineEnabled ? style.outlineWidthPx : 0}`,
    `OutlineColour=${hexToAssColor(style.outlineColor)}`,
    `Shadow=${style.shadowEnabled ? Math.max(style.shadowBlurPx, Math.abs(style.shadowOffsetX), Math.abs(style.shadowOffsetY)) : 0}`,
    `Alignment=${alignment}`
  ];

  return parts.join(',');
}

function sanitizeForceStyleValue(value: string): string {
  return value.replace(/[,']/g, '').trim();
}

function alignmentFor(position: BurnSubtitlesRequest['style']['position'], align: BurnSubtitlesRequest['style']['align']): number {
  const horizontal = align === 'left' ? 1 : align === 'center' ? 2 : 3;
  const verticalOffset = position === 'bottom' ? 0 : position === 'middle' ? 3 : 6;
  return horizontal + verticalOffset;
}

function hexToAssColor(hex: string): string {
  const normalized = hex.replace('#', '').padStart(6, '0').slice(0, 6);
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H00${blue}${green}${red}`;
}
