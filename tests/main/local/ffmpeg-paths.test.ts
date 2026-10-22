import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFfmpegPaths } from '../../../src/main/ffmpeg/paths';

const resources = path.join('/opt/Tajtlisha', 'resources');
const bundledDir = path.join(resources, 'ffmpeg');
const filesystem = (files: string[]) => (file: string) => files.includes(file);

describe('resolveFfmpegPaths', () => {
  it('prefers both env overrides over bundled and system binaries', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: resources,
      platform: 'linux',
      env: { TAJTLISHA_FFMPEG_PATH: '/custom/ffmpeg', TAJTLISHA_FFPROBE_PATH: '/custom/ffprobe' },
      exists: filesystem([path.join(bundledDir, 'ffmpeg'), path.join(bundledDir, 'ffprobe')])
    });

    expect(result).toEqual({ ffmpegPath: '/custom/ffmpeg', ffprobePath: '/custom/ffprobe', source: 'env' });
  });

  it('ignores a single env override and falls through to the bundled pair', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: resources,
      platform: 'linux',
      env: { TAJTLISHA_FFMPEG_PATH: '/custom/ffmpeg' },
      exists: filesystem([path.join(bundledDir, 'ffmpeg'), path.join(bundledDir, 'ffprobe')])
    });

    expect(result.source).toBe('bundled');
    expect(result.ffmpegPath).toBe(path.join(bundledDir, 'ffmpeg'));
  });

  it('trims env values and treats blank ones as unset', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: undefined,
      platform: 'linux',
      env: { TAJTLISHA_FFMPEG_PATH: '  /a/ffmpeg  ', TAJTLISHA_FFPROBE_PATH: '   ' },
      exists: () => false
    });

    expect(result).toEqual({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', source: 'system' });
  });

  it('uses the bundled Linux pair when both files exist', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: resources,
      platform: 'linux',
      env: {},
      exists: filesystem([path.join(bundledDir, 'ffmpeg'), path.join(bundledDir, 'ffprobe')])
    });

    expect(result).toEqual({
      ffmpegPath: path.join(bundledDir, 'ffmpeg'),
      ffprobePath: path.join(bundledDir, 'ffprobe'),
      source: 'bundled'
    });
  });

  it('uses the bundled Windows pair with .exe names', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: 'C:\\Program Files\\Tajtlisha\\resources',
      platform: 'win32',
      env: {},
      exists: filesystem([
        path.join('C:\\Program Files\\Tajtlisha\\resources', 'ffmpeg', 'ffmpeg.exe'),
        path.join('C:\\Program Files\\Tajtlisha\\resources', 'ffmpeg', 'ffprobe.exe')
      ])
    });

    expect(result.source).toBe('bundled');
    expect(path.basename(result.ffmpegPath)).toBe('ffmpeg.exe');
    expect(path.basename(result.ffprobePath)).toBe('ffprobe.exe');
    expect(path.dirname(result.ffmpegPath)).toBe(path.join('C:\\Program Files\\Tajtlisha\\resources', 'ffmpeg'));
  });

  it('does not use a partial bundled install', () => {
    const result = resolveFfmpegPaths({
      resourcesPath: resources,
      platform: 'linux',
      env: {},
      exists: filesystem([path.join(bundledDir, 'ffmpeg')])
    });

    expect(result).toEqual({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', source: 'system' });
  });

  it('falls back to PATH names when nothing is bundled, with .exe names on Windows', () => {
    expect(resolveFfmpegPaths({ resourcesPath: resources, platform: 'linux', env: {}, exists: () => false })).toEqual({
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
      source: 'system'
    });

    expect(resolveFfmpegPaths({ resourcesPath: undefined, platform: 'win32', env: {}, exists: () => false })).toEqual({
      ffmpegPath: 'ffmpeg.exe',
      ffprobePath: 'ffprobe.exe',
      source: 'system'
    });
  });

  it('never checks bundled paths when resourcesPath is undefined (plain Node, dev runs)', () => {
    const checked: string[] = [];
    const result = resolveFfmpegPaths({
      resourcesPath: undefined,
      platform: 'linux',
      env: {},
      exists: (file) => {
        checked.push(file);
        return true;
      }
    });

    expect(checked).toEqual([]);
    expect(result.source).toBe('system');
  });
});
