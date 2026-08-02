// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * In-memory LRU cache of parsed FdxDocuments, keyed by absolute file path. Mirrors the Go
 * implementation's tools/cache.go: fixed 4-slot capacity, dirty-flag tracking per entry, and an
 * eviction warning when a dirty entry is pushed out to make room for a new one.
 *
 * JS Map preserves insertion order; entries are moved to the "most recently used" position by
 * deleting and re-inserting them, so the first key in iteration order is always the
 * least-recently-used entry (a candidate for eviction).
 */

import { FdxDocument } from "./document.ts";

export const MAX_DOCUMENT_CACHE_SIZE = 4;

export interface CacheEntryInfo {
  path: string;
  dirty: boolean;
  hasSavepoint: boolean;
}

interface CacheEntry {
  doc: FdxDocument;
  dirty: boolean;
  savepoint?: { xml: string; dirty: boolean };
}

export function evictionWarning(path: string): string {
  return `cache evicted "${path}" while it had unsaved edits (LRU full, ${MAX_DOCUMENT_CACHE_SIZE}-slot limit) — those changes are now lost unless a copy was saved earlier; call save_fdx before switching files if this happens again`;
}

export class LruCache {
  private items = new Map<string, CacheEntry>();

  private touchOrder(path: string): void {
    const entry = this.items.get(path);
    if (!entry) return;
    this.items.delete(path);
    this.items.set(path, entry);
  }

  /** Serves a cached document and marks it most-recently-used, or undefined on a miss. */
  get(path: string): FdxDocument | undefined {
    const entry = this.items.get(path);
    if (!entry) return undefined;
    this.touchOrder(path);
    return entry.doc;
  }

  private evictOldestIfFull(): { path: string; entry: CacheEntry } | undefined {
    if (this.items.size < MAX_DOCUMENT_CACHE_SIZE) return undefined;
    const oldestKey = this.items.keys().next().value as string;
    const oldest = this.items.get(oldestKey)!;
    this.items.delete(oldestKey);
    return { path: oldestKey, entry: oldest };
  }

  /** Inserts/updates a document as clean (matches disk). Returns an eviction warning, or "". */
  set(path: string, doc: FdxDocument): string {
    const existing = this.items.get(path);
    if (existing) {
      existing.doc = doc;
      existing.dirty = false;
      this.touchOrder(path);
      return "";
    }
    const evicted = this.evictOldestIfFull();
    this.items.set(path, { doc, dirty: false });
    return evicted?.entry.dirty ? evictionWarning(evicted.path) : "";
  }

  /** Marks an entry dirty (mutated since last load/save). Returns an eviction warning, or "". */
  touchDirty(path: string, doc: FdxDocument): string {
    const existing = this.items.get(path);
    if (existing) {
      existing.doc = doc;
      existing.dirty = true;
      this.touchOrder(path);
      return "";
    }
    const evicted = this.evictOldestIfFull();
    this.items.set(path, { doc, dirty: true });
    return evicted?.entry.dirty ? evictionWarning(evicted.path) : "";
  }

  /**
   * Snapshots path's current document (serialized) and dirty flag, overwriting any existing
   * savepoint for this path. Fails if nothing is cached for path.
   */
  setSavepoint(path: string): { ok: true } | { ok: false; reason: string } {
    const entry = this.items.get(path);
    if (!entry) return { ok: false, reason: "nothing cached for path" };
    entry.savepoint = { xml: entry.doc.serialize(), dirty: entry.dirty };
    return { ok: true };
  }

  /**
   * Restores path's document and dirty flag from its savepoint. The savepoint is left in place
   * afterward — calling this twice in a row restores the same state both times. Fails if nothing
   * is cached for path, or if path has no savepoint.
   */
  rollback(path: string): { ok: true } | { ok: false; reason: string } {
    const entry = this.items.get(path);
    if (!entry) return { ok: false, reason: "nothing cached for path" };
    if (!entry.savepoint) return { ok: false, reason: "no savepoint set for path" };
    entry.doc = FdxDocument.parse(entry.savepoint.xml, path);
    entry.dirty = entry.savepoint.dirty;
    this.touchOrder(path);
    return { ok: true };
  }

  /** Whether path currently has a savepoint set. */
  hasSavepoint(path: string): boolean {
    return Boolean(this.items.get(path)?.savepoint);
  }

  /**
   * Removes the entry for `path` unless it is dirty and `force` is false. Returns whether the
   * path existed at all, whether it was dirty, and whether it was actually removed.
   */
  removeIf(path: string, force: boolean): { existed: boolean; dirty: boolean; removed: boolean } {
    const entry = this.items.get(path);
    if (!entry) return { existed: false, dirty: false, removed: false };
    if (entry.dirty && !force) return { existed: true, dirty: true, removed: false };
    this.items.delete(path);
    return { existed: true, dirty: entry.dirty, removed: true };
  }

  /** Snapshot of every cached entry, most-recently-used first. */
  entries(): CacheEntryInfo[] {
    return [...this.items.entries()].reverse().map(([path, e]) => ({ path, dirty: e.dirty, hasSavepoint: Boolean(e.savepoint) }));
  }
}

/** The single shared document cache used by every tool handler. */
export const documentCache = new LruCache();

