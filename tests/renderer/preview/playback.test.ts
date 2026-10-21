import { describe, expect, it } from 'vitest';
import {
  clampToTrim,
  fitFrame,
  FRAME_MS,
  nextTimeOnPlay,
  reachedTrimEnd,
  stepTime
} from '../../../src/renderer/src/components/preview/playback';
import {
  moveTrimHandle,
  msFromClientX,
  pickTickStep,
  ticksFor,
  timeToPercent
} from '../../../src/renderer/src/components/preview/trimMath';

const trim = { startMs: 1000, endMs: 4000 };

describe('preview playback helpers', () => {
  it('clamps seeks into the trim range', () => {
    expect(clampToTrim(500, trim)).toBe(1000);
    expect(clampToTrim(2500, trim)).toBe(2500);
    expect(clampToTrim(9000, trim)).toBe(4000);
    expect(clampToTrim(Number.NaN, trim)).toBe(1000);
  });

  it('restarts from the trim start when play is pressed at or after the trim end', () => {
    expect(nextTimeOnPlay(4000, trim)).toBe(1000);
    expect(nextTimeOnPlay(4500, trim)).toBe(1000);
    expect(nextTimeOnPlay(3999, trim)).toBe(1000);
    expect(nextTimeOnPlay(2000, trim)).toBe(2000);
    expect(nextTimeOnPlay(0, trim)).toBe(1000);
  });

  it('detects the trim end with a small tolerance', () => {
    expect(reachedTrimEnd(3990, trim)).toBe(false);
    expect(reachedTrimEnd(3999, trim)).toBe(true);
    expect(reachedTrimEnd(4000, trim)).toBe(true);
  });

  it('steps by one frame at 30 fps and stays inside the trim', () => {
    expect(FRAME_MS).toBeCloseTo(33.333, 2);
    expect(stepTime(2000, 1, trim)).toBeCloseTo(2000 + FRAME_MS, 6);
    expect(stepTime(2000, -1, trim)).toBeCloseTo(2000 - FRAME_MS, 6);
    expect(stepTime(1005, -1, trim)).toBe(1000);
    expect(stepTime(3999, 1, trim)).toBe(4000);
  });

  it('fits a 9:16 frame inside wide and narrow areas without distorting it', () => {
    const portrait = 9 / 16;

    expect(fitFrame(800, 400, portrait)).toEqual({ width: 225, height: 400 });
    expect(fitFrame(200, 900, portrait)).toEqual({ width: 200, height: 355 });
    expect(fitFrame(0, 0, portrait)).toEqual({ width: 0, height: 0 });
  });
});

describe('trim bar helpers', () => {
  it('keeps the minimum trim length when moving a handle', () => {
    expect(moveTrimHandle({ startMs: 1000, endMs: 1150 }, 'end', 1000, 10000)).toEqual({
      startMs: 1000,
      endMs: 1100
    });
    expect(moveTrimHandle({ startMs: 1000, endMs: 1150 }, 'start', 9000, 10000)).toEqual({
      startMs: 1050,
      endMs: 1150
    });
  });

  it('limits handles to the source duration and to zero', () => {
    expect(moveTrimHandle({ startMs: 1000, endMs: 5000 }, 'end', 99999, 10000).endMs).toBe(10000);
    expect(moveTrimHandle({ startMs: 1000, endMs: 5000 }, 'start', -500, 10000).startMs).toBe(0);
  });

  it('maps pointer positions and percentages onto the source timeline', () => {
    expect(msFromClientX(150, { left: 100, width: 200 }, 10000)).toBe(2500);
    expect(msFromClientX(50, { left: 100, width: 200 }, 10000)).toBe(0);
    expect(timeToPercent(2500, 10000)).toBe(25);
    expect(timeToPercent(5, 0)).toBe(0);
  });

  it('chooses an adaptive tick step with enough spacing', () => {
    expect(pickTickStep(10000, 600)).toBe(2000);
    expect(pickTickStep(10000, 0)).toBe(60000);
    expect(ticksFor(3000, 1000)).toEqual([0, 1000, 2000, 3000]);
  });
});
