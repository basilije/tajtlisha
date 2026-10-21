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

    return {
      inputPath: input.inputPath,
      durationMs: durationSeconds !== undefined && Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : undefined,
      hasAudio: payload.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
      hasVideo: payload.streams?.some((stream) => stream.codec_type === 'video') ?? false
    };
  }

  async trim(input: TrimRequest): Promise<TrimResult> {
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
    ]);

    return {
      outputPath: input.outputPath,
      durationMs
    };
  }

  async createPreviewProxy(inputPath: string, outputPath: string): Promise<void> {
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
    ]);
  }

  async extractAudio(input: AudioExtractRequest): Promise<AudioExtractResult> {
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

    await this.ffmpeg.run(args);

    return {
      outputPath: input.outputPath,
      format: input.format,
      durationMs: input.endMs !== undefined ? input.endMs - (input.startMs ?? 0) : undefined
    };
  }
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
