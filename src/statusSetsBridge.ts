import { App, Plugin } from "obsidian";
import { MIN_SUPPORTED_API_VERSION, STATUS_SETS_PLUGIN_ID, StatusSetsPublicApi } from "./statusSetsTypes";

/**
 * `app.plugins` isn't part of Obsidian's public typings, but reading another
 * plugin's instance/manifest through it is the documented-in-practice way
 * every cross-plugin integration in the ecosystem works (there's no other
 * API for it). Narrowly typed here rather than reaching for `any` everywhere
 * this is used.
 */
interface PluginsInternal {
	manifests: Record<string, { id: string; version: string }>;
	plugins: Record<string, Plugin & { api?: StatusSetsPublicApi }>;
	enabledPlugins: Set<string>;
}

function getPluginsInternal(app: App): PluginsInternal {
	return (app as unknown as { plugins: PluginsInternal }).plugins;
}

/** Same rationale as PluginsInternal above — `app.setting` isn't public API either. */
interface SettingInternal {
	open(): void;
	openTabById(id: string): void;
}

function getSettingInternal(app: App): SettingInternal | undefined {
	return (app as unknown as { setting?: SettingInternal }).setting;
}

/**
 * Single point of contact with Status Sets. Everything about "is it
 * installed / enabled / does its API exist / is it new enough" lives here so
 * the rest of the plugin can just call getApi() and handle undefined.
 */
export class StatusSetsBridge {
	constructor(private app: App) {}

	isInstalled(): boolean {
		return STATUS_SETS_PLUGIN_ID in getPluginsInternal(this.app).manifests;
	}

	isEnabled(): boolean {
		return getPluginsInternal(this.app).enabledPlugins?.has(STATUS_SETS_PLUGIN_ID) ?? false;
	}

	/** Returns the live API if Status Sets is installed, enabled, loaded, and its API is compatible — undefined otherwise. */
	getApi(): StatusSetsPublicApi | undefined {
		const plugin = getPluginsInternal(this.app).plugins[STATUS_SETS_PLUGIN_ID];
		const api = plugin?.api;
		if (!api || api.apiVersion < MIN_SUPPORTED_API_VERSION) return undefined;
		return api;
	}

	/** Best-effort: opens Obsidian's Community Plugins browser so the user can find/enable Status Sets themselves. There's no public API to deep-link a search query into it. */
	openCommunityPlugins(): void {
		const setting = getSettingInternal(this.app);
		setting?.open();
		setting?.openTabById("community-plugins");
	}
}
