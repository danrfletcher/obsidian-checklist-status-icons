import { App, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { AssignmentResolver } from "./assignmentResolver";
import { isTaskLine, parseTaskLine } from "./statusMarker";
import { resolveDecoration } from "./decorationResolver";
import { cycleTaskStatus, openTaskStatusPopupAction } from "./taskActions";

const DOT_CLASS = "csi-dot";
const DECORATED_ATTR = "data-csi-decorated";

/**
 * Renders and drives this plugin's status dots on top of Obsidian's native
 * task checkboxes, in both Reading view (`li.task-list-item > input`, with a
 * stable `data-line`) and Live Preview (`label.task-list-label > input`,
 * inside a `.cm-line` — no data-line, so the line number is derived from
 * CodeMirror's own `posAtDOM`).
 *
 * Deliberately DOM/MutationObserver-based, not a custom CodeMirror
 * ViewPlugin — same rationale as Status Sets' ExplorerPatch: reading
 * already-rendered DOM is far more stable across Obsidian releases than
 * reimplementing part of its render pipeline, and it means Reading view and
 * Live Preview share one code path instead of two.
 */
export class TaskPatch {
	private leafViews = new WeakMap<HTMLElement, MarkdownView>();
	private observers = new Map<WorkspaceLeaf, MutationObserver>();
	private windowsWithListener = new WeakSet<Window>();

	constructor(private app: App, private dataStore: DataStore, private statusSets: StatusSetsBridge, private resolver: AssignmentResolver) {}

	enable(): void {
		this.app.workspace.onLayoutReady(() => {
			this.attachAll();
			this.registerMousedownInterceptor(window);
		});
	}

	disable(): void {
		for (const observer of this.observers.values()) observer.disconnect();
		this.observers.clear();
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			view.containerEl.querySelectorAll(`.${DOT_CLASS}`).forEach((el) => el.remove());
			view.containerEl.querySelectorAll(`[${DECORATED_ATTR}]`).forEach((el) => el.removeAttribute(DECORATED_ATTR));
		}
	}

	/** Re-runs decoration on every open markdown view — call after any setting/assignment change (e.g. Glow toggled in Status Sets). */
	refreshAll(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			this.processView(leaf.view as MarkdownView);
		}
	}

	private attachAll(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			this.attachToLeaf(leaf);
		}
		this.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf && leaf.view instanceof MarkdownView) this.attachToLeaf(leaf);
		});
		this.app.workspace.on("layout-change", () => {
			for (const leaf of this.app.workspace.getLeavesOfType("markdown")) this.attachToLeaf(leaf);
		});
	}

	private attachToLeaf(leaf: WorkspaceLeaf): void {
		if (this.observers.has(leaf)) return;
		const view = leaf.view as MarkdownView;
		this.leafViews.set(view.containerEl, view);

		const observer = new MutationObserver(() => this.processView(view));
		observer.observe(view.contentEl, { childList: true, subtree: true });
		this.observers.set(leaf, observer);

		this.registerMousedownInterceptor(view.containerEl.win ?? window);
		this.processView(view);
	}

	// ---------- Decoration ----------

	private processView(view: MarkdownView): void {
		const file = view.file;
		if (!file) return;
		if (this.dataStore.getAssignmentsForFile(file.path).length === 0) return;

		const glow = this.statusSets.getApi()?.isGlowEnabled() ?? false;
		view.containerEl.toggleClass("csi-glow", glow);

		// Reading view: <input class="task-list-item-checkbox" data-line="N"> directly inside <li class="task-list-item">.
		// N is NOT an absolute document line number — verified live it's local to
		// whatever section Obsidian's renderer chunked the content into (resets
		// to 0 after each heading), so reading it directly maps checkboxes to the
		// wrong line entirely. Match each rendered <li> to MetadataCache's own
		// listItems (which does have absolute lines) by DOM order instead — both
		// are produced top-to-bottom in document order, so a straight zip lines
		// them up correctly without needing to decode data-line's real meaning.
		const taskLines = (this.app.metadataCache.getFileCache(file)?.listItems ?? [])
			.filter((li) => li.task !== undefined)
			.map((li) => li.position.start.line);
		Array.from(view.containerEl.querySelectorAll("li.task-list-item > input.task-list-item-checkbox")).forEach((el, index) => {
			const input = el as HTMLInputElement;
			const lineNumber = taskLines[index];
			if (lineNumber == null) return;
			this.decorate(input, file, lineNumber);
		});

		// Live Preview: <input class="task-list-item-checkbox"> inside <label class="task-list-label">, inside a .cm-line.
		view.containerEl.querySelectorAll("label.task-list-label > input.task-list-item-checkbox").forEach((el) => {
			const input = el as HTMLInputElement;
			const lineNumber = this.livePreviewLineNumber(view, input);
			if (lineNumber == null) return;
			this.decorate(input, file, lineNumber);
		});
	}

	private livePreviewLineNumber(view: MarkdownView, input: HTMLInputElement): number | null {
		const cmLine = input.closest(".cm-line");
		if (!cmLine) return null;
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return null;
		try {
			const pos = cm.posAtDOM(cmLine);
			return cm.state.doc.lineAt(pos).number - 1; // CM6 lines are 1-indexed; Obsidian's Editor is 0-indexed.
		} catch {
			return null;
		}
	}

	private decorate(input: HTMLInputElement, file: TFile, lineNumber: number): void {
		const line = this.currentLineText(file, input, lineNumber);
		if (line == null || !isTaskLine(line)) return;

		const assignment = this.resolver.resolve(file, lineNumber);
		if (!assignment) {
			if (input.hasAttribute(DECORATED_ATTR)) this.undecorate(input);
			return;
		}

		const parsed = parseTaskLine(line);
		if (!parsed) return;
		// Shared with the public API (see decorationResolver.ts) so a consumer
		// calling getStatusDecoration() sees exactly what's rendered here.
		const decoration = resolveDecoration(this.app, this.resolver, this.dataStore, this.statusSets, file.path, lineNumber, parsed.marker);

		if (decoration?.hidden) {
			input.toggleAttribute(DECORATED_ATTR, true);
			const container = input.closest("li.task-list-item, label.task-list-label") as HTMLElement | null;
			container?.toggleClass("csi-hidden-completed", true);
			return;
		}

		const container = (input.closest("li.task-list-item, label.task-list-label") as HTMLElement | null) ?? input.parentElement;
		container?.toggleClass("csi-hidden-completed", false);

		let dot = container?.querySelector(`:scope > .${DOT_CLASS}`) as HTMLElement | null;
		if (!dot) {
			dot = createSpan({ cls: DOT_CLASS });
			container?.insertBefore(dot, container.firstChild);
		}
		dot.setCssStyles({ backgroundColor: decoration?.color ?? "#888888", color: decoration?.color ?? "#888888" });
		dot.dataset.csiFile = file.path;
		dot.dataset.csiLine = String(lineNumber);
		dot.dataset.csiAssignment = assignment.id;
		dot.setAttribute("aria-label", decoration?.label ?? "No status");
		input.toggleAttribute(DECORATED_ATTR, true);
	}

	private undecorate(input: HTMLInputElement): void {
		input.removeAttribute(DECORATED_ATTR);
		const container = input.closest("li.task-list-item, label.task-list-label") as HTMLElement | null;
		container?.querySelector(`:scope > .${DOT_CLASS}`)?.remove();
		container?.toggleClass("csi-hidden-completed", false);
	}

	private currentLineText(file: TFile, input: HTMLInputElement, lineNumber: number): string | null {
		const view = this.leafViews.get(input.closest(".workspace-leaf-content") as HTMLElement);
		if (view?.file?.path === file.path) {
			try {
				return view.editor.getLine(lineNumber);
			} catch {
				return null;
			}
		}
		return null;
	}

	// ---------- Interaction ----------
	// Mousedown, not click/dblclick — same rationale as Status Sets' ExplorerPatch
	// (some Electron/input-method combinations never synthesize click at all).
	// Captured on `window`, not `document`, so this always wins DOM capture order
	// regardless of what other plugins register on the note content.

	private registerMousedownInterceptor(win: Window): void {
		if (this.windowsWithListener.has(win)) return;
		this.windowsWithListener.add(win);
		win.document.addEventListener(
			"mousedown",
			(evt) => {
				const dot = (evt.target as HTMLElement)?.closest?.(`.${DOT_CLASS}`) as HTMLElement | null;
				if (!dot) return;
				evt.preventDefault();
				evt.stopPropagation();
				if (evt.button === 2) this.openPopupFor(dot, evt);
				else this.cycleStatus(dot);
			},
			true,
		);
		win.document.addEventListener(
			"contextmenu",
			(evt) => {
				if ((evt.target as HTMLElement)?.closest?.(`.${DOT_CLASS}`)) evt.preventDefault();
			},
			true,
		);
	}

	private dotTarget(dot: HTMLElement): { file: TFile; lineNumber: number } | null {
		const path = dot.dataset.csiFile;
		const lineNumber = Number(dot.dataset.csiLine);
		if (!path || Number.isNaN(lineNumber)) return null;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return { file, lineNumber };
	}

	// Both actions below delegate to taskActions.ts, shared with the public
	// API's cycleTaskStatus/openTaskStatusPopup (e.g. Loud Outline's file-tree
	// icons) so this plugin's own dots and any other consumer always write
	// the exact same encoding.

	private cycleStatus(dot: HTMLElement): void {
		const target = this.dotTarget(dot);
		if (!target) return;
		void cycleTaskStatus(this.app, this.resolver, this.dataStore, this.statusSets, target.file, target.lineNumber);
	}

	private openPopupFor(dot: HTMLElement, evt: MouseEvent): void {
		const target = this.dotTarget(dot);
		if (!target) return;
		void openTaskStatusPopupAction(this.app, this.resolver, this.dataStore, this.statusSets, anchorAt(dot, evt), target.file, target.lineNumber);
	}
}

/** Drops an invisible anchor at the click point, matching Status Sets' explorerPatch.ts pattern (works in popped-out windows too). */
function anchorAt(dot: HTMLElement, evt: MouseEvent): HTMLElement {
	const doc = dot.doc;
	const win = dot.win;
	const anchor = doc.body.createDiv({ cls: "csi-menu-anchor" });
	anchor.setCssStyles({ position: "fixed", left: `${evt.clientX}px`, top: `${evt.clientY}px`, width: "0", height: "0", pointerEvents: "none" });
	win.setTimeout(() => anchor.remove(), 10000);
	return anchor;
}
