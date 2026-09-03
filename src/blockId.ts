import { App, TFile } from "obsidian";

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomBlockId(): string {
	let id = "";
	for (let i = 0; i < 6; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
	return id;
}

/** Matches Obsidian's own generated block-id format/length (e.g. "^5gb7jk") closely enough to be indistinguishable in practice. */
function generateUniqueBlockId(existingIds: Set<string>): string {
	let id = randomBlockId();
	while (existingIds.has(id)) id = randomBlockId();
	return id;
}

/**
 * Ensures the given line in `file` has a block id, appending one
 * (`" ^abc123"`) if it doesn't already end with one. Returns the id either
 * way. Uses `vault.process` for an atomic read-modify-write, so this is safe
 * whether or not the file happens to be open in an editor.
 */
export async function ensureBlockId(app: App, file: TFile, lineNumber: number): Promise<string> {
	const cache = app.metadataCache.getFileCache(file);
	const existingIds = new Set(Object.keys(cache?.blocks ?? {}));

	// Already has one? (covers re-selecting a line whose block cache entry we already know about)
	for (const [id, block] of Object.entries(cache?.blocks ?? {})) {
		if (block.position.start.line === lineNumber) return id;
	}

	const newId = generateUniqueBlockId(existingIds);
	await app.vault.process(file, (content) => {
		const lines = content.split("\n");
		const line = lines[lineNumber];
		if (line == null) return content;
		const trailingBlockRef = /\s\^[a-zA-Z0-9-]+\s*$/;
		if (trailingBlockRef.test(line)) return content; // another process already added one (race) — leave it, caller re-reads cache
		lines[lineNumber] = `${line.replace(/\s+$/, "")} ^${newId}`;
		return lines.join("\n");
	});
	return newId;
}
