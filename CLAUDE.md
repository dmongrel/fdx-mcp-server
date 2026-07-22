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

## Key files

- `README.md` — Setup and configuration instructions for all three runtime paths
- `.idea/` — IntelliJ IDEA project metadata (the repo is TypeScript, not a native JetBrains project)


## Developing

The local directory is the actual implementation.

## Testing

Tests live colocated with source, as `*.test.ts` next to the file they cover (e.g. `src/tools/get-context.ts` / `src/tools/get-context.test.ts`) — Bun's idiomatic layout. Run with `bun test`.

## Scripting

Use bash, never PowerShell.
Save scripts in .claude/script (local) for reuse.
