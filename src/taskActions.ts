import { App, MarkdownView, TFile } from "obsidian";
import { AssignmentResolver } from "./assignmentResolver";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { StatusDefinition, StatusSet } from "./statusSetsTypes";
import { parseTaskLine, withMarker } from "./statusMarker";
import { statusForMarker } from "./decorationResolver";

/**
 * Actually changing a task's status: resolving what it currently is, and
 * writing a new marker. Shared by TaskPatch's own click-to-cycle/right-click
 * popup (the note's own dots) and the public API's cycleTaskStatus/
 * openTaskStatusPopup (e.g. Loud Outline's file-tree icons), so both ever
 * write the exact same encoding — mirrors decorationResolver.ts sharing the
 * read side for the same reason.
 *
 * Reads/writes via an open editor when the file happens to be open (keeps
 * cursor position and undo history intact, same as TaskPatch always did),
 * falling back to vault.process when it isn't — a consumer like Loud Outline
 * may reference tasks in files that aren't open in any pane.
 */

function findOpenView(app: App, file: TFile): MarkdownView | undefined {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view as MarkdownView;
		if (view.file?.path === file.path) return view;
	}
	return undefined;
}

async function readLine(app: App, file: TFile, lineNumber: number): Promise<string | null> {
	const view = findOpenView(app, file);
	if (view) {
		try {
			return view.editor.getLine(lineNumber);
		} catch {
			return null;
		}
	}
	const content = await app.vault.read(file);
	return content.split("\n")[lineNumber] ?? null;
}

async function writeLine(app: App, file: TFile, lineNumber: number, newLine: string): Promise<void> {
	const view = findOpenView(app, file);
	if (view) {
		try {
			view.editor.setLine(lineNumber, newLine);
			return;
		} catch {
			// Fall through to vault.process below.
		}
	}
	await app.vault.process(file, (content) => {
		const lines = content.split("\n");
		if (lines[lineNumber] == null) return content;
		lines[lineNumber] = newLine;
		return lines.join("\n");
	});
}

export interface ResolvedTaskStatus {
	statusSet: StatusSet;
	/** undefined if the marker doesn't map to any status in the set (e.g. an orphaned character, or an unmapped native "x" in a set with no single unambiguous completed status). */
	currentStatus: StatusDefinition | undefined;
}

/** Resolves the governing status set and current status for the task at `file`:`lineNumber`, or undefined if no assignment covers it. */
export async function resolveTaskStatus(
	app: App,
	resolver: AssignmentResolver,
	dataStore: DataStore,
	statusSets: StatusSetsBridge,
	file: TFile,
	lineNumber: number,
): Promise<ResolvedTaskStatus | undefined> {
	const assignment = resolver.resolve(file, lineNumber);
	if (!assignment) return undefined;
	const statusSet = statusSets.getApi()?.getStatusSet(assignment.statusSetId);
	if (!statusSet) return undefined;
	const line = await readLine(app, file, lineNumber);
	if (line == null) return undefined;
	const parsed = parseTaskLine(line);
	if (!parsed) return undefined;
	const currentStatus = statusForMarker(dataStore, statusSet.statuses, statusSet.defaultStatusId, parsed.marker);
	return { statusSet, currentStatus };
}

/** Writes `status`'s marker to the task at `file`:`lineNumber`, preserving the rest of the line. */
export async function applyTaskStatus(app: App, dataStore: DataStore, file: TFile, lineNumber: number, statusSet: StatusSet, status: StatusDefinition): Promise<void> {
	const isDefault = status.id === statusSet.defaultStatusId;
	const marker = isDefault ? " " : dataStore.getOrAssignStatusChar(status.id, status.label);
	const line = await readLine(app, file, lineNumber);
	if (line == null) return;
	await writeLine(app, file, lineNumber, withMarker(line, marker));
}

/** Cycles the task at `file`:`lineNumber` to the next status in its governing set's order, wrapping after the last. No-op if no assignment covers it. */
export async function cycleTaskStatus(
	app: App,
	resolver: AssignmentResolver,
	dataStore: DataStore,
	statusSets: StatusSetsBridge,
	file: TFile,
	lineNumber: number,
): Promise<void> {
	const resolved = await resolveTaskStatus(app, resolver, dataStore, statusSets, file, lineNumber);
	if (!resolved) return;
	const { statusSet, currentStatus } = resolved;
	const currentIndex = currentStatus ? statusSet.statuses.findIndex((s) => s.id === currentStatus.id) : -1;
	const next = statusSet.statuses[(currentIndex + 1) % statusSet.statuses.length];
	await applyTaskStatus(app, dataStore, file, lineNumber, statusSet, next);
}

/** Opens Status Sets' own status-change popup for the task at `file`:`lineNumber`, anchored to `anchor`. No-op if no assignment covers it. */
export async function openTaskStatusPopupAction(
	app: App,
	resolver: AssignmentResolver,
	dataStore: DataStore,
	statusSets: StatusSetsBridge,
	anchor: HTMLElement,
	file: TFile,
	lineNumber: number,
): Promise<void> {
	const resolved = await resolveTaskStatus(app, resolver, dataStore, statusSets, file, lineNumber);
	if (!resolved) return;
	const { statusSet, currentStatus } = resolved;
	statusSets.getApi()?.openStatusPopup({
		anchor,
		statusSet,
		currentStatusId: currentStatus?.id ?? "",
		onSelect: (status) => {
			void applyTaskStatus(app, dataStore, file, lineNumber, statusSet, status);
		},
	});
}
