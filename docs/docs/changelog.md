# Changelog

## 0.2.1

- Fixed a regression where status dots stopped rendering on assigned tasks in
  **Reading view** (Live Preview was unaffected). The CSS rule that hides the
  native checkbox glyph once a task is decorated matched the wrong element,
  so the checkbox stayed visible and rendered on top of the dot, hiding it
  completely.

## 0.2.0

- Added a small [public API](reference/public-api.md)
  (`app.plugins.plugins['checklist-status-icons'].api`) so another plugin can
  resolve the same status decoration this plugin renders for a given task,
  and cycle or open the status picker for it, without reimplementing
  assignment resolution or marker encoding. Built to support
  [Loud Outline](https://danrfletcher.github.io/obsidian-loud-outline/)
  matching its file-tree checkbox icons to whatever this plugin renders in
  the note, and letting clicking those icons actually change the task's
  status.

## 0.1.1

- Renamed the plugin to **Checklist Status Sets** (from "Checklist Status
  Icons") — matches the companion plugin's own name, "File Folder Status
  Sets", as one recognizable brand across both. The plugin id
  (`checklist-status-icons`) and repo are unchanged; only the display name.

## 0.1.0

Initial release.

- **Three assignment scopes**: whole file, a block (with optional inherit to
  subtasks), or a heading section.
- Status is encoded as a single character in the task's own brackets
  (`- [ ]` for the default status, `- [X]` for every other status),
  auto-assigned per status id — see
  [Markdown Status Marker](reference/markdown-marker.md) for why, after
  testing a more readable alternative live and finding it isn't recognized
  as a task at all.
- Status icons render identically to Status Sets' file-tree dots (including
  Glow), in both Live Preview and Reading view.
- Left-click cycles status; right-click opens Status Sets' own status-change
  popup, reused as-is via its new public API.
- **Hide completed** actually removes completed tasks from the rendered
  note, not just visually.
- File/block/heading target autocomplete, including automatic block-id
  generation for a block that doesn't have one yet.
- Assignments survive file renames and (for block scope) the block moving
  anywhere in the file.
