/**
 * Vault access for the commitment graph: discovery, saved reads, and
 * persistence of the derived JSON output.
 */

import {
    normalizePath,
    TFile,
    TFolder,
    type TAbstractFile,
    type Vault,
} from "obsidian";

import { parseFrontmatter } from "../frontmatter/parser";
import { describeFailure } from "../plugin-failure";
import { compareText } from "./compare-text";
import type { CanonicalInput } from "./types";


/** Root-relative path of the derived graph output. */
export const GRAPH_PATH: "commitment-graph.json" = "commitment-graph.json";


/** Supported Markdown extensions without their leading dot. */
const MARKDOWN_EXTENSIONS: Readonly<Record<string, true>> = {
    md: true,
    markdown: true,
};


/** Directory name whose contents are excluded from discovery. */
const TEMPLATE_DIRECTORY: "Templates" = "Templates";


/** Outcome of one graph write attempt. */
export type WriteOutcome = "written" | "unchanged";


/** Discover, read, and persist the graph's vault inputs. */
export class VaultGraphStore {
    /** Vault whose visible files are read. */
    private readonly vault: Vault;

    /** Construct the store for one vault. */
    constructor(vault: Vault) {
        // Store the vault used for all access.
        this.vault = vault;
    }

    /** Read every eligible saved file and parse its canonical inputs. */
    async readInputs(): Promise<readonly CanonicalInput[]> {
        // Enumerate the eligible saved files in path order.
        const files: readonly TFile[] = this.eligibleFiles();

        // Read and parse every file in parallel, preserving path order.
        return Promise.all(
            files.map(async (file: TFile): Promise<CanonicalInput> => {
                // Read the exact saved text.
                const text: string = await this.readSource(file);

                // Parse the saved frontmatter with its own path-scoped failure.
                return { path: file.path, frontmatter: parseFrontmatter(file.path, text) };
            }),
        );
    }

    /** Create, leave untouched, or replace the derived graph output. */
    async writeGraph(json: string): Promise<WriteOutcome> {
        // Resolve the fixed root destination.
        const entry: TAbstractFile | null = this.vault.getAbstractFileByPath(
            normalizePath(GRAPH_PATH),
        );

        // Reject a folder that occupies the destination path.
        if (entry instanceof TFolder) {
            // Report the unsupported destination shape.
            throw new Error(`Graph destination '${GRAPH_PATH}' is a folder.`);
        }

        // Create the destination when it is absent.
        if (entry === null) {
            try {
                // Create the derived graph output once.
                await this.vault.create(GRAPH_PATH, json);
            } catch (error) {
                // Report the creation failure with its destination path.
                throw destinationFailure("create", error);
            }

            // Report the created output.
            return "written";
        }

        // Require the existing destination to be an ordinary file.
        if (!(entry instanceof TFile)) {
            // Report the unsupported destination shape.
            throw new Error(`Graph destination '${GRAPH_PATH}' is not a file.`);
        }

        // Read the current destination text.
        const current: string = await this.readDestination(entry);

        // Leave identical generated text untouched.
        if (current === json) {
            // Report the unchanged output without a write.
            return "unchanged";
        }

        try {
            // Replace the complete derived output.
            await this.vault.process(entry, (): string => json);
        } catch (error) {
            // Report the write failure with its destination path.
            throw destinationFailure("write", error);
        }

        // Report the successful replacement.
        return "written";
    }

    /** Read one source file's text with its path-scoped failure. */
    private async readSource(file: TFile): Promise<string> {
        try {
            // Read the saved disk content.
            return await this.vault.read(file);
        } catch (error) {
            // Report the unreadable source with its path.
            throw new Error(`Could not read '${file.path}': ${describeFailure(error)}`);
        }
    }

    /** Read one destination file's text with its path-scoped failure. */
    private async readDestination(entry: TFile): Promise<string> {
        try {
            // Read the current destination text.
            return await this.vault.read(entry);
        } catch (error) {
            // Report the unreadable destination with its path.
            throw destinationFailure("read", error);
        }
    }

    /** Return the eligible vault files in code-unit path order. */
    private eligibleFiles(): readonly TFile[] {
        // Read every visible vault file.
        const files: readonly TFile[] = this.vault.getFiles();

        // Retain only eligible Markdown files outside excluded directories.
        const eligible: TFile[] = files.filter((file: TFile): boolean => isEligible(file));

        // Sort by root-relative portable path for deterministic processing.
        eligible.sort((left: TFile, right: TFile): number => compareText(left.path, right.path));

        // Return the eligible files.
        return eligible;
    }
}


/** Return whether a vault file is an eligible saved source. */
function isEligible(file: TFile): boolean {
    // Require a supported Markdown extension without regard to case.
    if (MARKDOWN_EXTENSIONS[file.extension.toLowerCase()] !== true) {
        // Reject another file type.
        return false;
    }

    // Read each path segment for the hidden and template exclusions.
    const segments: readonly string[] = file.path.split("/");

    // Reject a hidden file or any hidden directory component.
    if (segments.some((segment: string): boolean => segment.startsWith("."))) {
        // Reject hidden paths.
        return false;
    }

    // Reject a directory named exactly Templates at any depth.
    const directories: readonly string[] = segments.slice(0, -1);
    return !directories.includes(TEMPLATE_DIRECTORY);
}


/** Build one destination read or write failure with its path. */
function destinationFailure(action: string, error: unknown): Error {
    // Render the underlying failure for a readable message.
    const detail: string = describeFailure(error);

    // Return the failure naming the destination and action.
    return new Error(`Could not ${action} graph destination '${GRAPH_PATH}': ${detail}`);
}
