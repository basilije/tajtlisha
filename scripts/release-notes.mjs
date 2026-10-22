#!/usr/bin/env node
// Prints the GitHub Release body for a version: its CHANGELOG.md section plus a
// short download guide. Usage: node scripts/release-notes.mjs 0.2.0
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
let end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
if (end < 0) end = lines.length;
// Drop the link reference definitions that live at the end of the file.
const section = lines
  .slice(start + 1, end)
  .filter((line) => !/^\[[^\]]+\]: /.test(line))
  .join('\n')
  .trim();

const guide = `## Downloads

| File | For |
| --- | --- |
| \`Tajtlisha-Setup-${version}.exe\` | Windows 10/11 x64 installer. Updates itself. |
| \`Tajtlisha-${version}-x86_64.AppImage\` | Linux x64, no installation needed (\`chmod +x\`, then run). Updates itself. |
| \`Tajtlisha-${version}-amd64.deb\` | Debian/Ubuntu x64. Update by installing the newer package. |

ffmpeg is included in every package. The Windows installer is not code-signed yet: if SmartScreen warns,
choose "More info" -> "Run anyway". The \`latest*.yml\` and \`.blockmap\` files are used by the in-app updater.`;

process.stdout.write(`${section}\n\n${guide}\n`);
