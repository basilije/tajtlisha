import type {
  AudioExtractRequest,
  AudioExtractResult,
  MediaProbeRequest,
  MediaProbeResult,
  TrimRequest,
  TrimResult
} from '../../shared/types/media';
import { FfmpegService } from '../ffmpeg';
import { millisecondsToSeconds, validateAudioExtractRequest, validatePath, validateTrimRequest } from './contracts';

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
};

export type MediaRunOptions = {
  signal?: AbortSignal;
  onProgress?: (outTimeMs: number) => void;
};

type FfprobePayload = {
  format?: {
    duration?: string;
  };
  streams?: FfprobeStream[];
};

export class MediaService {
  constructor(private readonly ffmpeg = new FfmpegService()) {}

  getFfmpegStatus() {
    return this.ffmpeg.getStatus();
  }

  async probe(input: MediaProbeRequest): Promise<MediaProbeResult> {
    validatePath(input.inputPath, 'inputPath');

    const result = await this.ffmpeg.ffprobe([
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-show_streams',
      '-of',
      'json',
      input.inputPath
    ]);
    const payload = JSON.parse(result.stdout) as FfprobePayload;
    const durationSeconds = payload.format?.duration ? Number(payload.format.duration) : undefined;
    const videoStream = payload.streams?.find((stream) => stream.codec_type === 'video');
    const displaySize = videoStream ? displaySizeOf(videoStream) : undefined;

    return {
      inputPath: input.inputPath,
      durationMs: durationSeconds !== undefined && Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : undefined,
      hasAudio: payload.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
      hasVideo: Boolean(videoStream),
      width: displaySize?.width,
      height: displaySize?.height
    };
  }

  async trim(input: TrimRequest, options: MediaRunOptions = {}): Promise<TrimResult> {
    validateTrimRequest(input);

    const durationMs = input.endMs - input.startMs;
    await this.ffmpeg.run([
      '-y',
      '-i',
      input.inputPath,
      // Input-side seeking with stream copy is keyframe-boundary based. Keep
      // seeking after the input and re-encode A/V so the requested boundaries
      // are frame/sample accurate.
      '-ss',
      millisecondsToSeconds(input.startMs),
      '-t',
      millisecondsToSeconds(durationMs),
      '-map',
      '0:v:0?',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-avoid_negative_ts',
      'make_zero',
      input.outputPath
    ], options);

    return {
      outputPath: input.outputPath,
      durationMs
    };
  }

  async createPreviewProxy(inputPath: string, outputPath: string, options: MediaRunOptions = {}): Promise<void> {
    validatePath(inputPath, 'inputPath');
    validatePath(outputPath, 'outputPath');

    await this.ffmpeg.run([
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath
    ], options);
  }

  async extractAudio(input: AudioExtractRequest, options: MediaRunOptions = {}): Promise<AudioExtractResult> {
    validateAudioExtractRequest(input);

    const args = ['-y'];
    if (input.startMs !== undefined) {
      args.push('-ss', millisecondsToSeconds(input.startMs));
    }

    args.push('-i', input.inputPath);

    if (input.endMs !== undefined) {
      const durationMs = input.endMs - (input.startMs ?? 0);
      args.push('-t', millisecondsToSeconds(durationMs));
    }

    args.push('-vn');
    args.push(...audioCodecArgs(input.format));
    args.push(input.outputPath);

    await this.ffmpeg.run(args, options);

    return {
      outputPath: input.outputPath,
      format: input.format,
      durationMs: input.endMs !== undefined ? input.endMs - (input.startMs ?? 0) : undefined
    };
  }
}

function displaySizeOf(stream: FfprobeStream): { width: number; height: number } | undefined {
  if (!stream.width || !stream.height) return undefined;
  const sideRotation = stream.side_data_list?.find((entry) => typeof entry.rotation === 'number')?.rotation;
  const rotation = Math.abs(Number(sideRotation ?? stream.tags?.rotate ?? 0)) % 180;
  return rotation === 90 ? { width: stream.height, height: stream.width } : { width: stream.width, height: stream.height };
}

function audioCodecArgs(format: AudioExtractRequest['format']): string[] {
  switch (format) {
    case 'wav':
      return ['-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000'];
    case 'mp3':
      return ['-acodec', 'libmp3lame', '-q:a', '2'];
    case 'm4a':
      return ['-acodec', 'aac', '-b:a', '128k'];
  }
}
