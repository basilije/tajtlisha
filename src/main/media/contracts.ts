import type { AudioExtractRequest, TrimRequest } from '../../shared/types/media';

export function validateTrimRequest(input: TrimRequest): void {
  validatePath(input.inputPath, 'inputPath');
  validatePath(input.outputPath, 'outputPath');
  validateTimeRange(input.startMs, input.endMs, input.knownDurationMs);
}

export function validateAudioExtractRequest(input: AudioExtractRequest): void {
  validatePath(input.inputPath, 'inputPath');
  validatePath(input.outputPath, 'outputPath');

  if (!['wav', 'mp3', 'm4a'].includes(input.format)) {
    throw new Error(`Unsupported audio format: ${input.format}`);
  }

  if (input.startMs !== undefined || input.endMs !== undefined) {
    validateTimeRange(input.startMs ?? 0, input.endMs);
  }
}

export function validatePath(pathValue: string, fieldName: string): void {
  if (!pathValue || pathValue.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

export function validateTimeRange(startMs: number, endMs?: number, knownDurationMs?: number): void {
  if (!Number.isFinite(startMs) || startMs < 0) {
    throw new Error('startMs must be a non-negative number.');
  }

  if (endMs !== undefined && (!Number.isFinite(endMs) || endMs <= startMs)) {
    throw new Error('endMs must be greater than startMs.');
  }

  if (knownDurationMs !== undefined && endMs !== undefined && endMs > knownDurationMs) {
    throw new Error('endMs cannot exceed knownDurationMs.');
  }
}

export function millisecondsToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}
