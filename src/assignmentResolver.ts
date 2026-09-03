import { App, CachedMetadata, HeadingCache, TFile } from "obsidian";
import { Assignment, BlockAssignment, HeadingAssignment, FileAssignment } from "./types";
import { DataStore } from "./dataStore";

function isBlock(a: Assignment): a is BlockAssignment {
	return a.scope === "block";
}
function isHeading(a: Assignment): a is HeadingAssignment {
	return a.scope === "heading";
}
function isFile(a: Assignment): a is FileAssignment {
	return a.scope === "file";
}

/** True if the list item at `lineNumber` is nested (directly or transitively) under the list item at `ancestorLine`. */
function isDescendantListItem(cache: CachedMetadata | null, ancestorLine: number, lineNumber: number): boolean {
	const items = cache?.listItems;
	if (!items) return false;
	let current = items.find((li) => li.position.start.line === lineNumber);
	const seen = new Set<number>();
	while (current) {
		const parentLine = current.parent;
		// Obsidian encodes "no list-item parent, belongs directly to a section" as a negative sentinel.
		if (parentLine == null || parentLine < 0) return false;
		if (parentLine === ancestorLine) return true;
		if (seen.has(parentLine)) return false; // cycle guard, shouldn't happen
		seen.add(parentLine);
		current = items.find((li) => li.position.start.line === parentLine);
	}
	return false;
}

/** The heading (if any) among `headings` whose section — down to the next heading of the same or higher level — contains `lineNumber`. */
function headingContainingLine(headings: HeadingCache[], headingText: string, lineNumber: number): HeadingCache | undefined {
	for (let i = 0; i < headings.length; i++) {
		const h = headings[i];
		if (h.heading !== headingText) continue;
		const start = h.position.start.line;
		if (start > lineNumber) continue;
		let end = Infinity;
		for (let j = i + 1; j < headings.length; j++) {
			if (headings[j].level <= h.level) {
				end = headings[j].position.start.line;
				break;
			}
		}
		if (lineNumber > start && lineNumber < end) return h;
	}
	return undefined;
}

/**
 * Resolves which single assignment governs a given line in a file, applying
 * "most specific scope wins": a block assignment beats a heading assignment
 * beats the whole-file assignment. Returns undefined if no assignment in
 * this file covers the line at all (the task then renders as a plain,
 * unmodified native checkbox).
 */
export class AssignmentResolver {
	constructor(private app: App, private dataStore: DataStore) {}

	resolve(file: TFile, lineNumber: number): Assignment | undefined {
		const assignments = this.dataStore.getAssignmentsForFile(file.path);
		if (assignments.length === 0) return undefined;
		const cache = this.app.metadataCache.getFileCache(file);

		const blockMatches = assignments.filter(isBlock).filter((a) => {
			const blockLine = cache?.blocks?.[a.blockId]?.position.start.line;
			if (blockLine == null) return false;
			if (blockLine === lineNumber) return true;
			return a.inheritToSubtasks && isDescendantListItem(cache, blockLine, lineNumber);
		});
		if (blockMatches.length > 0) {
			// Nearest (deepest/most-nested) ancestor block wins among overlapping block assignments.
			blockMatches.sort((a, b) => {
				const lineA = cache?.blocks?.[a.blockId]?.position.start.line ?? -1;
				const lineB = cache?.blocks?.[b.blockId]?.position.start.line ?? -1;
				return lineB - lineA;
			});
			return blockMatches[0];
		}

		const headings = cache?.headings ?? [];
		const headingMatches = assignments
			.filter(isHeading)
			.map((a) => ({ a, h: headingContainingLine(headings, a.heading, lineNumber) }))
			.filter((x): x is { a: HeadingAssignment; h: HeadingCache } => !!x.h);
		if (headingMatches.length > 0) {
			headingMatches.sort((x, y) => y.h.position.start.line - x.h.position.start.line);
			return headingMatches[0].a;
		}

		return assignments.find(isFile);
	}
}
