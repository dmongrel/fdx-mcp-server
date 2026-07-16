/**
 * fdx-mcp-server
 * A Model Context Protocol (MCP) server built for Bun, compatible with Deno.
 * Uses stdio transport (JSON-RPC 2.0 over stdin/stdout).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getContextTool, handleGetContext } from "./tools/get-context.ts";
import { searchActionsTool, handleSearchActions } from "./tools/search-actions.ts";

/* ------------------------------------------------------------------ */
/*  MCP Server instance                                               */
/* ------------------------------------------------------------------ */

const server = new Server(
  { name: "fdx-mcp-server", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Portable file I/O that works in both Bun and Deno
async function readFile(path: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    return await Bun.file(path).text();
  }
  // Deno runtime check
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { readTextFileSync(path: string): string }
    | undefined;
  if (deno) {
    return deno.readTextFileSync(path);
  }
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

async function writeFile(path: string, content: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, content);
    return;
  }
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { writeTextFile(path: string, content: string): Promise<void> }
    | undefined;
  if (deno) {
    await deno.writeTextFile(path, content);
    return;
  }
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

/* ------------------------------------------------------------------ */
/*  Tool definitions                                                  */
/* ------------------------------------------------------------------ */

interface FdxTool {
  name: string;
  description: string;
  inputSchema: object;
}

const tools: FdxTool[] = [
  getContextTool,
  searchActionsTool,
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file, creating it if it does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path for the output file.",
        },
        content: {
          type: "string",
          description: "Text content to write.",
        },
      },
      required: ["path", "content"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Request handlers                                                  */
/* ------------------------------------------------------------------ */

server.setRequestHandler(InitializeRequestSchema, () => ({
  protocolVersion: "2025-03-26",
  capabilities: {
    tools: {},
  },
}));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_context") {
    return handleGetContext();
  }

  if (name === "search_actions") {
    return handleSearchActions();
  }

  if (name === "read_file") {
    const filePath = args?.path as string | undefined;
    if (!filePath) {
      return {
        content: [{ type: "text", text: "Error: 'path' argument is required." }],
      };
    }

    try {
      const content = await readFile(filePath);
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error reading file: ${message}` }],
        isError: true,
      };
    }
  }

  if (name === "write_file") {
    const filePath = args?.path as string | undefined;
    const content = args?.content as string | undefined;

    if (!filePath || content === undefined) {
      return {
        content: [
          {
            type: "text",
            text: "Error: 'path' and 'content' arguments are required.",
          },
        ],
      };
    }

    try {
      await writeFile(filePath, content);
      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote ${content.length} bytes to ${filePath}.`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error writing file: ${message}` }],
        isError: true,
      };
    }
  }

  // Unknown tool
  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}. Available tools: ${tools.map((t) => t.name).join(", ")}`,
      },
    ],
    isError: true,
  };
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
