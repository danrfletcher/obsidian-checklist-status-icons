# Checklist Status Icons — Build Task List

Companion plugin to Status Sets (`file-folder-status-icons`). Applies the same
status sets to checklist items inside notes (whole file / block / heading scope).

Plugin id: `checklist-status-icons`. Repo: `obsidian-checklist-status-icons`.

Process reference: see conversation — build end to end, test visually in the
`desktop-obsidian-2` container, PR + GitHub release, docs site, stop for user
testing, then Obsidian marketplace submission + automated review fixups.

---

## 0. Status Sets: public API addition (prerequisite)

**Acceptance criteria**
- [ ] `file-folder-status-icons` exposes a typed public API off the plugin
      instance (e.g. `app.plugins.plugins['file-folder-status-icons'].api`),
      documented with a `PublicApi` (or similar) interface exported from the
      plugin's types.
- [ ] `getStatusSets(): StatusSet[]` and `getStatusSet(id): StatusSet | undefined`
      return read-only views (deep-enough copies or frozen objects) of the
      current status set definitions — consumers can't mutate Status Sets'
      data through them.
- [ ] `isGlowEnabled(): boolean` reflects the live Glow design setting.
- [ ] `openStatusPopup(...)` is exported and reusable by another plugin to
      open the exact same status-change popup component (same params it uses
      internally: anchor element/position, current status, status set,
      on-select callback).
- [ ] API is versioned or at minimum documented as "unstable, may change" in
      Status Sets' own docs, since a second plugin now depends on it.
- [ ] Existing Status Sets behavior/tests are unaffected — this is additive
      only, no changes to data.json shape or existing UI.
- [ ] Manual check: with only Status Sets installed (not the new plugin),
      everything behaves exactly as before.

---

## 1. New plugin scaffold

**Acceptance criteria**
- [ ] Repo `obsidian-checklist-status-icons` created, mirroring the existing
      repo's toolchain (esbuild, tsconfig, eslint, manifest.json id
      `checklist-status-icons`, name "Checklist Status Icons").
- [ ] `package.json`/`manifest.json`/`versions.json` wired for the same
      version-bump flow as the existing plugin.
- [ ] On load: if `file-folder-status-icons` isn't installed+enabled, plugin
      shows a settings-tab message + "Install/enable Status Sets" button/link
      and hides all other settings. Verified by disabling Status Sets in a
      test vault and confirming the message appears and no crash occurs.
- [ ] Plugin has its own data file (separate from Status Sets' data.json) for
      assignments; confirmed by inspecting `.obsidian/plugins/*/data.json` for
      both plugins after using the new plugin — no cross-writes.

---

## 2. Data model: assignments

**Acceptance criteria**
- [ ] Assignment record covers three scope kinds: `file`, `block`, `heading`,
      each with: target (path, or path+blockId, or path+heading text),
      statusSetId, hideCompleted, truncateStatuses, and (block-only)
      inheritToSubtasks.
- [ ] File-scope assignment survives file rename/move (reuse Status Sets'
      path-rewrite-on-rename pattern) — verified by renaming a file with an
      active assignment and confirming the assignment follows it.
- [ ] Block-scope assignment is tracked by block ID, not position — verified
      by cutting/pasting the assigned block elsewhere in the same file (and
      across a file rename) and confirming the assignment still applies.
- [ ] Heading-scope assignment is matched by path + heading text only (no
      block id) — verified that editing the heading text or moving it breaks
      the assignment (expected/documented limitation), and that this doesn't
      crash, just silently stops applying.

---

## 3. Settings UI: "File and block assignments"

**Acceptance criteria**
- [ ] Section renamed from "Folder assignments" pattern to "File and block
      assignments"; "Assign a folder" → "Assign a file or block".
- [ ] Type-ahead autocomplete offers only files, never folders.
- [ ] Typing `^` after a valid file path lists every block in that file
      (from `MetadataCache.getFileCache(file).blocks`); typing `#` lists every
      heading (`.headings`).
- [ ] Selecting a block with no existing block ID appends one to the block's
      line, using Obsidian's native ID-generation format/command if triggerable
      (verify via `app.commands` for a "Copy block link"-equivalent command;
      otherwise generate a same-shaped random id, e.g. `^[a-z0-9]{6}`, matching
      observed native format) — confirm the note content is correctly modified
      and the id is unique in that file.
- [ ] Per-assignment row options match scope:
  - File: status set dropdown, hide completed, truncate statuses. No inherit
    toggle shown.
  - Block: same + inherit-to-subtasks toggle (default on).
  - Heading: same as file (no inherit toggle).
- [ ] Status set dropdown is populated live from Status Sets via the public API.
- [ ] Removed entirely (not applicable here): "Apply statuses to (files vs.
      folders)" toggle.

---

## 4. Markdown status marker — spike + decision

**Acceptance criteria (spike, done first, blocks task 5)**
- [ ] Scratch-test in the container: create `- [$task=IN PROGRESS]` line in a
      real note, screenshot Live Preview and Reading view, confirm whether
      Obsidian's own task parser recognizes it as a checkbox/task at all (vs
      rendering as a literal bullet with bracket text).
- [ ] If it does NOT parse as a task reliably, scratch-test the
      single-character mapping approach (e.g. `- [I]`) the same way.
- [ ] Decision recorded in `docs/` or code comments: which approach was
      chosen and why, with the screenshots referenced.
- [ ] If single-character mapping is chosen: mapping is keyed by status id
      (not name) in this plugin's own data file, stable across reorders,
      deterministic collision handling documented (e.g. first free char in
      a preferred sequence derived from the name, falling back to any unused
      char).
- [ ] Default status is always plain `- [ ]` regardless of chosen approach.
- [ ] Matching rule implemented: marker must be first thing on the line after
      leading whitespace — verified with an indented sub-task.
- [ ] Rename-orphaning tradeoff documented in the new plugin's README/docs
      (renaming a status in Status Sets orphans existing written markers).

---

## 5. Rendering: task status icons

**Acceptance criteria**
- [ ] Native checkbox glyph is fully replaced (not overlaid) by the
      traffic-light dot, in both Live Preview and Reading view.
- [ ] Visual output (size, color, glow) is pixel-equivalent to Status Sets'
      file-tree dots — verified by screenshot comparison side-by-side.
- [ ] Glow follows Status Sets' live Glow setting (toggle it in Status Sets,
      confirm task icons in an already-open note update without reload).
- [ ] A brand new `- [ ]` task immediately shows the default status's color.
- [ ] Works with nested/indented sub-tasks.

---

## 6. Interaction

**Acceptance criteria**
- [ ] Left-click cycles to next status in set order, wrapping after the last.
- [ ] Right-click opens Status Sets' actual popup component (via public API)
      for manual selection of any status.
- [ ] Hide-completed assignments actually remove completed-status tasks from
      the render tree in both Live Preview and Reading view (verified: not
      just `display:none`, e.g. check DOM node count or a screen-reader test).
- [ ] Truncate-statuses: 2+ sibling tasks sharing a truncation-enabled status
      collapse into one placeholder line (e.g. "3 Ideas"); clicking expands.
- [ ] Expanded group: left-click on a member cycles status after a short
      delay (cancelable by a following double-click within the delay window);
      right-click opens manual popup; double-click on any member re-collapses
      the group.
- [ ] All of the above verified in both Live Preview and Reading view.

---

## 7. Edge cases to explicitly test in-container

- [ ] Task with no assignment in scope at all (no file/block/heading
      assignment covers it) → renders as plain native checkbox, unmodified.
- [ ] Overlapping assignments (e.g. a block assignment inside a heading-scoped
      range) — nearest/most-specific scope wins; document and test the
      precedence rule chosen.
- [ ] Two statuses whose names collide on first-letter (if single-char
      mapping route taken) — confirm deterministic distinct chars assigned.
- [ ] Status renamed in Status Sets after markers already written — orphaned
      tasks fail gracefully (render as unknown/default, not crash).
- [ ] Status set deleted entirely while assignments reference it — assignment
      row + governed tasks degrade gracefully (no crash, clear UI indicator).
- [ ] Block assignment where the block is later deleted — assignment becomes
      inert, no crash, ideally surfaced in settings UI as "target not found".
- [ ] Heading assignment where heading text is duplicated elsewhere in the
      file — first match / documented behavior, no crash.
- [ ] File containing thousands of tasks — sanity-check render performance.
- [ ] Status Sets disabled *after* Checklist Status Icons already has
      assignments configured — settings hide gracefully, previously-rendered
      icons don't crash the editor.
- [ ] Vault with the dependency plugin missing entirely (fresh install order:
      Checklist Status Icons installed before Status Sets) — no crash on load.

---

## 8. Support section, repo scaffolding, docs

**Acceptance criteria**
- [ ] README Support section: Report a bug / Request a feature / Buy Me a
      Coffee (buymeacoffee.com/danrfletcher), matching existing repo's exact
      markdown/badges, pointed at the new repo.
- [ ] GitHub Discussions enabled with an Ideas category; pinned welcome post
      adapted from the existing repo's pinned post (content captured already —
      swap repo name references).
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml` + `config.yml` copied/adapted
      from the existing repo.
- [ ] Docs: new mkdocs/GitHub Pages site (or folded into existing docs site —
      decide during build), with backlinks added both directions between the
      two plugins' docs.
- [ ] Docs cover: dependency requirement, three assignment scopes, markdown
      marker format chosen (task 4) and its rename-orphaning caveat, heading
      durability caveat (recommend block assignment instead).

---

## 9. Release

**Acceptance criteria**
- [ ] PR opened against `main`, CI/build green.
- [ ] GitHub release published (tag matches manifest version, changelog).
- [ ] Docs site live.
- [ ] Stop and ping user for manual testing before Obsidian marketplace submission.
- [ ] After user confirms: submit/publish via Obsidian's plugin release flow
      (browser-driven inside the container, using the signed-in account).
- [ ] Wait for Obsidian's automated review; fix any flagged issues with a
      follow-up PR/docs update/patch release if needed.
