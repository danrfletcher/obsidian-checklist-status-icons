# Markdown status marker — spike result

Spiked live in Obsidian 1.13.7 (`desktop-obsidian-4` container), vault note
`Marker Spike Test.md`, screenshotted in both Live Preview and Reading view.
See `spike-screenshots/live-preview.png` and `spike-screenshots/reading-view.png`.

## What was tested

```md
- [ ] plain unchecked task
- [x] plain checked task
- [I] single char candidate (In Progress)
- [/] single char candidate (slash, common "in progress" convention)

- [$task=IN PROGRESS] multi-char marker candidate
- [IN PROGRESS] multi-char, no marker prefix
- [$task=I] short multi-char marker candidate

- [ ] parent task
	- [I] indented child with single-char marker
	- [$task=IN PROGRESS] indented child with multi-char marker
```

## Result

- **Single-character bracket content** (`- [I]`, `- [/]`) is recognized by
  Obsidian's native task parser as a real, interactive task — rendered as a
  checkbox (Obsidian's default styling for a non-space/non-`x` single
  character), toggleable, gets a `data-task` attribute. True in both Live
  Preview and Reading view, at any indentation level.
- **Multi-character bracket content** (`- [$task=IN PROGRESS]`,
  `- [IN PROGRESS]`, `- [$task=I]`) is **not** recognized as a task at all —
  it renders as a plain bullet list item with the literal bracket text
  visible as part of the line. Confirmed in both views. This rules out
  option 1 (`- [$task=STATUS_NAME]`) entirely: it isn't "a task with unusual
  text," it's not a task, so none of Obsidian's own task affordances (click
  to toggle, task queries, Tasks-plugin-style compatibility, etc.) would work
  on those lines, and it fails the plugin's own goal of staying readable
  *and* functioning as a checklist in raw Obsidian without this plugin
  installed anyway (since it isn't a checklist item there either).

## Decision

**Single-character mapping**, per the spec's fallback option — but chosen
outright rather than as a fallback, since option 1 doesn't parse as a task
at all. Keyed by **status id**, not name/label (`DataStore.statusCharMap:
Record<statusId, char>` in `src/types.ts`/`src/dataStore.ts`), so renaming a
status in Status Sets does not reshuffle already-assigned characters — this
was called out in the spec as a secondary advantage of id-keying if this
route was taken anyway, and it's a straightforward win with no downside.

- Assignment is stable once made (`DataStore.getOrAssignStatusChar` only
  assigns on first use, never reassigns an existing mapping).
- Deterministic collision handling: prefers the status label's own initial
  letter (uppercase, then lowercase, then the same for its second and third
  words) before falling back to a fixed alphanumeric sequence — so two
  statuses colliding on the same first letter (e.g. "Idea" and "In
  Progress") still land on distinct, reproducible characters (`I` and `i`
  respectively, if "Idea" claimed `I` first).
- The default status is still always plain `- [ ]`, regardless of the
  mapping — never given a character of its own.
- The native checkbox glyph these single characters render as by default is
  fully replaced by this plugin's own traffic-light dot (see rendering
  layer) — the default Obsidian styling for a custom single-char task was
  useful only for confirming parseability during this spike, not something
  the plugin relies on visually.

## Tradeoff (documented per spec, also see README)

Because the marker is a literal character embedded in note content — not
just an id reference living in this plugin's own data — **renaming a status
in Status Sets does not migrate already-written task markers**. A task
written as `- [I]` for "In Progress" keeps showing `I` after the status is
renamed to, say, "WIP"; if "WIP" happens to get assigned a different
character (unlikely, since the mapping is id-keyed and stable once
assigned, but possible if the plugin's data is reset), old markers can
desync from what a status renders as. This plugin does not auto-migrate
markers on rename — no different in kind from renaming a tag not
retroactively updating every note that used the old name. Documented in the
README/docs for this plugin.
