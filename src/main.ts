import { Plugin, TAbstractFile } from "obsidian";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { AssignmentResolver } from "./assignmentResolver";
import { TaskPatch } from "./taskPatch";
import { ChecklistSettingTab } from "./settingsTab";
import { ChecklistStatusIconsApi } from "./publicApi";

export default class ChecklistStatusIconsPlugin extends Plugin {
	store!: DataStore;
	statusSets!: StatusSetsBridge;
	resolver!: AssignmentResolver;
	taskPatch!: TaskPatch;
	/** Public API surface for other plugins - see publicApi.ts. Read as `app.plugins.plugins['checklist-status-icons'].api`. */
	api!: ChecklistStatusIconsApi;
	private subscribedToStatusSets = false;

	async onload(): Promise<void> {
		this.store = new DataStore(this);
		await this.store.load();

		this.statusSets = new StatusSetsBridge(this.app);
		this.resolver = new AssignmentResolver(this.app, this.store);
		this.taskPatch = new TaskPatch(this.app, this.store, this.statusSets, this.resolver);
		this.api = new ChecklistStatusIconsApi(this.app, this.resolver, this.store, this.statusSets);

		this.addSettingTab(new ChecklistSettingTab(this.app, this, this.store, this.statusSets));

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.store.handleRename(oldPath, file.path);
				this.refreshAll();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.store.handleDelete(file.path);
			}),
		);

		// MetadataCache re-indexes a file asynchronously after any edit (e.g. a
		// block id we just inserted, or a heading rename) — resolving governing
		// assignments right after a write can run before the cache catches up.
		// Re-decorate on every cache update rather than trying to chain awaits
		// through every call site that edits a file.
		this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshAll()));
		// On a fresh app/plugin reload, onLayoutReady can fire before the
		// vault's *initial* metadata resolution pass has finished (that's a
		// separate, one-time "resolved" event) — block/heading assignments in
		// already-open notes would silently render as plain checkboxes until
		// something else happened to trigger a redecoration. Catch that case too.
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.refreshAll()));

		// Status Sets may load after this plugin, or the user may toggle Glow /
		// edit a status set while a note is open — re-render live either way.
		this.registerInterval(
			window.setInterval(() => {
				const api = this.statusSets.getApi();
				if (api && !this.subscribedToStatusSets) {
					this.subscribedToStatusSets = true;
					api.onChange(() => this.refreshAll());
				}
			}, 1000),
		);

		this.app.workspace.onLayoutReady(() => this.taskPatch.enable());
	}

	onunload(): void {
		this.taskPatch?.disable();
	}

	/** Re-renders in-note decoration and notifies public API subscribers (e.g. Loud Outline) in lockstep - the two must never drift out of sync with each other. */
	private refreshAll(): void {
		this.taskPatch.refreshAll();
		this.api.notifyChange();
	}
}
