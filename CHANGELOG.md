# Changelog

All notable changes to this project are documented in this file.

## [0.0.2] - 2026-07-23

### Fixed

- **Broken update check.** `check-update.ts` queried the GitHub Releases API (`/releases/latest`), but `publish.yml` only pushes a git tag and publishes to npm — it never creates a GitHub Release, so the endpoint 404'd and the check silently failed open (no update ever reported, regardless of version). Switched it to query the npm registry (`registry.npmjs.org/fdx-mcp-server/latest`) instead, since that's the actual source of truth for what's installable.

## [0.0.1] - 2026-07-22

Version reset to mark the switch to real npm registry publishing.

### Changed

- Replaced the broken `release-please` GitHub Actions workflow (it targeted a `main` branch that never existed in this repo — the only branch has always been `master`, so it never actually ran) with a simple workflow that publishes to the npm registry whenever a `v*` tag is pushed.
- The npm package is now published to [npmjs.com](https://npmjs.com) directly, so `npm install -g fdx-mcp-server` and `npm update -g fdx-mcp-server` install a pre-built tarball from the registry — no local git clone/build step, which is what caused the Windows npm/node-tar `ENOENT` race with the old `github:dmongrel/fdx-mcp-server`-based install.
- Deleted the pre-registry `v0.1.0`/`v1.0.0` git tags and GitHub Releases and restarted version numbering at `0.0.1` for the first real npm publish.

## [1.0.0] - 2026-07-22

Version bump to 1.0.0 — the 0.1.0 release already shipped a full, working tool set and a verified install path; this marks it as the stable baseline going forward. No functional changes from 0.1.0.

## [0.1.0] - 2026-07-22

Initial versioned release.

### Fixed

- **Broken `npm install -g` (Option B in the README).** `package.json` had no `"bin"` entry, so a global install never created the `fdx-mcp-server` command. `"main"`/`"exports"` also pointed at `dist/index.js`, which was gitignored and never committed, so there was no working entrypoint even for programmatic use.
- **Node runtime support.** The server previously threw at startup unless `Bun` or `Deno` was present in the global scope, so a plain-Node install couldn't have worked regardless of the packaging fix above. Added a `node:fs/promises` fallback to the shared runtime helpers (`src/fdx/runtime.ts`, `src/tools/check-update.ts`, and the `read_file`/`write_file` helpers in `src/index.ts`), so the server now also runs under plain Node.
- **Version lookup fragility.** `check-update.ts` resolved `package.json` via a hardcoded `"../../../"` relative path from the source file, which breaks once the code is bundled into a single `dist/index.js` at a different depth. It now walks up from the module's location instead of assuming a fixed depth.
- **Missing/uncommitted test fixture.** The test suite depended on `examples/Star Trek Empires Pilot.fdx`, which was gitignored and never committed (and was presumably copyrighted fan-fiction, unsuitable for a public repo), causing 112 test failures. Replaced it with an original, freely-distributable fixture (`examples/Grog The Caveman.fdx`) built using the server's own tools, and repointed every test at it.
- **`edit_title_page` silently dropped `basedOn`/`originalAuthor`** on any title page that never had a based-on block (only an already-populated based-on region could be rewritten in place). It now inserts a new based-on block into the blank spacer gap above the contact block when none exists.

### Changed

- `dist/index.js` is now built targeting Node (with a `#!/usr/bin/env node` banner) and is committed to the repository, so a git-based `npm install -g` needs no build step.
- `package.json`'s `"files"` field now scopes the published npm package to `dist/`, `LICENSE.md`, and `README.md` — cutting the tarball from ~460 files down to 4. This incidentally addresses the Windows `npm`/`tar` `ENOENT` race that surfaced the underlying packaging bug.
