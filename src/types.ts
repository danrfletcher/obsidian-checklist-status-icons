/**
 * Data model for Checklist Status Icons.
 *
 * Everything here is persisted in this plugin's own data.json (via
 * Plugin#loadData / Plugin#saveData) — a separate file from Status Sets'
 * data.json. Status sets themselves (definitions, colors, completed flags)
 * are never stored here; they're read live from Status Sets' public API
 * (see statusSetsBridge.ts) and referenced here only by id.
 */

export type AssignmentScope = "file" | "block" | "heading";

interface AssignmentBase {
	id: string;
	statusSetId: string;
	hideCompleted?: boolean;
	truncatedStatuses?: Record<string, { enabled: boolean; label: string }>;
}

export interface FileAssignment extends AssignmentBase {
	scope: "file";
	/** Vault-relative path to the note. Governs every task in the file. */
	path: string;
}

export interface BlockAssignment extends AssignmentBase {
	scope: "block";
	path: string;
	/** Block id, without the leading "^" (e.g. "5gb7jk"). Tracked by id, not position. */
	blockId: string;
	/** On: governs the assigned task and all nested/indented children. Off: just the assigned task. */
	inheritToSubtasks: boolean;
}

export interface HeadingAssignment extends AssignmentBase {
	scope: "heading";
	path: string;
	/** Exact heading text (no leading #s). Matched by path + text, same as Obsidian's own heading links — no block id, because headings don't have one. */
	heading: string;
}

export type Assignment = FileAssignment | BlockAssignment | HeadingAssignment;

export interface PluginData {
	dataVersion: 1;
	assignments: Assignment[];
	/**
	 * Stable status-id -> single-character marker mapping, used only if the
	 * live spike (see docs/marker-format-decision.md) settled on the
	 * single-character encoding rather than "- [$task=NAME]". Keyed by
	 * status id (not name) so renaming a status doesn't reshuffle it.
	 * Left empty/unused if the multi-character marker won out.
	 */
	statusCharMap: Record<string, string>;
}

export function createEmptyPluginData(): PluginData {
	return {
		dataVersion: 1,
		assignments: [],
		statusCharMap: {},
	};
}

/** Generates a short, stable id for a new assignment. Mirrors Status Sets' colorUtils.generateId. */
let idCounter = 0;
export function generateAssignmentId(): string {
	return `assign-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}
