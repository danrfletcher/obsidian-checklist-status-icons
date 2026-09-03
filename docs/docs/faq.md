# FAQ and Troubleshooting

## Nothing happens when I open the plugin's settings

Check that [Status Sets](https://danrfletcher.github.io/obsidian-file-folder-status-icons/)
is both installed and enabled — the settings tab shows a dependency prompt
instead of its normal contents until it is.

## A task's dot won't change / clicking does nothing

- Confirm the task is actually inside an assigned scope — tasks outside any
  assignment render as plain native checkboxes, unchanged.
- Right-click the dot to open the manual picker and confirm a status set is
  actually attached — an assignment pointing at a deleted status set can't
  resolve a color.

## I renamed a status and my old tasks look wrong

They shouldn't — the character-to-status mapping follows the status's id,
not its name, so a rename alone doesn't affect already-written tasks. If
something looks off after a rename, see
[Markdown Status Marker](reference/markdown-marker.md) for the cases that
*do* affect it (moving a note between vaults, resetting this plugin's data).

## A heading-scoped assignment stopped working

Heading assignments are matched by heading text, the same way Obsidian's
own `[[Note#Heading]]` links work — if the heading text changes or the
heading moves, the assignment can't find it anymore. This is a known,
accepted limitation (documented in
[Assignment Scopes](reference/scopes.md)); use a block assignment instead
if you need something more durable.

## Does this touch my notes' frontmatter?

No. The only thing written into note content is the single-character status
marker inside the task's own brackets (`- [ ]` → `- [I]`, etc.) — see
[Markdown Status Marker](reference/markdown-marker.md). Nothing is added to
frontmatter, and assignments themselves live in this plugin's own data file,
not in your notes.

## Does this work on mobile?

Not currently — like Status Sets, this plugin is desktop-only.
