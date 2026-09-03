import { App, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import type ChecklistStatusIconsPlugin from "./main";
import { DataStore } from "./dataStore";
import { StatusSetsBridge } from "./statusSetsBridge";
import { StatusSet } from "./statusSetsTypes";
import { Assignment } from "./types";
import { attachTargetAutocomplete, TargetSuggestion } from "./targetAutocomplete";
import { ensureBlockId } from "./blockId";

const REPO_URL = "https://github.com/danrfletcher/obsidian-checklist-status-icons";
const BUG_REPORT_URL = `${REPO_URL}/issues/new?template=bug_report.yml&labels=bug`;
const FEATURE_REQUEST_URL = `${REPO_URL}/discussions/new?category=ideas`;
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/danrfletcher";

export class ChecklistSettingTab extends PluginSettingTab {
	private expandedAssignmentIds = new Set<string>();

	constructor(app: App, private plugin: ChecklistStatusIconsPlugin, private dataStore: DataStore, private statusSets: StatusSetsBridge) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (!this.statusSets.isInstalled() || !this.statusSets.isEnabled()) {
			this.renderDependencyNotice(containerEl);
			return;
		}
		if (!this.statusSets.getApi()) {
			containerEl.createEl("p", {
				text: "Status Sets is enabled, but its plugin API hasn't finished loading yet. Reopen this tab in a moment.",
			});
			return;
		}

		this.renderAssignments(containerEl);
		this.renderAddAssignment(containerEl);
		this.renderSupportLinks(containerEl);
	}

	private renderDependencyNotice(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Status Sets required" });
		containerEl.createEl("p", {
			text: "Checklist Status Sets applies the status sets you define in Status Sets to checklist items inside your notes. Install and enable Status Sets first.",
		});
		const notInstalled = !this.statusSets.isInstalled();
		new Setting(containerEl)
			.setName(notInstalled ? "Status Sets isn't installed" : "Status Sets is installed but disabled")
			.setDesc(notInstalled ? "Install it from Community Plugins, then come back here." : "Enable it in Community Plugins, then come back here.")
			.addButton((btn) =>
				btn
					.setButtonText("Open Community Plugins")
					.setCta()
					.onClick(() => this.statusSets.openCommunityPlugins()),
			);
	}

	private renderAssignments(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("File and block assignments").setHeading();

		const assignments = this.dataStore.getAssignments();
		if (assignments.length === 0) {
			containerEl.createEl("p", { text: "No assignments yet — add one below.", cls: "setting-item-description" });
		}

		for (const assignment of assignments) {
			this.renderAssignmentCard(containerEl, assignment);
		}
	}

	private renderAssignmentCard(containerEl: HTMLElement, assignment: Assignment): void {
		const card = containerEl.createDiv({ cls: "csi-assignment-card" });
		const expanded = this.expandedAssignmentIds.has(assignment.id);

		const header = new Setting(card).setName(this.targetLabel(assignment)).setDesc(this.scopeDesc(assignment));
		header.addExtraButton((btn) =>
			btn
				.setIcon(expanded ? "chevron-up" : "chevron-down")
				.setTooltip(expanded ? "Collapse" : "Expand")
				.onClick(() => {
					if (expanded) this.expandedAssignmentIds.delete(assignment.id);
					else this.expandedAssignmentIds.add(assignment.id);
					this.display();
				}),
		);
		header.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remove assignment")
				.onClick(() => {
					this.dataStore.removeAssignment(assignment.id);
					this.display();
				}),
		);

		if (!expanded) return;

		const statusSets = this.statusSets.getApi()?.getStatusSets() ?? [];
		new Setting(card).setName("Status set").addDropdown((dd) => {
			for (const set of statusSets) dd.addOption(set.id, set.name);
			dd.setValue(assignment.statusSetId).onChange((value) => {
				this.dataStore.updateAssignment(assignment.id, { statusSetId: value });
				this.display();
			});
		});

		if (assignment.scope === "block") {
			new Setting(card)
				.setName("Inherit to subtasks")
				.setDesc("Governs the assigned task and all of its nested/indented children.")
				.addToggle((toggle) =>
					toggle.setValue(assignment.inheritToSubtasks).onChange((value) => {
						this.dataStore.updateAssignment(assignment.id, { inheritToSubtasks: value });
					}),
				);
		}

		new Setting(card)
			.setName("Hide completed")
			.setDesc("Tasks whose resolved status is marked completed are removed from the rendered note entirely, not just visually hidden.")
			.addToggle((toggle) =>
				toggle.setValue(!!assignment.hideCompleted).onChange((value) => {
					this.dataStore.updateAssignment(assignment.id, { hideCompleted: value });
					this.plugin.taskPatch.refreshAll();
				}),
			);

		this.renderTruncationPanel(card, assignment, statusSets.find((s) => s.id === assignment.statusSetId));
	}

	private renderTruncationPanel(card: HTMLElement, assignment: Assignment, statusSet: StatusSet | undefined): void {
		if (!statusSet) return;
		new Setting(card).setName("Truncate statuses").setHeading();
		for (const status of statusSet.statuses) {
			const rule = assignment.truncatedStatuses?.[status.id];
			const row = new Setting(card).setName(status.label);
			const swatch = createSpan({ cls: "csi-swatch" });
			swatch.setCssStyles({ backgroundColor: status.color });
			row.nameEl.prepend(swatch);
			row.addToggle((toggle) =>
				toggle.setValue(!!rule?.enabled).onChange((value) => {
					this.dataStore.setTruncationRule(assignment.id, status.id, { enabled: value });
					this.plugin.taskPatch.refreshAll();
				}),
			);
		}
	}

	private renderAddAssignment(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Assign a file or block").setHeading();

		let pendingTarget: TargetSuggestion | null = null;
		let selectedStatusSetId = this.statusSets.getApi()?.getStatusSets()[0]?.id ?? "";

		const setting = new Setting(containerEl)
			.setDesc('Type a note path, then optionally "^" for a block or "#" for a heading.')
			.addText((text) => {
				text.setPlaceholder("Note path, or Note^block, or Note#Heading");
				attachTargetAutocomplete({
					input: text.inputEl,
					app: this.app,
					onSelect: (s) => {
						pendingTarget = s;
						text.setValue(s.label);
					},
				});
			});

		const statusSets = this.statusSets.getApi()?.getStatusSets() ?? [];
		setting.addDropdown((dd) => {
			for (const set of statusSets) dd.addOption(set.id, set.name);
			dd.setValue(selectedStatusSetId).onChange((value) => (selectedStatusSetId = value));
		});

		setting.addButton((btn) =>
			btn
				.setButtonText("Assign")
				.setCta()
				.onClick(async () => {
					if (!pendingTarget || !selectedStatusSetId) return;
					await this.createAssignment(pendingTarget, selectedStatusSetId);
					this.display();
				}),
		);
	}

	private async createAssignment(target: TargetSuggestion, statusSetId: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile)) return;

		if (target.kind === "file") {
			this.dataStore.addFileAssignment(normalizePath(target.path), statusSetId);
		} else if (target.kind === "block") {
			this.dataStore.addBlockAssignment(normalizePath(target.path), target.blockId, statusSetId);
		} else if (target.kind === "block-candidate") {
			const blockId = await ensureBlockId(this.app, file, target.lineNumber);
			this.dataStore.addBlockAssignment(normalizePath(target.path), blockId, statusSetId);
		} else if (target.kind === "heading") {
			this.dataStore.addHeadingAssignment(normalizePath(target.path), target.heading, statusSetId);
		}
		this.plugin.taskPatch.refreshAll();
	}

	private targetLabel(assignment: Assignment): string {
		if (assignment.scope === "file") return assignment.path;
		if (assignment.scope === "block") return `${assignment.path} ^${assignment.blockId}`;
		return `${assignment.path} > ${assignment.heading}`;
	}

	private scopeDesc(assignment: Assignment): string {
		if (assignment.scope === "file") return "Whole file";
		if (assignment.scope === "block") return assignment.inheritToSubtasks ? "Block (with subtasks)" : "Block only";
		return "Heading section";
	}

	private renderSupportLinks(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Support").setHeading();
		const row = containerEl.createDiv({ cls: "csi-support-links" });
		const bug = row.createEl("button", { text: "Report a bug", cls: "csi-support-btn" });
		bug.addEventListener("click", () => window.open(BUG_REPORT_URL, "_blank"));
		const feature = row.createEl("button", { text: "Request a feature", cls: "csi-support-btn" });
		feature.addEventListener("click", () => window.open(FEATURE_REQUEST_URL, "_blank"));
		const coffee = row.createEl("button", { text: "☕ Buy me a coffee", cls: "csi-support-btn csi-support-btn-coffee" });
		coffee.addEventListener("click", () => window.open(BUY_ME_A_COFFEE_URL, "_blank"));
	}
}
