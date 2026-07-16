Below are the complete, step-by-step instructions you can drop directly into your project's `README.md` or share with your users.

Since your server **must read and write local files**, the Deno configuration includes the necessary security permissions to allow local file access.

---

# Installing & Configuring `fdx-mcp-server`

Because `fdx-mcp-server` is built using modern TypeScript, you can run it securely and instantly on your local machine using **Bun** or **Deno** without needing any compilation or dealing with OS code-signing warnings.

Choose **one** of the setup paths below depending on your preferred runtime environment.

---

## Path A: The Bun Setup (Recommended & Fastest)

Bun offers the fastest startup speeds. If you have Bun installed, you can execute the server directly from GitHub without installing it globally.

### 1. The `.mcp.json` Configuration

Add the following configuration block to your MCP client configuration file (e.g., `claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "fdx-mcp-server": {
      "command": "bun",
      "args": [
        "run",
        "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/main/index.ts"
      ]
    }
  }
}

```

* **How it works:** Bun will automatically download, cache, and execute the server file on startup. It runs natively with access to your local filesystem.

---

## Path B: The Deno Setup (Secure & Sandboxed)

Deno runs in a secure-by-default sandbox. Because `fdx-mcp-server` needs to read and write local files, you must explicitly grant it those permissions using flags.

### 1. The `.mcp.json` Configuration

Add the following configuration block to your MCP client configuration file:

```json
{
  "mcpServers": {
    "fdx-mcp-server": {
      "command": "deno",
      "args": [
        "run",
        "--allow-read",
        "--allow-write",
        "--allow-net",
        "https://raw.githubusercontent.com/dmongrel/fdx-mcp-server/main/index.ts"
      ]
    }
  }
}

```

* **`--allow-read` & `--allow-write`:** Required to allow the server to interact with your local files.
* **`--allow-net`:** Required to let Deno resolve external package dependencies.

---

## Path C: Global NPM Installation (No Bun or Deno Required)

If you prefer a traditional Node.js/NPM setup, you can install the package globally directly from GitHub. This downloads all dependencies locally so the server can boot instantly and work 100% offline.

### 1. Install Globally via NPM

Run the following command in your terminal:

```bash
npm install -g github:dmongrel/fdx-mcp-server

```

### 2. The `.mcp.json` Configuration

Once installed, add this block to your configuration file:

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

* **To Update Later:** If updates are pushed to GitHub, you can pull the latest changes anytime by running:
```bash
npm update -g fdx-mcp-server

```