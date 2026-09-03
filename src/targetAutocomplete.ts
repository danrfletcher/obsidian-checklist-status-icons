import { App, TFile } from "obsidian";

const MAX_SUGGESTIONS = 30;

export type TargetSuggestion =
	| { kind: "file"; path: string; label: string }
	| { kind: "block"; path: string; blockId: string; label: string }
	/** A list item with no block id yet — selecting it creates one (see blockId.ts). */
	| { kind: "block-candidate"; path: string; lineNumber: number; label: string }
	| { kind: "heading"; path: string; heading: string; label: string };

function allMarkdownFiles(app: App): TFile[] {
	return app.vault.getMarkdownFiles();
}

/**
 * Type-ahead for the "Assign a file or block" field: files only (never
 * folders), with `^`/`#` after a valid file path extending into that file's
 * blocks/headings — mirroring Obsidian's own `[[Note^` / `[[Note#`
 * block-link/heading-link autocomplete. Backed by
 * `MetadataCache.getFileCache(file).blocks`/`.headings`.
 */
export function attachTargetAutocomplete(opts: { input: HTMLInputElement; app: App; onSelect: (s: TargetSuggestion) => void }): void {
	const { input, app, onSelect } = opts;
	let popup: HTMLElement | null = null;

	function close(): void {
		popup?.remove();
		popup = null;
	}

	async function suggestionsFor(query: string): Promise<TargetSuggestion[]> {
		const blockIdx = query.indexOf("^");
		const headingIdx = query.indexOf("#");
		const splitIdx = [blockIdx, headingIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];

		if (splitIdx == null) {
			const q = query.toLowerCase();
			return allMarkdownFiles(app)
				.filter((f) => f.path.toLowerCase().includes(q))
				.slice(0, MAX_SUGGESTIONS)
				.map((f) => ({ kind: "file", path: f.path, label: f.path }));
		}

		const pathPart = query.slice(0, splitIdx);
		const file = app.vault.getAbstractFileByPath(pathPart);
		if (!(file instanceof TFile)) return [];
		const cache = app.metadataCache.getFileCache(file);

		if (query[splitIdx] === "^") {
			const q = query.slice(splitIdx + 1).toLowerCase();
			const blocks = cache?.blocks ?? {};
			const existingIdLines = new Set(Object.values(blocks).map((b) => b.position.start.line));
			const idSuggestions: TargetSuggestion[] = Object.keys(blocks)
				.filter((id) => id.toLowerCase().includes(q))
				.map((id) => ({ kind: "block", path: file.path, blockId: id, label: `${file.path} ^${id}` }));

			// List items with no block id yet — pick one and this plugin creates the id (see blockId.ts).
			const listItems = cache?.listItems ?? [];
			const lines = (await app.vault.cachedRead(file)).split("\n");
			const candidateSuggestions: TargetSuggestion[] = listItems
				.filter((li) => !existingIdLines.has(li.position.start.line))
				.map((li) => {
					const lineNumber = li.position.start.line;
					const preview = (lines[lineNumber] ?? "").trim().slice(0, 60);
					return { kind: "block-candidate" as const, path: file.path, lineNumber, label: `${file.path} — "${preview}" (new block id)` };
				})
				.filter((s) => s.label.toLowerCase().includes(q));

			return [...idSuggestions, ...candidateSuggestions].slice(0, MAX_SUGGESTIONS);
		}

		const q = query.slice(splitIdx + 1).toLowerCase();
		const headings = cache?.headings ?? [];
		return headings
			.filter((h) => h.heading.toLowerCase().includes(q))
			.slice(0, MAX_SUGGESTIONS)
			.map((h) => ({ kind: "heading", path: file.path, heading: h.heading, label: `${file.path} > ${h.heading}` }));
	}

	let requestToken = 0;
	async function render(): Promise<void> {
		const token = ++requestToken;
		const suggestions = await suggestionsFor(input.value);
		if (token !== requestToken) return; // a newer keystroke superseded this request
		close();
		if (suggestions.length === 0) return;

		popup = input.doc.body.createDiv({ cls: "csi-popup csi-autocomplete" });
		const rect = input.getBoundingClientRect();
		popup.setCssStyles({ left: `${Math.round(rect.left)}px`, top: `${Math.round(rect.bottom + 4)}px`, width: `${Math.round(rect.width)}px` });

		for (const s of suggestions) {
			const row = popup.createDiv({ cls: "csi-popup-item" });
			row.createSpan({ cls: "csi-popup-label", text: s.label });
			// mousedown, not click, so this fires before the input's blur closes the popup.
			row.addEventListener("mousedown", (evt) => {
				evt.preventDefault();
				onSelect(s);
				close();
			});
		}
	}

	input.addEventListener("input", render);
	input.addEventListener("focus", render);
	input.addEventListener("blur", () => window.setTimeout(close, 100));
}
