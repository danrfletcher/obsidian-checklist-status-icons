# Public API (for plugin developers)

Checklist Status Sets exposes a small API so another plugin can find out
what status decoration (if any) it would render for a given task, and — if
it wants tasks in its own UI to actually be changeable — cycle or open the
picker for that task's status, without reimplementing assignment resolution,
marker encoding, or reaching into this plugin's own data.

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

    cycleTaskStatus(path: string, lineNumber: number): Promise<void>;

    openTaskStatusPopup(
        anchor: HTMLElement,
        path: string,
        lineNumber: number
    ): Promise<void>;
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
- **`cycleTaskStatus(path, lineNumber)`** cycles that task to the next status
  in its governing set's order, wrapping after the last — the same action
  this plugin's own dots perform on left-click. Writes via the file's open
  editor if it happens to be open (keeping cursor position/undo history
  intact), otherwise directly to disk, so a consumer isn't limited to tasks
  in the currently-active file. No-op if no assignment covers that task.
- **`openTaskStatusPopup(anchor, path, lineNumber)`** opens Status Sets' own
  status-change popup for that task, anchored to `anchor` — the same popup
  this plugin's own dots open on right-click, so a consumer's UI stays
  visually and behaviorally identical rather than reimplementing it. No-op
  if no assignment covers that task.

## What this API deliberately doesn't do

- No access to status sets or assignments themselves beyond what
  `getStatusDecoration` resolves for one task at a time — a consumer reads
  and changes individual task status, it doesn't manage status sets or
  assignments (that's this plugin's and Status Sets' own settings UI).
