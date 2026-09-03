/** Vault-relative path helpers. Obsidian paths use "/" and never a leading slash. */

export function basename(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Rewrites a stored file path when that exact file is renamed/moved.
 * Unlike Status Sets' folder-path rewrite, assignments here are always
 * anchored to one specific file (never a subtree), so this is a plain
 * equality check, not a prefix rewrite.
 */
export function rewriteFilePathOnRename(storedPath: string, oldPath: string, newPath: string): string {
	return storedPath === oldPath ? newPath : storedPath;
}
