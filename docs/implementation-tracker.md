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
| 1 | ASS generation, single-pass trim+burn export, SRT from caption rows, source protection, progress, cancel | `feat/export-ass` | merged |
| 2 | Transcription with word timestamps (whisper-1), caption builder, speech-detection fallback, strict translation, staged workflow | `feat/ai-transcription` | merged |
| 3 | Renderer project reducer: caption operations, undo/redo, validation, selectors | `feat/renderer-state` | merged |
| 3b | State follow-up: revision in document, stale translations, relink, load result, dirty flag, job context | `feat/renderer-state-followup` | in progress |
| 4 | Serbian Latin diacritics in all UI strings | `fix/i18n-diacritics` | merged |
| 5 | electron-builder packaging, electron-updater, CI and release workflows | `build/packaging-autoupdate` | merged |
| 1b | Export follow-up: shared font factor, WrapStyle 2, SAR scaling, re-probe, paused-frame render, ffmpeg capability check | `feat/export-followup` | merged |
| 5b | Windows NSIS installer, bundled static ffmpeg/ffprobe for Windows and Linux, CI release matrix (ubuntu + windows) | `build/windows-installer` | in progress |

## Wave 2: wiring and UI parts

| # | Task | Branch | Status |
| --- | --- | --- | --- |
| 6 | Main wiring: project store (autosave), job registry, IPC handlers, media protocol | `feat/main-wiring` | merged |
| 7 | Video preview with style overlay, trim bar, style drawer | `feat/editor-preview` | merged |
| 8 | Caption table, generate panel, job bar, export dialog | `feat/editor-captions` | merged |

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

- Windows installer is unsigned at first: SmartScreen shows a warning until a code-signing certificate is bought.
- Bundled ffmpeg builds that include libx264 are GPL. Shipping them as separate executables next to the app is
  normal practice, but the license text and a source link must ship with them.

## Log

- 2026-10-21: v0.1.0 tagged (baseline skeleton). `develop` created. Wave 0 contracts committed.
- 2026-10-21: Wave 1 started: five Haiku workers in worktrees under ../Tajtlisha-worktrees/. Sol reviewing contracts.
- 2026-10-21: Owner asked for Windows and Linux installers. Added task 5b (bundled ffmpeg, NSIS, CI matrix).
- 2026-10-21: Sol contract review applied on develop: project revision + translatedFrom/translationLanguage
  (stale translations are marked, not cleared), load result with sourceStatus (missing/changed source keeps
  captions), per-project save files with revision ordering, ASS font factor 1.519 for Noto Sans, explicit line
  breaks (ASS WrapStyle 2 / CSS pre), CSS stroke 2x outline, SAR folded into probe width, ffmpeg kill settles on
  process close, paused-frame ffmpeg preview IPC, updates require user action (no install on quit).
- 2026-10-21: feat/export-ass merged (frames verified: text inside frame, Noto Sans, Serbian letters OK). Follow-up 1b started.
- 2026-10-21: feat/ai-transcription (97 tests) and fix/i18n-diacritics merged. Renderer tests run sequentially
  (repo is on a bindfs FUSE mount; parallel jsdom workers timed out). Follow-ups noted: i18n plural forms for
  counts, text-only captions may exceed 6 s.
- 2026-10-21: feat/renderer-state merged (139 renderer tests); follow-up 3b started. Design tokens, UI primitives,
  per-area i18n files and timecode utils added on develop. Wave 2 UI workers (7, 8) started.
- 2026-10-22: feat/export-followup merged (68 main tests; export vs paused-frame preview PSNR 42.6 dB). Found that
  a 32-character line overflows a 720 px frame: added estimateMaxCharsPerLine (about 20 chars on 720x1280 with the
  default style); caption building and line_too_long must use effectiveMaxCharsPerLine. feat/main-wiring started.
- 2026-10-22: feat/editor-captions merged (66 tests). The worker ended without committing; the orchestrator verified
  tests and committed. Fixed an i18n test bug (only the first {{placeholder}} was stripped). Renderer tests now use
  the vmForks pool (jsdom start exceeded vitest's 60 s worker timeout on the FUSE mount under load).
- 2026-10-22: build/packaging-autoupdate merged (AppImage 114 MB, deb 88 MB, latest-linux.yml; 22 updater tests).
  Orchestrator fixes: autoInstallOnAppQuit false, maintainer uses a GitHub noreply address. pnpm now uses the
  hoisted linker (electron-builder stalled with the isolated one). Updater wiring in src/main/index.ts waits for
  feat/main-wiring. Task 5b (Windows NSIS + bundled ffmpeg) started.
- 2026-10-22: feat/main-wiring merged (137 main tests, 97 AI tests; main/preload/shared type-clean). Orchestrator
  wired the updater into src/main/index.ts and added a trailing flush for throttled job progress.
- 2026-10-22: feat/editor-preview merged (50 tests). Global Testing Library cleanup added to tests/setup.ts.
