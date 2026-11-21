/**
 * Open one vault path while distinguishing a missing path from a non-file.
 *
 * The opener throws only when Obsidian rejects the open call. Callers map the
 * returned reason to their own user-facing copy.
 */

import { TFile, type App, type TAbstractFile } from "obsidian";


/** Outcome of one vault path open attempt. */
export type VaultFileOpenResult = "opened" | "missing" | "not-file";


/** Resolve and open one vault path through a shared policy. */
export class VaultFileOpener {
    /** App used for the vault and workspace leaf. */
    private readonly app: App;

    /** Construct an opener for one app. */
    public constructor(app: App) {
        // Store the app used for vault and workspace access.
        this.app = app;
    }

    /** Open the path, or report why it cannot be opened. */
    public async open(path: string): Promise<VaultFileOpenResult> {
        // Resolve the path without assuming that it is a file.
        const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
        if (entry === null) {
            // Report a path that no longer exists.
            return "missing";
        }

        // Reject a folder that occupies the path.
        if (!(entry instanceof TFile)) {
            // Report an unsupported path shape.
            return "not-file";
        }

        // Open the file in the main workspace.
        await this.app.workspace.getLeaf(false).openFile(entry);

        // Report the successful open.
        return "opened";
    }
}
