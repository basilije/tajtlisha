import { describe, expect, it } from 'vitest';
import { blockingIssueCount } from '../../../src/renderer/src/state/selectors';
import {
  captionIssuesFor,
  captionsForExport,
  defaultExportOutputs,
  folderOf,
  optionalModelId,
  outputsNeedTranslation,
  polishFor,
  sanitizeBaseName,
  spokenLanguageOf,
  staleCaptionIds
} from '../../../src/renderer/src/hooks/workspaceModel';
import { caption, makeProject, SETTINGS } from './fixtures';

describe('export file names', () => {
  it('drops the extension and replaces characters that break file names', () => {
    expect(sanitizeBaseName('Intro: part/2.mp4')).toBe('Intro- part-2');
    expect(sanitizeBaseName('  spaced   name  .MOV')).toBe('spaced name');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeBaseName('.mp4')).toBe('subtitles');
    expect(sanitizeBaseName('***.mp4')).toBe('---');
  });

  it('finds the folder of a path on both separators and at the root', () => {
    expect(folderOf('/home/bojan/Videos/intro.mp4')).toBe('/home/bojan/Videos');
    expect(folderOf('C:\\Clips\\intro.mp4')).toBe('C:\\Clips');
    expect(folderOf('/intro.mp4')).toBe('/');
    expect(folderOf('intro.mp4')).toBe('');
  });
});

describe('language and polish mapping', () => {
  it('treats the unknown code as detect-automatically for transcription', () => {
    expect(spokenLanguageOf(makeProject({ sourceLanguage: 'und' }))).toBeUndefined();
    expect(spokenLanguageOf(makeProject({ sourceLanguage: undefined }))).toBeUndefined();
    expect(spokenLanguageOf(makeProject({ sourceLanguage: 'sr-Latn' }))).toBe('sr-Latn');
  });

  it('maps the polish settings to the request mode', () => {
    expect(polishFor({ ...SETTINGS, aiConnector: { ...SETTINGS.aiConnector, socialCaptionPolish: true } })).toBe(
      'social_caption'
    );
    expect(polishFor(SETTINGS)).toBe('conservative');
    expect(
      polishFor({
        ...SETTINGS,
        aiConnector: { ...SETTINGS.aiConnector, conservativePolish: false, socialCaptionPolish: false }
      })
    ).toBe('none');
  });

  it('takes the default outputs and burned-in track from settings', () => {
    expect(defaultExportOutputs(SETTINGS)).toEqual({ originalSrt: true, translationSrt: true, video: 'translation' });
    expect(outputsNeedTranslation({ originalSrt: true, translationSrt: false, video: 'original' })).toBe(false);
    expect(outputsNeedTranslation({ originalSrt: true, translationSrt: false, video: 'translation' })).toBe(true);
  });
});

describe('caption issues for the workspace', () => {
  it('reports rows made from older text as stale, not blocking', () => {
    const project = makeProject({
      captions: [
        caption('ok', 500, 2500, 'Prvi', 'First'),
        { ...caption('old', 3000, 5000, 'Drugi', 'Second'), translatedFrom: 'Drugi stari' }
      ]
    });
    const issues = captionIssuesFor(project, SETTINGS, false);

    expect(staleCaptionIds(issues)).toEqual(new Set(['old']));
    expect(issues.ok).toEqual([]);
  });

  it('makes empty translations blocking only when requested', () => {
    const project = makeProject({ captions: [caption('todo', 500, 2500, 'Prvi')] });

    expect(captionIssuesFor(project, SETTINGS, false).todo.map((issue) => issue.code)).not.toContain(
      'empty_translation'
    );
    expect(captionIssuesFor(project, SETTINGS, true).todo.map((issue) => issue.code)).toContain('empty_translation');
  });

  it('clips export captions to the trim and drops captions outside it', () => {
    const project = makeProject({
      trim: { startMs: 1000, endMs: 3000 },
      captions: [
        caption('before', 0, 900, 'a'),
        caption('edge', 800, 1500, 'b'),
        caption('inside', 1500, 2500, 'c'),
        caption('tail', 2900, 4000, 'd'),
        caption('after', 3500, 4500, 'e')
      ]
    });

    const exported = captionsForExport(project);
    expect(exported.map((item) => item.id)).toEqual(['edge', 'inside', 'tail']);
    expect(exported[0]).toMatchObject({ startMs: 1000, endMs: 1500 });
    expect(exported[2]).toMatchObject({ startMs: 2900, endMs: 3000 });
  });

  it('does not let captions outside the trim block the export or count as missing translations', () => {
    const project = makeProject({
      trim: { startMs: 1000, endMs: 3000 },
      captions: [
        caption('outside', 4000, 5000, 'lost', ''),
        caption('inside', 1500, 2500, 'kept', 'zadrzano')
      ]
    });

    const exported = { ...project, captions: captionsForExport(project) };
    expect(blockingIssueCount(captionIssuesFor(exported, SETTINGS, true))).toBe(0);
    expect(exported.captions.filter((item) => item.translation.trim() === '')).toHaveLength(0);
    expect(blockingIssueCount(captionIssuesFor(project, SETTINGS, true))).toBeGreaterThan(0);
  });

  it('treats blank model ids as Default, so no model id is sent', () => {
    expect(optionalModelId('')).toBeUndefined();
    expect(optionalModelId('   ')).toBeUndefined();
    expect(optionalModelId(undefined)).toBeUndefined();
    expect(optionalModelId(' whisper-1 ')).toBe('whisper-1');
  });
});
