import { AppError } from '../../shared/errors';
import type { MediaProbeRequest, MediaProbeResult } from '../../shared/types/media';
import { MediaService } from '../media';

export type ProbeFn = (input: MediaProbeRequest) => Promise<MediaProbeResult>;

export type VideoSize = {
  width: number;
  height: number;
};

export function defaultProbe(): ProbeFn {
  const media = new MediaService();
  return (input) => media.probe(input);
}

/**
 * Display size of the source video as ffprobe reports it (rotation applied,
 * sample aspect ratio folded into the width). The size a caller sends with the
 * request is not trusted: it can be stale or belong to another file.
 */
export async function probeVideoSize(probe: ProbeFn, inputPath: string): Promise<VideoSize> {
  const result = await probe({ inputPath });
  if (!result.hasVideo || !result.width || !result.height) {
    throw new AppError('UNKNOWN', 'The source file has no readable video stream.');
  }

  return { width: result.width, height: result.height };
}
