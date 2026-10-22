import { AppError } from '../../shared/errors';

/**
 * Input paths this session has handed to the renderer: from the file picker, or
 * from a project loaded with a playable video. Media IPC accepts only these, so
 * a renderer cannot point ffmpeg or the protocol at an arbitrary file.
 */
export class KnownSources {
  private readonly paths = new Set<string>();

  remember(path: string): void {
    this.paths.add(path);
  }

  has(path: string): boolean {
    return this.paths.has(path);
  }
}

export function requireKnownSource(sources: Pick<KnownSources, 'has'>, inputPath: string): string {
  if (!sources.has(inputPath)) {
    throw new AppError('UNKNOWN', 'inputPath is not an open video. Select the video again.');
  }
  return inputPath;
}
