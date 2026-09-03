import type { Plugin } from "obsidian";
import {
	Assignment,
	AssignmentScope,
	BlockAssignment,
	FileAssignment,
	HeadingAssignment,
	PluginData,
	createEmptyPluginData,
	generateAssignmentId,
} from "./types";
import { rewriteFilePathOnRename } from "./pathUtils";

/**
 * Owns all persisted plugin state (this plugin's own data.json — never
 * Status Sets'). Status sets themselves aren't stored here, only referenced
 * by id; see statusSetsBridge.ts for reading their live definitions.
 */
export class DataStore {
	private data: PluginData = createEmptyPluginData();
	private saveQueued = false;
	private changeListeners = new Set<() => void>();

	constructor(private plugin: Plugin) {}

	async load(): Promise<void> {
		const loaded = (await this.plugin.loadData()) as Partial<PluginData> | null;
		if (loaded && loaded.dataVersion === 1) {
			this.data = {
				dataVersion: 1,
				assignments: loaded.assignments ?? [],
				statusCharMap: loaded.statusCharMap ?? {},
			};
		} else {
			this.data = createEmptyPluginData();
		}
	}

	onChange(callback: () => void): () => void {
		this.changeListeners.add(callback);
		return () => this.changeListeners.delete(callback);
	}

	requestSave(): void {
		for (const cb of this.changeListeners) cb();
		if (this.saveQueued) return;
		this.saveQueued = true;
		void this.flushSave();
	}

	private async flushSave(): Promise<void> {
		await Promise.resolve();
		this.saveQueued = false;
		await this.plugin.saveData(this.data);
	}

	// ---------- Assignments ----------

	getAssignments(): Assignment[] {
		return this.data.assignments;
	}

	getAssignmentsForFile(path: string): Assignment[] {
		return this.data.assignments.filter((a) => a.path === path);
	}

	getAssignment(id: string): Assignment | undefined {
		return this.data.assignments.find((a) => a.id === id);
	}

	addFileAssignment(path: string, statusSetId: string): FileAssignment {
		const assignment: FileAssignment = { id: generateAssignmentId(), scope: "file", path, statusSetId };
		this.data.assignments.push(assignment);
		this.requestSave();
		return assignment;
	}

	addBlockAssignment(path: string, blockId: string, statusSetId: string): BlockAssignment {
		const assignment: BlockAssignment = {
			id: generateAssignmentId(),
			scope: "block",
			path,
			blockId,
			statusSetId,
			inheritToSubtasks: true,
		};
		this.data.assignments.push(assignment);
		this.requestSave();
		return assignment;
	}

	addHeadingAssignment(path: string, heading: string, statusSetId: string): HeadingAssignment {
		const assignment: HeadingAssignment = {
			id: generateAssignmentId(),
			scope: "heading",
			path,
			heading,
			statusSetId,
		};
		this.data.assignments.push(assignment);
		this.requestSave();
		return assignment;
	}

	updateAssignment<T extends Assignment>(id: string, patch: Partial<T>): void {
		const assignment = this.getAssignment(id);
		if (!assignment) return;
		Object.assign(assignment, patch);
		this.requestSave();
	}

	removeAssignment(id: string): void {
		this.data.assignments = this.data.assignments.filter((a) => a.id !== id);
		this.requestSave();
	}

	setTruncationRule(assignmentId: string, statusId: string, patch: { enabled?: boolean; label?: string }): void {
		const assignment = this.getAssignment(assignmentId);
		if (!assignment) return;
		assignment.truncatedStatuses ??= {};
		assignment.truncatedStatuses[statusId] = {
			enabled: assignment.truncatedStatuses[statusId]?.enabled ?? false,
			label: assignment.truncatedStatuses[statusId]?.label ?? "",
			...patch,
		};
		this.requestSave();
	}

	// ---------- Rename / delete housekeeping ----------

	handleRename(oldPath: string, newPath: string): void {
		let changed = false;
		for (const assignment of this.data.assignments) {
			const rewritten = rewriteFilePathOnRename(assignment.path, oldPath, newPath);
			if (rewritten !== assignment.path) {
				assignment.path = rewritten;
				changed = true;
			}
		}
		if (changed) this.requestSave();
	}

	handleDelete(path: string): void {
		const before = this.data.assignments.length;
		this.data.assignments = this.data.assignments.filter((a) => a.path !== path);
		if (this.data.assignments.length !== before) this.requestSave();
	}

	// ---------- Status marker character map ----------
	// Used only if the live marker-format spike settles on the single-character
	// encoding rather than "- [$task=NAME]" — see docs/marker-format-decision.md.
	// Keyed by status id (not name/label), so renaming a status in Status Sets
	// never reshuffles an already-assigned character.

	/** Every character already claimed by some status, for collision checks. */
	private usedChars(): Set<string> {
		return new Set(Object.values(this.data.statusCharMap));
	}

	/**
	 * Returns the stable marker character for a status, assigning one on
	 * first use. Deterministic: prefers the status label's own initial
	 * letters (case variants), then falls back to the first unused character
	 * in a fixed preference sequence, so two statuses whose names collide on
	 * the same first letter still land on distinct, reproducible characters.
	 */
	getOrAssignStatusChar(statusId: string, label: string): string {
		const existing = this.data.statusCharMap[statusId];
		if (existing) return existing;

		const used = this.usedChars();
		const candidates = charCandidatesForLabel(label);
		const picked = candidates.find((c) => !used.has(c)) ?? firstUnusedFallbackChar(used);

		this.data.statusCharMap[statusId] = picked;
		this.requestSave();
		return picked;
	}

	getStatusIdForChar(char: string): string | undefined {
		for (const [statusId, mapped] of Object.entries(this.data.statusCharMap)) {
			if (mapped === char) return statusId;
		}
		return undefined;
	}
}

/** e.g. "In Progress" -> ["I", "i", "P", "p"] (initial letter, then its lowercase, then same for the second word). */
function charCandidatesForLabel(label: string): string[] {
	const words = label.trim().split(/\s+/).filter(Boolean);
	const candidates: string[] = [];
	for (const word of words.slice(0, 3)) {
		const ch = word[0];
		if (!ch) continue;
		candidates.push(ch.toUpperCase(), ch.toLowerCase());
	}
	return candidates;
}

const FALLBACK_SEQUENCE = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghjklmnopqrstuvwxyz0123456789".split("");

function firstUnusedFallbackChar(used: Set<string>): string {
	const found = FALLBACK_SEQUENCE.find((c) => !used.has(c));
	if (!found) throw new Error("Exhausted the fallback character sequence — implausibly many statuses defined.");
	return found;
}

export type { AssignmentScope };
