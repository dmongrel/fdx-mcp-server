# Writable Scene Properties — Design Spec

Wishlist item 18 in `F:\Vault\mcp\fdx-mcp-server\wishlist.md`, "Scene properties are readable and
not writable - Color above all."

## Problem

`get_scene_properties` returns a Scene Heading's `Color`, `Length`, `Page`, and `Title` — but
nothing writes any of them. `edit_scene_arc_beats` writes `CharacterArcBeat` entries that live in
the same `SceneProperties` block, so the block is already reachable and already edited elsewhere —
just not `Color`/`Title`.

`Color` matters most because at least one real project (`Star Trek Empires`) uses it as a
faction-coding system rather than decoration (Federation interiors, Romulan, exterior space, each a
fixed color). A scene created outside Final Draft's own scene-color UI — including any scene
created through this server's own `edit_par action=create` — comes in with no `SceneProperties` at
all (confirmed: `buildParagraphElement` never creates one), which reads identically to
`Color=""` for any caller checking it. There is currently no route through the server to close that
gap; the only alternative is hand-editing the XML, which this project's own rules forbid.

## Scope

Three pieces, all three wishlist asks:

1. New tool `edit_scene_properties(path, id, color?, title?)` — sets `Color` and/or `Title` on an
   existing paragraph, creating its `SceneProperties` block if it doesn't have one yet.
2. `edit_par action=create` gains an optional `color` parameter, so a newly created Scene Heading
   can be colored in the same call instead of a create-then-edit sequence.
3. A new `get_context` rule documenting Final Draft's actual color format, since the tool itself
   does not validate it (see below).

`Length` and `Page` are explicitly out of scope for writing — they are derived values Final Draft
computes from pagination, and this server does not recompute pagination. Both stay exactly as they
are: absent if `SceneProperties` is newly created by this change, or whatever they already were if
the block already existed.

## Color validation

`color` (and `title`) are accepted and written verbatim, with no format validation — matching this
codebase's established pattern of trusting caller-supplied attribute values rather than inventing
validation logic that could reject something Final Draft would have accepted (e.g. `edit_par`'s
`textRuns.attrs` is documented as "arbitrary passthrough... written verbatim"). Final Draft's actual
color format is a 12-hex-digit form — each RGB channel doubled to 4 hex digits, e.g.
`#6363A7A7EFEF` for one project's Federation-interior color — but the tool does not enforce this.
Instead, a new `get_context` rule states the format directly, so a caller knows what to send without
the tool needing to guess at every variant Final Draft might accept.

## `edit_scene_properties`

New file `src/tools/edit-scene-properties.ts`, modeled on `edit-scene-arc-beats.ts`'s structure
(same `getCachedFdx`/dirty-warning/`pushCacheWarning` plumbing).

- Input: `path`, `id` (required — the paragraph id), `color?`, `title?`. Error if neither `color`
  nor `title` is given. Error if `id` isn't found among `doc.getParagraphElements()` — Scene
  Headings and other section-type paragraphs are always top-level, never nested inside a
  `DualDialogue`, so no `expandDualDialogue` lookup is needed here (unlike the `get_par_runs`/
  `edit_par action=edit` fix from the prior phase).
- Unlike `edit_scene_arc_beats` (which only touches an *existing* `SceneProperties` block and
  silently skips a paragraph without one), this tool **creates** the block via `createElement` if
  it's missing — that's the actual gap being closed. If it already exists, only the `Color`/`Title`
  attributes are touched via `setAttr`; every other attribute (`Length`, `Page`) and every child
  element (`SceneArcBeats`) is left exactly as it was.
- Response: a plain success message naming which of `color`/`title` were set, following this
  codebase's convention for simple mutation tools (e.g. `edit_scene_arc_beats`'s own response is
  plain text, not JSON).

## `edit_par action=create` color parameter

New optional input `color?: string` on the existing `edit_par` tool, meaningful for `action=create`
only. When given, after the new paragraph is built (`buildParagraphElement`), its `SceneProperties`
element is created (via the same logic pattern as `edit_scene_properties`) with `Color` set to the
given value. No restriction is enforced based on `type` — the parameter is simply inert if it's
given for a paragraph type where a `SceneProperties.Color` wouldn't be meaningful, matching how this
codebase generally doesn't gate one optional parameter's availability on another parameter's value.
The parameter's own description makes clear it's meant for Scene Heading (and similarly-classed
section) paragraphs.

## Documentation

New `contextRules` entry in `src/tools/context-data.ts`, placed after "Section Boundaries" and
before "UUID Generation" (both rules deal with section-type paragraph structure):

```typescript
{
  title: "Scene Color",
  content:
    "Final Draft's scene color is a 12-hex-digit value, #RRRRGGGGBBBB — each RGB channel doubled to 4 hex digits (e.g. #6363A7A7EFEF), not the usual 6-digit web format. edit_scene_properties(id, color=...) sets it on an existing paragraph, creating its SceneProperties block if needed; edit_par action=create also accepts a color parameter for a new Scene Heading. Neither tool validates the format — send it in Final Draft's own form.",
},
```

Per the project's standing rule, `README.md`, `CHANGELOG.md`, and `TOOLS.md` are updated alongside
the new tool and the new `edit_par` parameter, and `edit_par`'s mirrored description in
`context-data.ts` is updated to match its own file's description exactly.

## Testing

**`edit_scene_properties`:**
- Sets `color` on a paragraph with no existing `SceneProperties` — the block is created, `Color`
  matches, `Length`/`Page`/`Title` are absent (never having existed).
- Sets `color` on a paragraph that already has a `SceneProperties` block with `Length`, `Page`, and
  a `SceneArcBeats` child — after the edit, `Length`/`Page`/the arc-beats child are byte-for-byte
  unchanged, only `Color` differs.
- Sets `title` only; sets both `color` and `title` in one call.
- Errors when neither `color` nor `title` is given.
- Errors when `id` doesn't match any paragraph.

**`edit_par action=create` with `color`:**
- `type="Scene Heading"` with `color` given produces a paragraph whose `SceneProperties.Color`
  matches the given value.
- Omitting `color` behaves exactly as today — a regression guard that this change didn't
  accidentally start creating an empty `SceneProperties` block on every create call.
