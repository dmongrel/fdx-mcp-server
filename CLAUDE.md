# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`fdx-mcp-server` is an MCP (Model Context Protocol) server written in TypeScript. The source code lives at [dmongrel/fdx-mcp-server](https://github.com/dmongrel/fdx-mcp-server); the main entry point is `index.ts`. This local directory is a scaffold — the actual implementation is hosted on GitHub and run directly from there.

## Running the server (three paths, per README.md)

| Runtime | Command in `.mcp.json` | Notes |
|---------|----------------------|-------|
| **Bun** (recommended) | `bun run https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/main/index.ts` | Fastest startup; Bun auto-caches the file. |
| **Deno** | `deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/main/index.ts` | Sandboxed by default; flags grant filesystem + network access. |
| **Node/NPM** (global) | Install with `npm install -g github:dmongrel/fdx-mcp-server`, then run as `fdx-mcp-server` | Full offline support after one-time install. |

## Key files

- `README.md` — Setup and configuration instructions for all three runtime paths
- `.idea/` — IntelliJ IDEA project metadata (the repo is TypeScript, not a native JetBrains project)
- `.junie/plans/` — Planning workspace (currently empty)

## Developing

Since the source lives on GitHub rather than locally, any changes require editing upstream at `dmongrel/fdx-mcp-server`. The server requires read/write filesystem permissions and network access (to resolve dependencies). No local build step or test framework is defined in this scaffold.
