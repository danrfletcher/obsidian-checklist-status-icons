import { App, TFile } from "obsidian";
import { AssignmentResolver } from "./assignmentResolver";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { resolveDecoration } from "./decorationResolver";
import { cycleTaskStatus, openTaskStatusPopupAction } from "./taskActions";

/**
 * Public contract for `app.plugins.plugins['checklist-status-icons'].api`,
 * consumed by other plugins that want to mirror this plugin's per-task
 * status decoration outside of Reading view / Live Preview (e.g. Loud
 * Outline showing the same status in the file tree). Mirrors the pattern
 * Status Sets itself uses for `StatusSetsPublicApi` (see statusSetsTypes.ts)
 * - unstable/best-effort, versioned so a consumer can gate on compatibility.
 */
export interface TaskStatusDecoration {
	color: string;
	label: string;
	isCompleted: boolean;
	/** True when the governing assignment has "hide completed" on and this status is completed - the task is removed from render entirely in the note, not just dimmed. A consumer should do the same rather than show a decoration the note itself doesn't. */
	hidden: boolean;
}

export interface ChecklistStatusIconsPublicApi {
	readonly apiVersion: number;
	/**
	 * Resolves the status decoration for the task at `path`:`lineNumber`
	 * (0-indexed, matching Obsidian's Editor/MetadataCache convention) whose
	 * raw checkbox marker character is `marker` - the single character
	 * between `[` and `]` (`" "` for the default status, `"x"`/`"X"` or any
	 * other single character otherwise; see `ListItemCache.task` or read it
	 * directly off the line). Returns undefined if no file/block/heading
	 * assignment in this vault covers that task, or if its resolved status
	 * set/status can no longer be found (e.g. deleted) - in both cases the
	 * task renders as a plain, unmodified checkbox and a consumer should do
	 * the same.
	 */
	getStatusDecoration(path: string, lineNumber: number, marker: string): TaskStatusDecoration | undefined;
	/** Whether the live Glow design setting (from Status Sets) is currently on. */
	isGlowEnabled(): boolean;
	/** Fires on anything that could change a previously-resolved decoration: assignment edits, Status Sets' status/color/Glow edits. Returns an unsubscribe function. */
	onChange(callback: () => void): () => void;
	/**
	 * Cycles the task at `path`:`lineNumber` to the next status in its
	 * governing set's order, wrapping after the last — the same action this
	 * plugin's own dots perform on left-click. No-op (resolves with nothing
	 * changed) if no assignment covers that task or `path` doesn't resolve to
	 * a file. Writes via the file's open editor if it happens to be open
	 * (keeping cursor position/undo history intact), otherwise directly to
	 * disk — a consumer isn't limited to tasks in the active file.
	 */
	cycleTaskStatus(path: string, lineNumber: number): Promise<void>;
	/**
	 * Opens Status Sets' own status-change popup for the task at
	 * `path`:`lineNumber`, anchored to `anchor` — the same popup this
	 * plugin's own dots open on right-click, so a consumer's UI stays
	 * visually/behaviorally identical. No-op if no assignment covers that
	 * task or `path` doesn't resolve to a file.
	 */
	openTaskStatusPopup(anchor: HTMLElement, path: string, lineNumber: number): Promise<void>;
}

export const CHECKLIST_STATUS_ICONS_PLUGIN_ID = "checklist-status-icons";
export const CHECKLIST_STATUS_ICONS_API_VERSION = 1;

export class ChecklistStatusIconsApi implements ChecklistStatusIconsPublicApi {
	readonly apiVersion = CHECKLIST_STATUS_ICONS_API_VERSION;
	private readonly changeListeners = new Set<() => void>();

	constructor(
		private app: App,
		private resolver: AssignmentResolver,
		private dataStore: DataStore,
		private statusSets: StatusSetsBridge
	) {}

	getStatusDecoration(path: string, lineNumber: number, marker: string): TaskStatusDecoration | undefined {
		return resolveDecoration(this.app, this.resolver, this.dataStore, this.statusSets, path, lineNumber, marker);
	}

	isGlowEnabled(): boolean {
		return this.statusSets.getApi()?.isGlowEnabled() ?? false;
	}

	onChange(callback: () => void): () => void {
		this.changeListeners.add(callback);
		return () => this.changeListeners.delete(callback);
	}

	async cycleTaskStatus(path: string, lineNumber: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await cycleTaskStatus(this.app, this.resolver, this.dataStore, this.statusSets, file, lineNumber);
	}

	async openTaskStatusPopup(anchor: HTMLElement, path: string, lineNumber: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await openTaskStatusPopupAction(this.app, this.resolver, this.dataStore, this.statusSets, anchor, file, lineNumber);
	}

	/** Called by main.ts on every event that already triggers TaskPatch.refreshAll(), so API consumers stay in sync with what's rendered in-note without duplicating the subscription plumbing. */
	notifyChange(): void {
		for (const cb of this.changeListeners) cb();
	}
}
