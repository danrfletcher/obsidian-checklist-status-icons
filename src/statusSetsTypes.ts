/**
 * Local copy of Status Sets' (file-folder-status-icons) public API contract.
 * There's no shared npm package between the two plugins, so this is kept in
 * sync by hand against obsidian-file-folder-status-icons's src/publicApi.ts
 * and src/types.ts — see that repo's docs/docs/reference/public-api.md.
 */

export interface StatusDefinition {
	id: string;
	label: string;
	color: string;
	isCompleted?: boolean;
}

export interface StatusSet {
	id: string;
	name: string;
	statuses: StatusDefinition[];
	defaultStatusId: string;
}

export interface StatusSetsPublicApi {
	readonly apiVersion: number;
	getStatusSets(): StatusSet[];
	getStatusSet(id: string): StatusSet | undefined;
	isGlowEnabled(): boolean;
	onChange(callback: () => void): () => void;
	openStatusPopup(opts: {
		anchor: HTMLElement;
		statusSet: StatusSet;
		currentStatusId: string;
		onSelect: (status: StatusDefinition) => void;
	}): void;
}

export const STATUS_SETS_PLUGIN_ID = "file-folder-status-icons";
export const MIN_SUPPORTED_API_VERSION = 1;
