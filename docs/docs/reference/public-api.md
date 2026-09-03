# Public API (for plugin developers)

Checklist Status Sets exposes a small read-only API so another plugin can
find out what status decoration (if any) it would render for a given task —
without reimplementing assignment resolution or reaching into this plugin's
own data.

!!! warning "Unstable"
    This is a young, hand-rolled contract — no semver package, no
    deprecation window. It exists specifically to support
    [Loud Outline](https://danrfletcher.github.io/obsidian-loud-outline/)
    showing the same status in the file tree that this plugin renders in the
    note. Check `apiVersion` if you need to guard against future breaking
    changes, and expect it to grow rather than shrink.

## Reaching it

```ts
const checklistStatus = app.plugins.plugins["checklist-status-icons"]?.api;
if (!checklistStatus) {
    // Not installed, not enabled, or predates this API — handle gracefully.
    return;
}
```

Always optional-chain and check for `undefined`.

## Surface

```ts
interface ChecklistStatusIconsPublicApi {
    readonly apiVersion: 1;

    getStatusDecoration(
        path: string,
        lineNumber: number,
        marker: string
    ): TaskStatusDecoration | undefined;

    isGlowEnabled(): boolean;

    onChange(callback: () => void): () => void;
}

interface TaskStatusDecoration {
    color: string;
    label: string;
    isCompleted: boolean;
    hidden: boolean;
}
```

- **`getStatusDecoration(path, lineNumber, marker)`** resolves exactly what
  this plugin would render for the task at that file + line, given its raw
  checkbox marker character — the single character between `[` and `]`
  (`" "` for the default status, `"x"`/`"X"` or any other single character
  otherwise; see `ListItemCache.task`, or read it directly off the line
  yourself). `lineNumber` is 0-indexed, matching Obsidian's
  `Editor`/`MetadataCache` convention. Returns `undefined` if no file, block,
  or heading assignment in this vault covers that task, or its resolved
  status set/status can no longer be found (e.g. deleted) — in both cases
  the task renders as a plain, unmodified checkbox and a consumer should do
  the same.
- **`hidden`** is `true` when the governing assignment has "hide completed"
  on and this status is completed — the task is removed from the render
  entirely in the note, not just dimmed. A consumer showing its own view of
  the same task (e.g. an outline) should skip rendering it too, rather than
  show a decoration the note itself doesn't.
- **`isGlowEnabled`** reflects Status Sets' live Glow design setting, same as
  what this plugin's own dots pick up.
- **`onChange`** fires (no payload) whenever anything could change a
  previously-resolved decoration — an assignment edited, a status/color/Glow
  changed upstream in Status Sets. Re-resolve whatever you need via
  `getStatusDecoration` above. Returns an unsubscribe function; call it from
  your plugin's `onunload`.

## What this API deliberately doesn't do

- No write access. Assignments and status sets are read-only from the outside.
- No interaction hooks (cycling status, opening the popup) — those are this
  plugin's own note-content feature, not exposed for reuse yet.
