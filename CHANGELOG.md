# Changelog

All notable changes to this project are documented in this file.

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
