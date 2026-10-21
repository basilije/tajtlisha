# vendor/

Third-party binaries that the packaged app ships. Only this README is tracked in git; the downloaded
files live in `vendor/ffmpeg/` and are gitignored.

## ffmpeg

`node scripts/fetch-ffmpeg.mjs --platform linux|win32|all` downloads the pinned BtbN/FFmpeg-Builds release,
checks its sha256 (pinned in the script), and writes:

```
vendor/ffmpeg/linux-x64/
  bin/ffmpeg  bin/ffprobe        -> packaged as resources/ffmpeg/
  lib/lib*.so.N                  -> packaged as resources/lib/ (RPATH $ORIGIN/../lib)
  LICENSE.txt  SOURCE.txt        -> packaged as resources/ffmpeg/
  manifest.json                  archive sha256 and per-file sha256 (checked on every run)
vendor/ffmpeg/win32-x64/
  bin/ffmpeg.exe  bin/ffprobe.exe  bin/*.dll  -> packaged as resources/ffmpeg/
  LICENSE.txt  SOURCE.txt  manifest.json
```

- Build: `gpl-shared` (GPLv3 or later, with libass, libx264, aac and libmp3lame). The shared build is about 40%
  smaller than the static `gpl` build because the static one repeats the codebase in ffmpeg and ffprobe.
- The bundled ffmpeg is a separate program, started as a child process. Its license and source link ship next to it.
- Re-running the script is a no-op when `manifest.json` matches the pinned archive.
- To bump ffmpeg: pick a new `autobuild-*` release, update `RELEASE_TAG`, the archive names and both sha256 values in
  `scripts/fetch-ffmpeg.mjs` (the GitHub API lists a `digest` for each asset), then run the script again.

Development and tests can point at the vendored build without installing ffmpeg:

```bash
V="$PWD/vendor/ffmpeg/linux-x64/bin"
TAJTLISHA_FFMPEG_PATH="$V/ffmpeg" TAJTLISHA_FFPROBE_PATH="$V/ffprobe" pnpm test:main:local
```
