# Implementation tracker: editor redesign (target v0.2.0)

Orchestrator: Claude Opus 5.5. Implementation: Claude Haiku 5.5 workers in separate worktrees.
Reviews and design questions: GPT-6.1-Sol.
Status values: `todo`, `in progress`, `review`, `merged`, `blocked`.

Background: the audit of v0.1.0 (2026-10-21) found that burned-in subtitles do not match the preview,
OpenAI transcription asks for timestamps the default model cannot return, Settings discards the project,
original and translation have separate timing, generation is all-or-nothing, and there is no packaging
or update path.

## Wave 0: contracts (orchestrator)

| Task | Branch | Status |
| --- | --- | --- |
| Shared project, jobs, errors, style, geometry, IPC, updates contracts; preload; abortable ffmpeg; probe dimensions; bundled fonts | `develop` | merged |

## Wave 1: independent modules

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 1 | ASS generation, single-pass trim+burn export, SRT from caption rows, source protection, progress, cancel | `feat/export-ass` | todo |
| 2 | Transcription with word timestamps (whisper-1), caption builder, speech-detection fallback, strict translation, staged workflow | `feat/ai-transcription` | todo |
| 3 | Renderer project reducer: caption operations, undo/redo, validation, selectors | `feat/renderer-state` | todo |
| 4 | Serbian Latin diacritics in all UI strings | `fix/i18n-diacritics` | todo |
| 5 | electron-builder packaging, electron-updater, CI and release workflows | `build/packaging-autoupdate` | todo |

## Wave 2: wiring and UI parts

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 6 | Main wiring: project store (autosave), job registry, IPC handlers, media protocol | `feat/main-wiring` | todo |
| 7 | Video preview with style overlay, trim bar, style drawer | `feat/editor-preview` | todo |
| 8 | Caption table, generate panel, job bar, export dialog | `feat/editor-captions` | todo |

## Wave 3: integration and release

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 9 | Editor page and app shell integration, Settings cleanup (About and updates), i18n keys, CSS | `feat/editor-integration` | todo |
| 10 | Sol review, E2E against a real clip, preview vs export frame comparison | `develop` | todo |
| 11 | Release v0.2.0 | `release/0.2.0` | todo |

## Open decisions

- Create GitHub repository `blonestar/tajtlisha` (needed for CI, releases and auto-update). Waiting for the owner.
- `whisper-1` (the only OpenAI model with word timestamps) shuts down 2027-02-26. The speech-detection
  fallback keeps the app working after that; revisit when OpenAI documents timestamps for `gpt-transcribe`.

## Log

- 2026-10-21: v0.1.0 tagged (baseline skeleton). `develop` created. Wave 0 contracts committed.
