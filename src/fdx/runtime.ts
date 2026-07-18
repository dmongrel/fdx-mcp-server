/**
 * Portable filesystem helpers that work under both Bun and Deno without relying on Node-only
 * APIs. Mirrors the pattern already used in src/index.ts for read_file/write_file.
 */

interface DenoLike {
  readTextFile(path: string | URL): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }>;
}

function getDeno(): DenoLike | undefined {
  return (globalThis as Record<string, unknown>).Deno as DenoLike | undefined;
}

export async function readTextFile(path: string | URL): Promise<string> {
  if (typeof Bun !== "undefined") {
    return await Bun.file(path).text();
  }
  const deno = getDeno();
  if (deno) return await deno.readTextFile(path);
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, content);
    return;
  }
  const deno = getDeno();
  if (deno) {
    await deno.writeTextFile(path, content);
    return;
  }
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, data);
    return;
  }
  const deno = getDeno();
  if (deno) {
    await deno.writeFile(path, data);
    return;
  }
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

export async function fileExists(path: string): Promise<boolean> {
  if (typeof Bun !== "undefined") {
    return await Bun.file(path).exists();
  }
  const deno = getDeno();
  if (deno) {
    try {
      const info = await deno.stat(path);
      return info.isFile;
    } catch {
      return false;
    }
  }
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

/** Rejects with an error if `path` refers to a directory rather than a regular file. */
export async function assertIsFile(path: string): Promise<void> {
  const deno = getDeno();
  if (deno) {
    const info = await deno.stat(path);
    if (info.isDirectory) {
      throw new Error(`read: ${path} is a directory, not a file`);
    }
    return;
  }
  // Bun: attempting to read a directory's contents as text throws EISDIR, which readTextFile
  // will surface directly — no separate stat check needed on this runtime.
}
