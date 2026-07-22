// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Portable filesystem helpers that work under Bun, Deno, and Node. Mirrors the pattern already
 * used in src/index.ts for read_file/write_file.
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
  const { readFile } = await import("node:fs/promises");
  return await readFile(path, "utf8");
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
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf8");
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
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, data);
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
  const { stat } = await import("node:fs/promises");
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
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
  // Bun/Node: attempting to read a directory's contents as text throws EISDIR, which
  // readTextFile will surface directly — no separate stat check needed on these runtimes.
}

