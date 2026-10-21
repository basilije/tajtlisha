# Changelog

All notable changes to Tajtlisha are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/)
(before 1.0.0, a minor bump may contain breaking changes).

## [Unreleased]

### Added
- Shared project model: one caption row holds a single timing pair with original and translated text.
- Resolution-independent subtitle style (sizes relative to video height) with one geometry helper shared by preview and export.
- Bundled Noto Sans fonts (SIL OFL 1.1) so preview and burned-in export use the same font.
- Job model for long operations: progress events and cancellation.
- Auto-update contract (GitHub Releases via electron-updater) and app info IPC.

### Changed
- IPC surface reduced to project, workflow, jobs, export, media status, updates and app info.
- ffmpeg runs are cancellable and can report progress; probe returns display width/height.

## [0.1.0] - 2026-10-21

### Added
- First Electron/Vite/React skeleton: import MP4, trim, AI transcription and translation (OpenAI), manual editing,
  style controls, SRT and burned-in MP4 export, Settings with encrypted API key storage, UI in en / sr-Latn / sr-Cyrl.

### Known issues
- Burned-in subtitle size does not match the preview (text covers the whole frame on vertical video).
- Default OpenAI transcription model does not return timestamps.
- Opening Settings discards the current project.

[Unreleased]: https://github.com/blonestar/tajtlisha/compare/v0.1.0...develop
[0.1.0]: https://github.com/blonestar/tajtlisha/releases/tag/v0.1.0
