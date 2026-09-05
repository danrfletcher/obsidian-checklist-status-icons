import { App, TFile } from "obsidian";
import { AssignmentResolver } from "./assignmentResolver";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { StatusDefinition } from "./statusSetsTypes";

/**
 * What actually gets rendered for one task: the resolved status plus whether
 * it should be hidden entirely (mirrors TaskPatch's hideCompleted behavior -
 * see decorate() in taskPatch.ts, which this shares logic with).
 */
export interface ResolvedDecoration {
	color: string;
	label: string;
	isCompleted: boolean;
	/** True when the governing assignment has hideCompleted on and this status is completed - the task is removed from render entirely, not just visually. */
	hidden: boolean;
}

/**
 * Resolves the same status a task at `path`:`lineNumber` would be decorated
 * with in Reading view / Live Preview, given its raw checkbox marker
 * character (the single character between `[` and `]`). Pure/synchronous -
 * doesn't re-read file content, the caller already has the marker (from its
 * own line read or from MetadataCache's `listItems[].task`).
 *
 * Shared by TaskPatch.decorate (the actual note-content decoration) and the
 * public API (publicApi.ts), so both agree on exactly the same status for
 * the same input - a consumer calling the public API sees precisely what's
 * rendered in the note, never a slightly different computation.
 */
export function resolveDecoration(
	app: App,
	resolver: AssignmentResolver,
	dataStore: DataStore,
	statusSets: StatusSetsBridge,
	path: string,
	lineNumber: number,
	marker: string
): ResolvedDecoration | undefined {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return undefined;

	const assignment = resolver.resolve(file, lineNumber);
	if (!assignment) return undefined;

	const statusSet = statusSets.getApi()?.getStatusSet(assignment.statusSetId);
	if (!statusSet) return undefined;

	const status = statusForMarker(dataStore, statusSet.statuses, statusSet.defaultStatusId, marker);
	if (!status) return undefined;

	const hidden = !!(assignment.hideCompleted && status.isCompleted);
	return { color: status.color, label: status.label, isCompleted: !!status.isCompleted, hidden };
}

/**
 * Shared with taskActions.ts (cycling/applying a status writes and reads
 * back through this exact same logic) so a task's rendered status and its
 * "current status" for cycling purposes never disagree.
 */
export function statusForMarker(
	dataStore: DataStore,
	statuses: StatusDefinition[],
	defaultStatusId: string,
	marker: string
): StatusDefinition | undefined {
	if (marker === " ") {
		return statuses.find((s) => s.id === defaultStatusId);
	}
	const statusId = dataStore.getStatusIdForChar(marker);
	const mapped = statuses.find((s) => s.id === statusId);
	if (mapped) return mapped;
	// "x"/"X" is Obsidian's own native completed-checkbox marker - a task
	// can carry it without ever having been cycled through this plugin (a
	// native checkbox click, another plugin, etc.), so it won't have an
	// entry in this vault's char map. Rather than fail to resolve entirely,
	// treat it as whichever status in the set is marked completed, but only
	// when that's unambiguous - if the set has none or more than one, there's
	// no single right answer, so fall through to unresolved as before.
	if (marker === "x" || marker === "X") {
		const completed = statuses.filter((s) => s.isCompleted);
		if (completed.length === 1) return completed[0];
	}
	return undefined;
}
