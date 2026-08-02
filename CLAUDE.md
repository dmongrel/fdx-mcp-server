# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`fdx-mcp-server` is an MCP (Model Context Protocol) server written in TypeScript. The source code repos is at [dmongrel/fdx-mcp-server](https://github.com/dmongrel/fdx-mcp-server); the main entry point should be `index.ts`. 

The project is **Bun-based** (primary runtime) but must also **run under Deno**. All code changes need to be compatible with both runtimes. The MCP server transport type is **stdio**. This project will start as a tool-by-tool conversion from the Go version, until it gains its own identity.

## Go version

The Go implementation of this project lives at `/g/_GoProjects/fdx-mcp-server`.

| Runtime | Command in `.mcp.json` | Notes |
|---------|----------------------|-------|
| **Bun** (recommended) | `bun run https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/index.ts` | Fastest startup; Bun auto-caches the file. |
| **Deno** | `deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/index.ts` | Sandboxed by default; flags grant filesystem + network access. |
| **Node/NPM** (global) | Install with `npm install -g fdx-mcp-server`, then run as `fdx-mcp-server` | Full offline support after one-time install. |

## Handoffs

Handoff docs (e.g. `*.md` describing a bug/feature to pick up in a future session) live at `F:\Vault\mcp\fdx-mcp-server`, not in this repo. Once a handoff has been implemented, move it into the `done\` subfolder there.

## Key files

- `README.md` — Setup and configuration instructions for all three runtime paths
- `CHANGELOG.md` — Per-version release notes; update alongside a version bump in `package.json`
- `TOOLS.md` — Hand-maintained table of every registered tool (name, params, description)
- `.idea/` — IntelliJ IDEA project metadata (the repo is TypeScript, not a native JetBrains project)

## Keeping docs in sync

Any change that adds, removes, renames, or changes the input/output shape of a tool must update
**all three** of `README.md`, `CHANGELOG.md`, and `TOOLS.md` in the same change — not just the one
that seems most relevant. In practice:
- `CHANGELOG.md` gets a new version entry (bump `package.json` alongside it) describing the change.
- `TOOLS.md`'s row for that tool (name, parameters, description) is updated to match the tool's
  actual current schema/description; a removed tool's row is deleted and the tool-count header
  line is decremented; a new tool gets a new row.
- `README.md` is checked for anything it says about that tool or the feature area — it doesn't
  enumerate every tool today, so most changes won't touch it, but don't skip the check.
- If a tool's own description string changes, check `src/tools/context-data.ts` for a mirrored
  copy (the `get_context`/`search_actions` catalog) and update it identically — this file is easy
  to miss since it's not one of the three "docs" above, but drifts the same way.


## Developing

The local directory is the actual implementation.

## Testing

Tests live colocated with source, as `*.test.ts` next to the file they cover (e.g. `src/tools/get-context.ts` / `src/tools/get-context.test.ts`) — Bun's idiomatic layout. Run with `bun test`.

## Scripting

Use bash, never PowerShell.
Save scripts in .claude/script (local) for reuse.
