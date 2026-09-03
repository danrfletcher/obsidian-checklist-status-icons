/**
 * Reading/writing a task's status marker in raw markdown.
 *
 * Decided via a live spike (see docs/marker-format-decision.md): only a
 * single character between the brackets is recognized by Obsidian's own
 * task parser as a real task at all — anything longer renders as a plain
 * bullet with the literal bracket text visible, not a checkbox. So the
 * marker is always exactly one character; the default status is always a
 * plain space (`- [ ]`), and every other status gets a stable, per-vault
 * character assigned by DataStore.getOrAssignStatusChar (see dataStore.ts).
 *
 * Matching rule: the marker must be the first thing on the line, aside from
 * leading whitespace/indentation — same as Obsidian's own task syntax.
 */

const TASK_LINE_RE = /^(\s*)([-*+])(\s\[)(.)(\]\s?)(.*)$/;

export interface ParsedTaskLine {
	indent: string;
	bullet: string;
	marker: string;
	rest: string;
}

export function parseTaskLine(line: string): ParsedTaskLine | null {
	const m = TASK_LINE_RE.exec(line);
	if (!m) return null;
	return { indent: m[1], bullet: m[2], marker: m[4], rest: m[6] };
}

export function isTaskLine(line: string): boolean {
	return TASK_LINE_RE.test(line);
}

/** Rewrites a task line's marker character, preserving everything else about the line. */
export function withMarker(line: string, marker: string): string {
	const parsed = parseTaskLine(line);
	if (!parsed) return line;
	return `${parsed.indent}${parsed.bullet} [${marker}] ${parsed.rest}`;
}

export const DEFAULT_MARKER = " ";
