# Your First Assignment

This assumes you already have at least one status set defined in
[Status Sets](https://danrfletcher.github.io/obsidian-file-folder-status-icons/)
— if not, create one there first (Settings → Status Sets → New status set).

## Assign a whole file

1. Settings → Checklist Status Sets.
2. Under **Assign a file or block**, type (or autocomplete) a note's path,
   e.g. `Projects/Website Redesign.md`.
3. Pick a status set from the dropdown.
4. Click **Assign**.

Every `- [ ]` task in that file is now governed by that status set. A new,
unmarked task shows the set's default status immediately.

## Try it

Open the note. Each task shows a colored dot instead of the usual checkbox:

- **Left-click** the dot to cycle to the next status.
- **Right-click** the dot to pick any status directly.

## Narrower scopes

The same "Assign a file or block" field also accepts:

- `Note.md^` — lists blocks in that file to assign just one (optionally with
  its nested subtasks). If the block doesn't have an id yet, one is created
  automatically.
- `Note.md#` — lists headings in that file to assign everything under one.

See [Assignment Scopes](../reference/scopes.md) for the full detail on how
each behaves, including what happens if the file is renamed or the heading
text changes.
