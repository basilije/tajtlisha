#!/usr/bin/env node
// Fetches the pinned, checksum-verified FFmpeg builds that get bundled into the app.
//
//   node scripts/fetch-ffmpeg.mjs --platform linux|win32|all
//
// Output (gitignored): vendor/ffmpeg/<platform>-x64/
//   bin/       ffmpeg, ffprobe (+ ffmpeg.exe / ffprobe.exe and DLLs on Windows)
//   lib/       runtime shared libraries (Linux only; RPATH is $ORIGIN/../lib)
//   LICENSE.txt, SOURCE.txt, manifest.json
//
// The layout mirrors what electron-builder copies into resources/ffmpeg and resources/lib.
// Re-running is a no-op when manifest.json matches the pinned archive and every file hash.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const RELEASE_TAG = 'autobuild-2026-10-21-13-06';
const FFMPEG_VERSION = 'N-127900-ge2798d5cad';
const RELEASE_PAGE = `https://github.com/BtbN/FFmpeg-Builds/releases/tag/${RELEASE_TAG}`;
const DOWNLOAD_BASE = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${RELEASE_TAG}`;

// Shared (gpl-shared) builds: ~205 MB installed on Linux and ~195 MB on Windows, versus ~340-350 MB
// for the static gpl builds, which repeat the whole codebase in both ffmpeg and ffprobe.
const TARGETS = {
  'linux-x64': {
    host: 'linux',
    archive: {
      name: `ffmpeg-${FFMPEG_VERSION}-linux64-gpl-shared.tar.xz`,
      sha256: 'c343da6c5cf4c2c79cd1656fcd87c0abcfda958456bb3e0addc491175e040996',
      size: 72228328
    },
    executables: ['ffmpeg', 'ffprobe']
  },
  'win32-x64': {
    host: 'win32',
    archive: {
      name: `ffmpeg-${FFMPEG_VERSION}-win64-gpl-shared.zip`,
      sha256: 'f5c781cc906fe80123934cae933e006130cef0e86a384c50c7c26a9c75397ac4',
      size: 91437143
    },
    executables: ['ffmpeg.exe', 'ffprobe.exe']
  }
};

const PLATFORM_FLAGS = {
  linux: ['linux-x64'],
  win32: ['win32-x64'],
  all: ['linux-x64', 'win32-x64']
};

const vendorRoot = fileURLToPath(new URL('../vendor/ffmpeg', import.meta.url));
const cacheDir = path.join(vendorRoot, '.cache');

function parseArgs(argv) {
  const index = argv.indexOf('--platform');
  const value = index === -1 ? 'all' : argv[index + 1];
  if (!Object.hasOwn(PLATFORM_FLAGS, value)) {
    throw new Error(`Usage: node scripts/fetch-ffmpeg.mjs --platform linux|win32|all (got ${value ?? 'nothing'})`);
  }
  return PLATFORM_FLAGS[value];
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadArchive(archive, destination) {
  if (existsSync(destination) && (await sha256File(destination)) === archive.sha256) {
    console.log(`  cached ${archive.name}`);
    return;
  }

  const url = `${DOWNLOAD_BASE}/${archive.name}`;
  console.log(`  downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }

  const partial = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));

  const actual = await sha256File(partial);
  if (actual !== archive.sha256) {
    rmSync(partial, { force: true });
    throw new Error(`sha256 mismatch for ${archive.name}: expected ${archive.sha256}, got ${actual}`);
  }
  renameSync(partial, destination);
  console.log(`  verified sha256 (${(statSync(destination).size / 1e6).toFixed(1)} MB)`);
}

function extractArchive(archive, destination) {
  const quote = (value) => `'${value.replace(/'/g, "''")}'`;
  const result = archive.endsWith('.zip')
    ? process.platform === 'win32'
      ? spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(destination)} -Force`],
          { stdio: 'inherit' }
        )
      : spawnSync('unzip', ['-q', archive, '-d', destination], { stdio: 'inherit' })
    : spawnSync('tar', ['-xJf', archive, '-C', destination], { stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`Extracting ${path.basename(archive)} failed (exit ${result.status ?? result.error?.message})`);
  }
}

// Copies only what the app needs. For Linux, soname symlinks (libavcodec.so.63 -> libavcodec.so.63.2.100)
// are materialised as regular files so the packaged layout does not depend on symlink preservation.
function stageFiles(sourceDir, target, destinationDir) {
  const sourceBin = path.join(sourceDir, 'bin');
  const destinationBin = path.join(destinationDir, 'bin');
  mkdirSync(destinationBin, { recursive: true });

  const binaries = readdirSync(sourceBin).filter((name) => {
    if (target.host === 'win32') return /\.(exe|dll)$/i.test(name) && !/^ffplay/i.test(name);
    return target.executables.includes(name);
  });
  for (const name of binaries) {
    copyFileSync(path.join(sourceBin, name), path.join(destinationBin, name));
  }

  if (target.host === 'linux') {
    const sourceLib = path.join(sourceDir, 'lib');
    const destinationLib = path.join(destinationDir, 'lib');
    mkdirSync(destinationLib, { recursive: true });
    for (const name of readdirSync(sourceLib)) {
      const entry = path.join(sourceLib, name);
      if (!lstatSync(entry).isSymbolicLink() || !/\.so\.\d+$/.test(name)) continue;
      copyFileSync(realpathSync(entry), path.join(destinationLib, name));
    }
  }

  copyFileSync(path.join(sourceDir, 'LICENSE.txt'), path.join(destinationDir, 'LICENSE.txt'));
}

function listStagedFiles(destinationDir) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const entry = path.join(dir, name);
      if (statSync(entry).isDirectory()) walk(entry);
      else files.push(path.relative(destinationDir, entry).split(path.sep).join('/'));
    }
  };
  walk(destinationDir);
  return files;
}

async function readManifest(destinationDir) {
  const manifestPath = path.join(destinationDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

async function isUpToDate(target, destinationDir) {
  const manifest = await readManifest(destinationDir);
  if (!manifest || manifest.release !== RELEASE_TAG || manifest.archive?.sha256 !== target.archive.sha256) return false;
  for (const file of manifest.files) {
    const full = path.join(destinationDir, file.path);
    if (!existsSync(full) || (await sha256File(full)) !== file.sha256) return false;
  }
  return true;
}

function verifyRunnableOnHost(target, destinationDir) {
  if (process.platform !== target.host) {
    console.log(`  skipping run check (built for ${target.host}, host is ${process.platform})`);
    return;
  }

  const bin = path.join(destinationDir, 'bin');
  const ffmpeg = path.join(bin, target.executables[0]);
  const run = (args) => {
    const result = spawnSync(ffmpeg, args, { encoding: 'utf8', env: { ...process.env, LD_LIBRARY_PATH: '' } });
    if (result.status !== 0) throw new Error(`${ffmpeg} ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);
    return result.stdout;
  };

  const version = run(['-hide_banner', '-version']).split('\n')[0];
  const filters = run(['-hide_banner', '-filters']);
  const encoders = run(['-hide_banner', '-encoders']);
  const missing = [];
  if (!/^\s*\S+\s+ass\s/m.test(filters)) missing.push('ass filter');
  for (const encoder of ['libx264', 'aac', 'libmp3lame']) {
    if (!new RegExp(`^\\s*\\S+\\s+${encoder}\\s`, 'm').test(encoders)) missing.push(encoder);
  }
  if (missing.length) throw new Error(`Bundled ffmpeg is missing: ${missing.join(', ')}`);
  console.log(`  run check ok: ${version}`);
}

function writeSourceNotice(target, destinationDir) {
  writeFileSync(
    path.join(destinationDir, 'SOURCE.txt'),
    [
      `FFmpeg ${FFMPEG_VERSION} (${target.archive.name})`,
      '',
      `Binaries: ${RELEASE_PAGE}`,
      `Archive:  ${DOWNLOAD_BASE}/${target.archive.name}`,
      `          sha256 ${target.archive.sha256}`,
      'Build recipe: https://github.com/BtbN/FFmpeg-Builds',
      'FFmpeg source: https://git.ffmpeg.org/ffmpeg.git (commit ge2798d5cad, from the version string above)',
      '              tarballs: https://ffmpeg.org/releases/',
      '',
      'License: GPL-3.0-or-later build (configured with --enable-gpl --enable-version3). The full license',
      'text is in LICENSE.txt next to this file. The executables are separate programs that Tajtlisha',
      'starts as child processes; they are not linked into the application.',
      ''
    ].join('\n')
  );
}

async function fetchTarget(key) {
  const target = TARGETS[key];
  const destinationDir = path.join(vendorRoot, key);
  console.log(`[${key}] ${target.archive.name}`);

  if (await isUpToDate(target, destinationDir)) {
    console.log(`  already present and verified: ${path.relative(process.cwd(), destinationDir)}`);
    return;
  }

  mkdirSync(cacheDir, { recursive: true });
  const archivePath = path.join(cacheDir, target.archive.name);
  await downloadArchive(target.archive, archivePath);

  const workDir = await mkdtemp(path.join(tmpdir(), 'tajtlisha-ffmpeg-'));
  try {
    extractArchive(archivePath, workDir);
    const [topDir] = readdirSync(workDir).filter((name) => statSync(path.join(workDir, name)).isDirectory());
    const sourceDir = path.join(workDir, topDir);

    rmSync(destinationDir, { recursive: true, force: true });
    mkdirSync(destinationDir, { recursive: true });
    stageFiles(sourceDir, target, destinationDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  rmSync(archivePath, { force: true });

  writeSourceNotice(target, destinationDir);
  const files = [];
  for (const relative of listStagedFiles(destinationDir)) {
    if (relative === 'manifest.json') continue;
    const full = path.join(destinationDir, relative);
    files.push({ path: relative, sha256: await sha256File(full), size: statSync(full).size });
  }
  writeFileSync(
    path.join(destinationDir, 'manifest.json'),
    `${JSON.stringify({ ffmpegVersion: FFMPEG_VERSION, release: RELEASE_TAG, archive: target.archive, files }, null, 2)}\n`
  );

  verifyRunnableOnHost(target, destinationDir);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`  installed ${files.length} files, ${(total / 1e6).toFixed(1)} MB -> ${path.relative(process.cwd(), destinationDir)}`);
}

async function main() {
  const keys = parseArgs(process.argv.slice(2));
  for (const key of keys) {
    await fetchTarget(key);
  }
}

main().catch((error) => {
  console.error(`fetch-ffmpeg: ${error.message}`);
  process.exitCode = 1;
});
