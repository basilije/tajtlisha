# Branches, versions and releases

## Branches

| Branch | Purpose |
| --- | --- |
| `master` | Released code only. Every commit on `master` is a tagged release `vX.Y.Z`. |
| `develop` | Integration branch. Feature branches start here and merge back here. |
| `feat/<name>` | New functionality. |
| `fix/<name>` | Bug fixes. |
| `build/<name>` | Build, packaging, CI, auto-update. |
| `docs/<name>` | Documentation only. |
| `release/X.Y.Z` | Version bump and changelog for a release; merged into `master` and back into `develop`. |
| `hotfix/X.Y.Z` | Urgent fix from `master`; merged into `master` and `develop`. |

Merge feature branches with `git merge --no-ff` so each feature stays visible in history.
Work in separate worktrees (`git worktree add ../Tajtlisha-worktrees/<name> -b feat/<name> develop`) when
several branches are active at once.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`build:`, `docs:`, `test:`, `refactor:`, `chore:`. They make the changelog easy to write.

## Versions

- SemVer, starting at `0.1.0`. Before `1.0.0`: minor = new features (may break), patch = fixes.
- The version lives in `package.json`; the git tag is `v` + that version.
- `CHANGELOG.md` keeps an `[Unreleased]` section that every branch updates when it changes behavior.

## Release steps

1. `git switch -c release/X.Y.Z develop`
2. Move `[Unreleased]` entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, update the compare links.
3. `pnpm version X.Y.Z --no-git-tag-version` and commit `chore(release): vX.Y.Z`.
4. `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
5. Merge into `master` (`--no-ff`), tag `vX.Y.Z`, merge `master` back into `develop`.
6. Push `master`, `develop` and the tag. The release workflow builds the packages and publishes a GitHub
   Release; installed AppImage builds pick it up through auto-update.

## Auto-update

- Packaged builds use `electron-updater` with the GitHub Releases provider (`blonestar/tajtlisha`).
- Linux: AppImage updates itself. The `.deb` package does not auto-update (status `unsupported`); users
  reinstall it from the release page.
- Windows (later): NSIS installer updates itself.
- Development runs (`pnpm dev`) never check for updates.
- The app checks on startup and from Settings > About. Downloading and installing always need user action.
