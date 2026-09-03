# Assignment Scopes

An assignment means "this scope's tasks are *governed by* (rendered and
interactive using) this status set" — not that every task in scope shares
one status. Each task still tracks its own current status independently;
the assignment just determines which status set's vocabulary, colors, and
order apply.

## Whole file

Governs every task in the file. No inherit toggle — it isn't configurable,
it's just all tasks.

Tracked by path. Survives the file being renamed or moved (same path-rewrite
pattern Status Sets uses for folders).

## A block

Assign a specific block (a task and, optionally, its nested subtasks).

- If the block doesn't already have a block id (`^abc123`), one is generated
  and appended when you assign it.
- **Inherit to subtasks** (on by default): governs the assigned task and
  everything nested/indented under it. Turn it off to govern just that one
  task.
- Tracked by block id, not position — survives the block moving anywhere:
  the file being renamed, or the block itself being cut and pasted elsewhere
  in the same file.

## A heading

Assign everything under a heading, down to the next heading of the same or
higher level.

- Matched by file path + heading text — the same way Obsidian's own
  `[[Note#Heading]]` links work. No block id, because headings don't have
  one.
- Always governs the whole range; there's no inherit toggle for headings —
  if you need finer control, assign by block instead.
- **This breaks if the heading text changes or the heading moves** —
  exactly the same limitation as Obsidian's own heading links. If durability
  matters more than convenience, use a block assignment instead.

## Precedence when scopes overlap

If a task falls inside more than one assignment (e.g. a block assignment
inside a heading-assigned section), the most specific scope wins: **block
beats heading beats whole file**.
