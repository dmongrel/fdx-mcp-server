# Final Draft MCP Server

## Description

**`fdx-mcp-server`** is a Model Context Protocol (MCP) server that lets AI agents read, analyze, and manipulate [Final Draft](https://www.filedropper.com/finaldraft) screenplay files (`.fdx`). It exposes tools for parsing scene headings, character arcs, dual dialogues, SmartType dictionaries, pagination maps, script breakdowns, and more — effectively giving an LLM the ability to understand and edit screenplay structure.

Written in TypeScript, it runs on **Bun** or **Deno** using the stdio transport protocol, making it suitable for integration with any MCP-compatible client such as Claude Desktop.

---

## Table of Contents

- [Installation](#installation)
  - [Prerequisites: Node.js](#prerequisites-nodejs)
  - [Option A — Direct from GitHub (Bun or Deno)](#option-a--direct-from-github-bun-or-deno)
  - [Option B — Global NPM Install](#option-b--global-npm-install)
- [Usage](#usage)
- [Features](#features)

---

## Installation

### Prerequisites: Node.js

Node.js is required for **Option B** (Global NPM Install). If you plan to use that option, install it first using one of these methods:

- **Windows / macOS**: Download the LTS installer from [nodejs.org](https://nodejs.org/) and run it.
- **Linux (apt)**: `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs`
- **Homebrew (macOS / Linux)**: `brew install node`

Verify the installation by running `node --version` and `npm --version` in your terminal.

### Option A — Direct from GitHub (Bun or Deno)

If you have **Bun**, **Deno**, or **both** installed, you can run the server directly from `raw.githubusercontent.com` without installing it locally. No compilation or OS code-signing warnings needed.

> ⚠️ **Rate-limit notice:** This path fetches the server from `raw.githubusercontent.com` every time your MCP client starts. GitHub enforces an anonymous usage policy that limits unauthenticated requests to **60 per hour** (across all of `github.com` and its subdomains). If you exceed this limit, requests will be rejected with a `403 Forbidden` error until the window resets. Frequent restarts can trigger this — for heavy use, see [Option B](#option-b--global-npm-install) which caches everything locally.

### Option B — Global NPM Install

If you prefer a traditional Node.js/NPM setup, install the package globally from the npm registry. This downloads all dependencies locally so the server boots instantly and works 100% offline.

```bash
npm install -g fdx-mcp-server
```

To update later: `npm update -g fdx-mcp-server`

Because this installs a pre-built package from the registry (rather than cloning and building the repo locally), it avoids the Windows npm/node-tar `ENOENT` race that git-based (`github:user/repo`) installs are prone to.

---

## Usage

Add a configuration block to your MCP client's config file (e.g., `claude_desktop_config.json` or `.mcp.json`). Select the entries that apply to you:

**Using Bun only:**

```json
{
  "mcpServers": {
    "fdx-mcp-server-bun": {
      "command": "bun",
      "args": ["run", "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/src/index.ts"]
    }
  }
}
```

**Using Deno only:**

```json
{
  "mcpServers": {
    "fdx-mcp-server-deno": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-read", "--allow-write", "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/src/index.ts"]
    }
  }
}
```

**Using both Bun and Deno:**

```json
{
  "mcpServers": {
    "fdx-mcp-server-bun": {
      "command": "bun",
      "args": ["run", "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/src/index.ts"]
    },
    "fdx-mcp-server-deno": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-read", "--allow-write", "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/master/src/index.ts"]
    }
  }
}
```

**Using global NPM install:**

```json
{
  "mcpServers": {
    "fdx-mcp-server": {
      "command": "fdx-mcp-server",
      "args": []
    }
  }
}
```

---

## Features

Key capabilities exposed by `fdx-mcp-server`:

- **Document lifecycle** — open, save, reload, create new `.fdx` files; manage server-side document cache.
- **Scene analysis** — parse scene headings (INT./EXT., location, time of day), extract scene index and properties, compute script stats and page maps.
- **Character tracking** — retrieve character lists, extension metadata (V.O., O.S.), per-character scene appearance counts, and arc beats across scenes.
- **Dual dialogue support** — read and create side-by-side dialogue blocks.
- **SmartType dictionaries** — manage characters, extensions, locations, transitions, scene intros, times of day, spell-check lists, and paragraph types.
- **Formatting & styling** — query and edit element settings (fonts, indentation, spacing) for every paragraph type; manage header/footer content.
- **Title page management** — read and write title, author, contact block, copyright, and based-on credits.
- **Script breakdowns** — generate full production breakdown reports (props, vehicles, camera, cast) as text or HTML/PDF.
- **Macro system** — query macro aliases and their activation scopes.
- **Search & navigation** — find paragraphs by text, list sections and section contents, retrieve revision colors and display board data.
