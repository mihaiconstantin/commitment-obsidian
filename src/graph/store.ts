/**
 * Vault access for the commitment graph: discovery, saved reads, source
 * rechecks, and persistence of the derived JSON output.
 */

import {
    normalizePath,
    TFile,
    TFolder,
    type TAbstractFile,
    type Vault,
} from "obsidian";

import { parseFrontmatter } from "../frontmatter/parser";
import {
    createDiagnostic,
    createFailure,
    describeFailure,
    isPluginFailure,
} from "../plugin-failure";
import { compareCodePoints } from "./code-point-order";
import type { CanonicalInput, InputSnapshot, SourceDocument } from "./types";


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


/** Encoder shared by the byte comparison and the write path. */
const UTF8_ENCODER: TextEncoder = new TextEncoder();


/** Discover, read, recheck, and persist the graph's vault inputs. */
export class VaultGraphStore {
    /** Vault whose visible files are read. */
    private readonly vault: Vault;

    /** Construct the store for one vault. */
    constructor(vault: Vault) {
        // Store the vault used for all access.
        this.vault = vault;
    }

    /** Read every eligible saved file and parse its canonical inputs. */
    async readInputs(): Promise<InputSnapshot> {
        // Enumerate the eligible saved files in path order.
        const files: readonly TFile[] = this.eligibleFiles();

        // Read every file and retain its exact saved text.
        const documents: SourceDocument[] = await this.readDocuments(files);

        // Parse every saved document into its canonical mapping.
        const inputs: CanonicalInput[] = documents.map(
            (document: SourceDocument): CanonicalInput => ({
                path: document.path,
                frontmatter: parseFrontmatter(document.path, document.text),
            }),
        );

        // Return the consistent saved-input snapshot.
        return { documents, inputs };
    }

    /** Abort when the eligible paths or saved text changed since the snapshot. */
    async assertUnchanged(snapshot: InputSnapshot): Promise<void> {
        // Re-enumerate the eligible files after the build.
        const files: readonly TFile[] = this.eligibleFiles();

        // Read the current saved text for the same path set.
        const current: readonly SourceDocument[] = await this.readDocuments(files);

        // Index the captured documents by path.
        const previous: ReadonlyMap<string, string> = new Map<string, string>(
            snapshot.documents.map(
                (document: SourceDocument): [string, string] => [document.path, document.text],
            ),
        );

        // Reject a path that was added or removed since the snapshot.
        if (current.length !== previous.size) {
            // Report the first path that is not present in both sets.
            const changed: string = describePathDifference(previous, current);
            throw sourceChangedFailure(changed);
        }

        // Reject a saved text change for any captured path.
        for (const document of current) {
            // Read the captured text for this path.
            const text: string | undefined = previous.get(document.path);
            if (text === undefined) {
                // Report the newly eligible path.
                throw sourceChangedFailure(document.path);
            }
            if (text !== document.text) {
                // Report the changed saved text.
                throw sourceChangedFailure(document.path);
            }
        }
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
            throw createFailure(
                "invalid_graph_destination",
                `Graph destination '${GRAPH_PATH}' is a folder.`,
                [
                    createDiagnostic(
                        "invalid_graph_destination",
                        "Graph destination is a folder.",
                        [GRAPH_PATH],
                    ),
                ],
            );
        }

        // Create the destination when it is absent.
        if (entry === null) {
            try {
                // Create the derived graph output once.
                await this.vault.create(GRAPH_PATH, json);
            } catch (error) {
                // Report the creation failure with its destination path.
                throw destinationFailure("write_error", "create", error);
            }

            // Report the created output.
            return "written";
        }

        // Require the existing destination to be an ordinary file.
        if (!(entry instanceof TFile)) {
            // Report the unsupported destination shape.
            throw createFailure(
                "invalid_graph_destination",
                `Graph destination '${GRAPH_PATH}' is not a file.`,
                [
                    createDiagnostic(
                        "invalid_graph_destination",
                        "Graph destination is not a file.",
                        [GRAPH_PATH],
                    ),
                ],
            );
        }

        // Read the existing destination bytes for an exact no-op check.
        const before: ArrayBuffer = await this.readDestinationBytes(entry);

        // Leave identical generated bytes untouched.
        const generated: Uint8Array = utf8Bytes(json);
        if (bytesEqual(before, generated)) {
            // Report the unchanged output without a write.
            return "unchanged";
        }

        // Read the existing destination text for the process comparison.
        const captured: string = await this.readDestinationText(entry);

        // Re-read the bytes to detect a change during the text read.
        const after: ArrayBuffer = await this.readDestinationBytes(entry);
        if (!buffersEqual(before, after)) {
            // Report the destination change without writing.
            throw destinationChangedFailure();
        }

        // Replace the derived output through the text callback.
        try {
            await this.vault.process(entry, (data: string): string => {
                // Abort when the callback text differs from the captured text.
                if (data !== captured) {
                    // Report the destination change.
                    throw destinationChangedFailure();
                }

                // Replace the complete derived output.
                return json;
            });
        } catch (error) {
            // Re-raise a structured conflict instead of masking it as a write failure.
            if (isPluginFailure(error)) {
                // Keep the destination-changed finding.
                throw error;
            }

            // Report the write failure with its destination path.
            throw destinationFailure("write_error", "write", error);
        }

        // Report the successful replacement.
        return "written";
    }

    /** Read one destination file's bytes with its path-scoped failure. */
    private async readDestinationBytes(entry: TFile): Promise<ArrayBuffer> {
        try {
            // Read the current destination bytes.
            return await this.vault.readBinary(entry);
        } catch (error) {
            // Report the unreadable destination with its path.
            throw destinationFailure("read_error", "read", error);
        }
    }

    /** Read one destination file's text with its path-scoped failure. */
    private async readDestinationText(entry: TFile): Promise<string> {
        try {
            // Read the current destination text.
            return await this.vault.read(entry);
        } catch (error) {
            // Report the unreadable destination with its path.
            throw destinationFailure("read_error", "read", error);
        }
    }

    /** Return the eligible vault files in code-point path order. */
    private eligibleFiles(): readonly TFile[] {
        // Read every visible vault file.
        const files: readonly TFile[] = this.vault.getFiles();

        // Retain only eligible Markdown files outside excluded directories.
        const eligible: TFile[] = files.filter((file: TFile): boolean => isEligible(file));

        // Sort by root-relative portable path for deterministic processing.
        eligible.sort((left: TFile, right: TFile): number => compareCodePoints(left.path, right.path));

        // Return the eligible files.
        return eligible;
    }

    /** Read every eligible file's exact saved text. */
    private async readDocuments(files: readonly TFile[]): Promise<SourceDocument[]> {
        // Read each file in path order.
        const documents: SourceDocument[] = [];
        for (const file of files) {
            try {
                // Read the saved disk content.
                const text: string = await this.vault.read(file);

                // Retain the path and exact saved text.
                documents.push({ path: file.path, text });
            } catch (error) {
                // Report the unreadable source with its path.
                throw createFailure(
                    "read_error",
                    `Could not read '${file.path}': ${describeFailure(error)}`,
                    [
                        createDiagnostic(
                            "read_error",
                            `Could not read file: ${describeFailure(error)}`,
                            [file.path],
                        ),
                    ],
                );
            }
        }

        // Return the saved documents in path order.
        return documents;
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


/** Describe the first path that differs between two document sets. */
function describePathDifference(
    previous: ReadonlyMap<string, string>,
    current: readonly SourceDocument[],
): string {
    // Collect the current path set for membership checks.
    const currentPaths: ReadonlySet<string> = new Set<string>(
        current.map((document: SourceDocument): string => document.path),
    );

    // Return a removed captured path before considering additions.
    for (const path of [...previous.keys()].sort(compareCodePoints)) {
        // Report a path that is no longer eligible.
        if (!currentPaths.has(path)) {
            // Return the removed path.
            return path;
        }
    }

    // Return the first added eligible path.
    for (const document of current) {
        // Report a path that was not captured.
        if (!previous.has(document.path)) {
            // Return the added path.
            return document.path;
        }
    }

    // Return the graph destination as a fallback.
    return GRAPH_PATH;
}


/** Build the source-changed failure with its path. */
function sourceChangedFailure(path: string): Error {
    // Return the failure naming the changed source.
    return createFailure(
        "source_changed",
        `Saved source '${path}' changed while the graph was being built; update aborted.`,
        [
            createDiagnostic(
                "source_changed",
                "Saved source changed during the update.",
                [path],
            ),
        ],
    );
}


/** Build one destination read or write failure with its path. */
function destinationFailure(code: string, action: string, error: unknown): Error {
    // Render the underlying failure for a readable message.
    const detail: string = describeFailure(error);

    // Return the failure naming the destination in both message and finding.
    return createFailure(
        code,
        `Could not ${action} graph destination '${GRAPH_PATH}': ${detail}`,
        [
            createDiagnostic(
                code,
                `Could not ${action} the graph destination: ${detail}`,
                [GRAPH_PATH],
            ),
        ],
    );
}


/** Build the destination-changed failure. */
function destinationChangedFailure(): Error {
    // Return the failure naming the destination.
    return createFailure(
        "destination_changed",
        `Graph destination '${GRAPH_PATH}' changed while the update was running; no write occurred.`,
        [
            createDiagnostic(
                "destination_changed",
                "Graph destination changed during the update.",
                [GRAPH_PATH],
            ),
        ],
    );
}


/** Compare two existing file buffers byte for byte. */
function buffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
    // Compare both buffers through ordinary byte views.
    return bytesEqual(left, new Uint8Array(right));
}


/** Compare existing file bytes with generated bytes. */
function bytesEqual(left: ArrayBuffer, right: Uint8Array): boolean {
    // Read the existing file as an ordinary byte view.
    const leftBytes: Uint8Array = new Uint8Array(left);
    if (leftBytes.length !== right.length) {
        // Report a length difference.
        return false;
    }

    // Compare every byte.
    for (let index: number = 0; index < leftBytes.length; index += 1) {
        // Report the first differing byte.
        if (leftBytes[index] !== right[index]) {
            // Report the difference.
            return false;
        }
    }

    // Report identical bytes.
    return true;
}


/** Encode generated text as UTF-8 bytes. */
function utf8Bytes(text: string): Uint8Array {
    // Use the standard text encoder.
    return UTF8_ENCODER.encode(text);
}



