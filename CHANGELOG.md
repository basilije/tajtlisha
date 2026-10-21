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
- Burned-in export renders a generated ASS file at the video's own resolution with the bundled font; trim and
  burn happen in one ffmpeg pass; outputs are written to temp files and renamed only when everything succeeded;
  export refuses to overwrite the source video.
- Transcription with word timestamps (`whisper-1`), caption building with line/duration limits and balanced
  lines, and a speech-detection fallback (ffmpeg silencedetect) for models that return text only.
- Translation and polish validate every caption and retry missing ones once; they never fall back to the source text.
- Settings redesigned: General, AI, Export and About sections; model choices show whether they give word timing;
  About shows updates and an ffmpeg capability check; controls that did nothing were removed.
- Windows installer (NSIS, per-user, choose folder, desktop and Start menu shortcuts) with auto-update.
- ffmpeg and ffprobe ship with the app on Windows and Linux (pinned GPL build, license and source link included).
- Linux packages (AppImage, deb) built with electron-builder; auto-update for the AppImage through GitHub
  Releases (check on startup and from Settings; download and install only on user action).
- Projects autosave to the app data folder (one file per project, revision-ordered, atomic writes) and reopen on
  start; captions survive a moved or deleted video.
- Export asks Replace / Create copies / Cancel in the UI language when files already exist.
- GitHub Actions: CI (typecheck, tests, build) and a release workflow for version tags.
- UI language "System" follows the OS language (Serbian, Croatian, Bosnian -> Serbian Latin).

### Fixed
- Export never writes through links or predictable temp files, keeps previous outputs when a replacement fails,
  and never overwrites the source video.
- Quitting saves the last edit and waits for running jobs to stop.
- Serbian Latin UI strings now use proper letters (č, ć, š, ž, đ); Serbian Cyrillic no longer mixes in English words.
- Audio for transcription is mono 16 kHz 64 kbps MP3, well below the 25 MB API limit.

### Security
- IPC only answers the app's own window; navigation away from the app is blocked; saved projects are
  validated and can only point the media tools at files you opened.

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
