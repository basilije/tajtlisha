import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GenerateSubtitlesRequest, GenerateSubtitlesResult } from '../../shared/types/ai';
import type { SubtitleTrack } from '../../shared/types/subtitles';
import { MediaService } from '../media';
import { validatePath, validateTimeRange } from '../media/contracts';
import type { AiProviderRegistry } from './provider-registry';

export class SubtitleWorkflowService {
  constructor(
    private readonly registry: Pick<AiProviderRegistry, 'transcribe' | 'translate' | 'polishSubtitles'>,
    private readonly mediaService: Pick<MediaService, 'extractAudio'> = new MediaService()
  ) {}

  async generateSubtitles(input: GenerateSubtitlesRequest): Promise<GenerateSubtitlesResult> {
    validatePath(input.inputPath, 'inputPath');
    validatePath(input.targetLanguage, 'targetLanguage');

    if (input.trim) {
      validateTimeRange(input.trim.startMs, input.trim.endMs, input.trim.knownDurationMs);
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-ai-audio-'));
    const audioPath = join(tempDir, 'audio.wav');

    try {
      await this.mediaService.extractAudio({
        inputPath: input.inputPath,
        outputPath: audioPath,
        format: 'wav',
        startMs: input.trim?.startMs,
        endMs: input.trim?.endMs
      });

      const clipDurationMs = input.trim ? input.trim.endMs - input.trim.startMs : input.knownDurationMs ?? 0;
      const transcription = await this.registry.transcribe(input.providerId, {
        audioPath,
        audioFormat: 'wav',
        modelId: input.transcriptionModelId,
        expectedLanguage: input.expectedLanguage,
        autoDetectLanguage: input.autoDetectLanguage,
        clipDurationMs
      });

      const timelineOffsetMs = input.trim?.startMs ?? 0;
      const sourceSegments = offsetSegments(transcription.segments, timelineOffsetMs);
      const originalTrack: SubtitleTrack = {
        id: `original-${transcription.detectedLanguage}`,
        kind: 'original',
        language: transcription.detectedLanguage,
        segments: sourceSegments
      };

      const translatedTrack = await this.registry.translate(input.providerId, {
        sourceLanguage: transcription.detectedLanguage,
        targetLanguage: input.targetLanguage,
        modelId: input.textModelId,
        segments: sourceSegments,
        preserveTiming: true
      });

      const timedTranslation = preserveTrackTiming(translatedTrack, sourceSegments);
      const polishedTrack = input.polish
        ? await this.registry.polishSubtitles(input.providerId, {
            track: timedTranslation,
            modelId: input.textModelId,
            mode: input.polishMode,
            maxCharsPerLine: input.maxCharsPerLine,
            maxLinesPerCaption: input.maxLinesPerCaption
          })
        : timedTranslation;

      return {
        originalTrack,
        translatedTrack: preserveTrackTiming(polishedTrack, sourceSegments)
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function offsetSegments(segments: SubtitleTrack['segments'], offsetMs: number): SubtitleTrack['segments'] {
  if (offsetMs === 0) return segments;
  return segments.map((segment) => ({ ...segment, startMs: segment.startMs + offsetMs, endMs: segment.endMs + offsetMs }));
}

function preserveTrackTiming(track: SubtitleTrack, reference: SubtitleTrack['segments']): SubtitleTrack {
  const byId = new Map(reference.map((segment) => [segment.id, segment]));
  return {
    ...track,
    segments: track.segments.map((segment, index) => {
      const timing = byId.get(segment.id) ?? reference[index];
      return timing ? { ...segment, startMs: timing.startMs, endMs: timing.endMs } : segment;
    })
  };
}
