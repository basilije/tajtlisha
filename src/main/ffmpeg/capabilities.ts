import type { FfmpegService } from './ffmpeg-service';
import { runProcess } from './process';

export type FfmpegCapabilities = {
  ffmpeg: boolean;
  ffprobe: boolean;
  assFilter: boolean;
  libx264: boolean;
  aac: boolean;
  mp3: boolean;
  /** Version number from `ffprobe -version`, e.g. '8.1.3'. */
  version?: string;
  /** Human-readable names of what the app needs and does not have. */
  missing: string[];
};

const CAPABILITY_TIMEOUT_MS = 3000;

/**
 * Probes the installed ffmpeg/ffprobe once. Each command is independent, so a
 * missing ffprobe does not hide a working ffmpeg. Never throws.
 */
export async function checkFfmpegCapabilities(ffmpeg: Pick<FfmpegService, 'ffmpegPath' | 'ffprobePath'>): Promise<FfmpegCapabilities> {
  const [filters, encoders, versionOutput] = await Promise.all([
    tryRun(ffmpeg.ffmpegPath, ['-hide_banner', '-filters']),
    tryRun(ffmpeg.ffmpegPath, ['-hide_banner', '-encoders']),
    tryRun(ffmpeg.ffprobePath, ['-version'])
  ]);

  const filterNames = filters === undefined ? new Set<string>() : parseFilterNames(filters);
  const encoderNames = encoders === undefined ? new Set<string>() : parseEncoderNames(encoders);

  const capabilities = {
    ffmpeg: filters !== undefined,
    ffprobe: versionOutput !== undefined,
    assFilter: filterNames.has('ass'),
    libx264: encoderNames.has('libx264'),
    aac: encoderNames.has('aac'),
    // MP3 export (audio extraction) is encoded with LAME.
    mp3: encoderNames.has('libmp3lame'),
    version: versionOutput === undefined ? undefined : parseFfprobeVersion(versionOutput)
  };

  return { ...capabilities, missing: missingCapabilities(capabilities) };
}

/** Filter names from `ffmpeg -filters`. Flag columns are three characters, e.g. ` ..C ass  V->V  Render ...`. */
export function parseFilterNames(text: string): Set<string> {
  return namesFrom(text, /^\s*[.TSC]{3}\s+([a-z0-9_]+)\s/);
}

/** Encoder names from `ffmpeg -encoders`. Flag columns are six characters, e.g. ` V....D libx264  H.264 ...`. */
export function parseEncoderNames(text: string): Set<string> {
  return namesFrom(text, /^\s*[VAS.][.FSXBD]{5}\s+([a-z0-9_]+)\s/);
}

/** The version from the first line, e.g. 'ffprobe version 8.1.3-static Copyright ...' -> '8.1.3'. */
export function parseFfprobeVersion(text: string): string | undefined {
  const match = /version\s+(\S+)/.exec(text.split(/\r?\n/)[0] ?? '');
  return match?.[1];
}

function namesFrom(text: string, pattern: RegExp): Set<string> {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

function missingCapabilities(capabilities: Omit<FfmpegCapabilities, 'missing'>): string[] {
  const checks: Array<[boolean, string]> = [
    [capabilities.ffmpeg, 'ffmpeg'],
    [capabilities.ffprobe, 'ffprobe'],
    [capabilities.assFilter, 'ass filter (libass)'],
    [capabilities.libx264, 'libx264 encoder'],
    [capabilities.aac, 'aac encoder'],
    [capabilities.mp3, 'libmp3lame encoder']
  ];
  return checks.filter(([present]) => !present).map(([, name]) => name);
}

/** Undefined when the command cannot run or exits non-zero; the caller reports it as missing. */
async function tryRun(command: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await runProcess(command, args, { timeoutMs: CAPABILITY_TIMEOUT_MS });
    return result.stdout;
  } catch {
    return undefined;
  }
}
