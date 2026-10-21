import { writeFile } from 'node:fs/promises';
import type { BurnSubtitlesRequest, BurnSubtitlesResult, WriteSrtRequest, WriteSrtResult } from '../../shared/types/export';
import { serializeSrt } from './srt';
import { SubtitleBurnService } from './burn-subtitles';

export async function writeSrtFile(input: WriteSrtRequest): Promise<WriteSrtResult> {
  const content = serializeSrt(input.track);
  await writeFile(input.outputPath, content, 'utf8');
  return {
    outputPath: input.outputPath,
    segmentCount: input.track.segments.length
  };
}

export async function burnSubtitles(input: BurnSubtitlesRequest): Promise<BurnSubtitlesResult> {
  return new SubtitleBurnService().burnSubtitles(input);
}
