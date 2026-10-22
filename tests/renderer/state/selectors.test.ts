import { describe, expect, it } from 'vitest';
import type { CaptionRow, ProjectDocument, TrimRange } from '../../../src/shared/types/project';
import { createEmptyProject } from '../../../src/renderer/src/state/project-reducer';
import {
  blockingIssueCount,
  captionsInTrim,
  findActiveCaption,
  rowsNeedingTranslation,
  validateCaptions,
  workflowStep,
  type CaptionIssueCode,
  type CaptionIssueMap
} from '../../../src/renderer/src/state/selectors';

const trim: TrimRange = { startMs: 0, endMs: 10000 };

/** Translated rows are up to date by default: the translation was made from the current original. */
function caption(id: string, startMs: number, endMs: number, original = 'hello', translation = 'zdravo'): CaptionRow {
  return { id, startMs, endMs, original, translation, translatedFrom: original };
}

function codesOf(issues: CaptionIssueMap, id: string): CaptionIssueCode[] {
  return issues[id].map((issue) => issue.code);
}

const options = { requireTranslation: true, maxCharsPerLine: 20, targetLanguage: 'sr-Latn', translationLanguage: 'sr-Latn' };

describe('findActiveCaption', () => {
  const captions = [caption('a', 0, 1000), caption('b', 1500, 2500), caption('c', 3000, 4000)];

  it('treats start as inclusive and end as exclusive', () => {
    expect(findActiveCaption(captions, 0)?.id).toBe('a');
    expect(findActiveCaption(captions, 999)?.id).toBe('a');
    expect(findActiveCaption(captions, 1000)).toBeUndefined();
    expect(findActiveCaption(captions, 1500)?.id).toBe('b');
    expect(findActiveCaption(captions, 2499)?.id).toBe('b');
    expect(findActiveCaption(captions, 2500)).toBeUndefined();
  });

  it('finds captions at the first and last positions', () => {
    expect(findActiveCaption(captions, 3999)?.id).toBe('c');
    expect(findActiveCaption(captions, 4000)).toBeUndefined();
    expect(findActiveCaption(captions, -1)).toBeUndefined();
  });

  it('returns undefined in gaps, for empty lists and for NaN', () => {
    expect(findActiveCaption(captions, 1200)).toBeUndefined();
    expect(findActiveCaption([], 0)).toBeUndefined();
    expect(findActiveCaption(captions, Number.NaN)).toBeUndefined();
  });

  it('handles a single caption at both boundaries', () => {
    const single = [caption('only', 500, 900)];

    expect(findActiveCaption(single, 499)).toBeUndefined();
    expect(findActiveCaption(single, 500)?.id).toBe('only');
    expect(findActiveCaption(single, 900)).toBeUndefined();
  });
});

describe('validateCaptions', () => {
  it('returns an entry for every caption, empty when clean', () => {
    const issues = validateCaptions([caption('a', 0, 1000)], trim, options);

    expect(issues).toEqual({ a: [] });
  });

  it('flags end_before_start and not too_short for inverted captions', () => {
    const issues = validateCaptions([caption('a', 2000, 1000)], trim, options);

    expect(codesOf(issues, 'a')).toEqual(['end_before_start']);
  });

  it('flags too_short below 300 ms but not at exactly 300 ms', () => {
    const issues = validateCaptions([caption('short', 0, 299), caption('ok', 1000, 1300)], trim, options);

    expect(codesOf(issues, 'short')).toContain('too_short');
    expect(codesOf(issues, 'ok')).not.toContain('too_short');
  });

  it('flags zero-length captions as too_short', () => {
    const issues = validateCaptions([caption('zero', 500, 500)], trim, options);

    expect(codesOf(issues, 'zero')).toEqual(['too_short']);
  });

  it('flags overlaps_previous with the overlap amount', () => {
    const issues = validateCaptions(
      [caption('a', 0, 1000), caption('b', 800, 1800)],
      trim,
      options
    );

    expect(issues.b).toEqual([{ code: 'overlaps_previous', overlapMs: 200 }]);
    expect(issues.a).toEqual([]);
  });

  it('does not flag touching captions as overlapping', () => {
    const issues = validateCaptions([caption('a', 0, 1000), caption('b', 1000, 2000)], trim, options);

    expect(codesOf(issues, 'b')).not.toContain('overlaps_previous');
  });

  it('flags a row overlapping a long earlier row that is not its immediate predecessor', () => {
    const issues = validateCaptions(
      [caption('long', 0, 5000), caption('mid', 1000, 1500), caption('late', 2000, 3000)],
      trim,
      options
    );

    expect(issues.late).toEqual([{ code: 'overlaps_previous', overlapMs: 3000 }]);
  });

  it('flags outside_trim when the caption starts before or ends after the trim', () => {
    const narrow: TrimRange = { startMs: 1000, endMs: 5000 };
    const issues = validateCaptions(
      [caption('early', 500, 1500), caption('inside', 2000, 3000), caption('late', 4500, 5500)],
      narrow,
      options
    );

    expect(codesOf(issues, 'early')).toContain('outside_trim');
    expect(codesOf(issues, 'inside')).not.toContain('outside_trim');
    expect(codesOf(issues, 'late')).toContain('outside_trim');
  });

  it('flags empty_original for blank and whitespace-only text', () => {
    const issues = validateCaptions(
      [caption('blank', 0, 1000, '', 'x'), caption('spaces', 1000, 2000, '   ', 'x')],
      trim,
      options
    );

    expect(codesOf(issues, 'blank')).toContain('empty_original');
    expect(codesOf(issues, 'spaces')).toContain('empty_original');
  });

  it('flags empty_translation only when translation is required', () => {
    const captions = [caption('a', 0, 1000, 'hi', '  ')];

    expect(codesOf(validateCaptions(captions, trim, options), 'a')).toContain('empty_translation');
    expect(
      codesOf(validateCaptions(captions, trim, { ...options, requireTranslation: false }), 'a')
    ).not.toContain('empty_translation');
  });

  it('flags line_too_long only above maxCharsPerLine + 10 on any line of either text', () => {
    // maxCharsPerLine 20 -> limit 30.
    const exact = 'x'.repeat(30);
    const over = 'x'.repeat(31);
    const issues = validateCaptions(
      [
        caption('ok', 0, 1000, exact, exact),
        caption('translation-long', 1000, 2000, 'short', 'a\n' + over),
        caption('original-long', 2000, 3000, over, 'short')
      ],
      trim,
      options
    );

    expect(codesOf(issues, 'ok')).not.toContain('line_too_long');
    expect(codesOf(issues, 'translation-long')).toContain('line_too_long');
    expect(codesOf(issues, 'original-long')).toContain('line_too_long');
  });

  it('does not depend on input order for overlap detection', () => {
    const issues = validateCaptions([caption('b', 800, 1800), caption('a', 0, 1000)], trim, options);

    expect(issues.b).toEqual([{ code: 'overlaps_previous', overlapMs: 200 }]);
  });
});

describe('blockingIssueCount', () => {
  it('counts only end_before_start, overlaps_previous and empty_translation', () => {
    const issues: CaptionIssueMap = {
      a: [{ code: 'end_before_start' }, { code: 'too_short' }],
      b: [{ code: 'overlaps_previous', overlapMs: 10 }, { code: 'outside_trim' }],
      c: [{ code: 'empty_translation' }, { code: 'empty_original' }, { code: 'line_too_long' }]
    };

    expect(blockingIssueCount(issues)).toBe(3);
  });

  it('accepts a single caption issue list', () => {
    expect(blockingIssueCount([{ code: 'empty_translation' }, { code: 'empty_original' }])).toBe(1);
  });

  it('is zero for a clean validation result', () => {
    const issues = validateCaptions([caption('a', 0, 1000), caption('b', 1000, 2000)], trim, options);

    expect(blockingIssueCount(issues)).toBe(0);
  });

  it('counts empty_translation from a real validation run', () => {
    const issues = validateCaptions([caption('a', 0, 1000, 'hi', '')], trim, options);

    expect(blockingIssueCount(issues)).toBe(1);
  });
});

describe('captionsInTrim', () => {
  it('keeps captions that overlap the trim range', () => {
    const range: TrimRange = { startMs: 1000, endMs: 3000 };
    const result = captionsInTrim(
      [caption('before', 0, 1000), caption('partial', 500, 1500), caption('inside', 1500, 2500), caption('after', 3000, 4000)],
      range
    );

    expect(result.map((item) => item.id)).toEqual(['partial', 'inside']);
  });

  it('returns an empty list when nothing overlaps', () => {
    expect(captionsInTrim([caption('a', 0, 100)], { startMs: 500, endMs: 900 })).toEqual([]);
  });
});

describe('workflowStep', () => {
  function project(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
    return {
      ...createEmptyProject({ targetLanguage: 'sr-Latn' }),
      ...overrides
    };
  }

  const source = {
    inputPath: '/clips/a.mp4',
    fileUrl: 'tajtlisha-media://a',
    durationMs: 10000,
    width: 1280,
    height: 720,
    hasAudio: true,
    fileSizeBytes: 1000,
    mtimeMs: 1700000000000
  };

  it('is import without a source', () => {
    expect(workflowStep(project())).toBe('import');
  });

  it('is trim with a source and no captions', () => {
    expect(workflowStep(project({ source }))).toBe('trim');
  });

  it('is translate when some captions have no translation', () => {
    const captions = [caption('a', 0, 1000, 'hi', 'zdravo'), caption('b', 1000, 2000, 'yo', '   ')];

    expect(workflowStep(project({ source, captions }))).toBe('translate');
  });

  it('is review when every caption is translated and up to date', () => {
    const captions = [caption('a', 0, 1000, 'hi', 'zdravo'), caption('b', 1000, 2000, 'yo', 'hej')];

    expect(workflowStep(project({ source, captions, translationLanguage: 'sr-Latn' }))).toBe('review');
  });

  it('is translate when a translation is stale, even though none is empty', () => {
    const captions = [{ ...caption('a', 0, 1000, 'hi', 'zdravo'), translatedFrom: 'ho' }];

    expect(workflowStep(project({ source, captions, translationLanguage: 'sr-Latn' }))).toBe('translate');
  });

  it('is translate when the translations are in another language', () => {
    const captions = [caption('a', 0, 1000, 'hi', 'zdravo')];

    expect(workflowStep(project({ source, captions, translationLanguage: 'de' }))).toBe('translate');
  });
});

describe('stale translations', () => {
  const opts = { requireTranslation: true, maxCharsPerLine: 20, targetLanguage: 'sr-Latn', translationLanguage: 'sr-Latn' };

  it('flags a non-empty translation made from older original text as a non-blocking warning', () => {
    const captions = [{ ...caption('a', 0, 1000, 'new text', 'stari tekst'), translatedFrom: 'old text' }];
    const issues = validateCaptions(captions, trim, opts);

    expect(codesOf(issues, 'a')).toEqual(['stale_translation']);
    expect(blockingIssueCount(issues)).toBe(0);
  });

  it('flags every translation when translationLanguage differs from the target', () => {
    const captions = [caption('a', 0, 1000)];
    const issues = validateCaptions(captions, trim, { ...opts, translationLanguage: 'de' });

    expect(codesOf(issues, 'a')).toContain('stale_translation');
  });

  it('flags every translation when translationLanguage is unknown', () => {
    const captions = [caption('a', 0, 1000)];
    const issues = validateCaptions(captions, trim, { ...opts, translationLanguage: undefined });

    expect(codesOf(issues, 'a')).toContain('stale_translation');
  });

  it('never flags an empty translation as stale; it is empty_translation instead', () => {
    const captions = [{ ...caption('a', 0, 1000, 'hi', ''), translatedFrom: 'old' }];
    const codes = codesOf(validateCaptions(captions, trim, opts), 'a');

    expect(codes).toContain('empty_translation');
    expect(codes).not.toContain('stale_translation');
  });

  it('does not flag an up-to-date translation in the target language', () => {
    expect(codesOf(validateCaptions([caption('a', 0, 1000)], trim, opts), 'a')).toEqual([]);
  });

  it('lists rows whose translation is empty or stale, in caption order', () => {
    const project: ProjectDocument = {
      ...createEmptyProject({ targetLanguage: 'sr-Latn' }),
      translationLanguage: 'sr-Latn',
      captions: [
        caption('fresh', 0, 1000),
        caption('empty', 1000, 2000, 'x', ''),
        { ...caption('stale', 2000, 3000, 'new', 'stari'), translatedFrom: 'old' }
      ]
    };

    expect(rowsNeedingTranslation(project)).toEqual(['empty', 'stale']);
  });

  it('lists every non-empty row when translationLanguage differs from the target', () => {
    const project: ProjectDocument = {
      ...createEmptyProject({ targetLanguage: 'sr-Latn' }),
      translationLanguage: 'de',
      captions: [caption('a', 0, 1000), caption('b', 1000, 2000, 'x', '')]
    };

    expect(rowsNeedingTranslation(project)).toEqual(['a', 'b']);
  });

  it('lists nothing when every row is translated and fresh', () => {
    const project: ProjectDocument = {
      ...createEmptyProject({ targetLanguage: 'sr-Latn' }),
      translationLanguage: 'sr-Latn',
      captions: [caption('a', 0, 1000)]
    };

    expect(rowsNeedingTranslation(project)).toEqual([]);
  });
});
