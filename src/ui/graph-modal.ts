/**
 * Obsidian modal that renders one commitment graph as a tree or as JSON text.
 *
 * The modal owns the rendered content, the keymap shortcuts, and the tree that
 * serves file actions. It builds its body in `onOpen()` so Obsidian controls
 * when the content is attached, and releases the tree in `onClose()`.
 */

import { Modal, Notice, type App } from "obsidian";

import type { ContainerFileActions } from "../containers/container-file-actions";
import { VaultContainerFileActions } from "../containers/vault-file-actions";
import type { GraphResult } from "../graph/commitment-graph";
import { describeFailure } from "../plugin-failure";
import type { CommitmentCreationSettings, PresentationMode } from "../settings/settings";
import { GraphTree } from "./graph-tree";


/** Readable modal title. */
const TITLE: "Commitment Graph" = "Commitment Graph";


/** Modal showing one derived graph. */
export class GraphModal extends Modal {
    /** Graph snapshot and its nonblocking findings. */
    private readonly result: GraphResult;

    /** Shape used to present the graph. */
    private readonly mode: PresentationMode;

    /** Supplier for the creation settings used by tree file actions. */
    private readonly creation: () => CommitmentCreationSettings;

    /** Mounted tree, or null outside tree mode. */
    private tree: GraphTree | null = null;

    /** Called after the modal released its content, or null when unused. */
    private readonly released: (() => void) | null;

    /** Construct the modal without touching the DOM. */
    constructor(
        app: App,
        result: GraphResult,
        mode: PresentationMode,
        creation: () => CommitmentCreationSettings,
        released: (() => void) | null = null,
    ) {
        // Initialize the Obsidian modal and retain its inputs.
        super(app);
        this.result = result;
        this.mode = mode;
        this.creation = creation;
        this.released = released;
    }

    /** Build the modal body when Obsidian opens it. */
    onOpen(): void {
        // Identify the modal and size it for the tree.
        this.setTitle(TITLE);
        if (this.mode === "tree") {
            // Add the tree sizing classes.
            this.modalEl.classList.add("commitment-graph-modal", "mod-lg");
        }

        // Read the modal content element and clear any previous content.
        const content: HTMLElement = this.contentEl;
        content.empty();

        // Render the selected shape: the raw projection or the interactive tree.
        if (this.mode === "tree") {
            // Render the interactive tree with file actions.
            this.renderTree(content);
        } else {
            // Render the graph JSON as selectable text in a scrollable block.
            const block: HTMLElement = content.createEl("pre", {
                cls: "commitment-graph__json",
            });
            block.setText(this.result.graph.toJson());
        }

        // Add the warnings when the build reported any.
        this.renderWarnings(content);
    }

    /** Release the tree and rendered content when Obsidian closes the modal. */
    onClose(): void {
        // Stop the tree timers and drop the retained handle.
        this.tree?.dispose();
        this.tree = null;

        // Release the rendered tree so a closed modal retains no view state.
        this.contentEl.empty();

        // Notify the owner so it can drop its reference to this modal.
        this.released?.();
    }

    /** Mount the tree and bind the modal keymap shortcuts to it. */
    private renderTree(content: HTMLElement): void {
        // Create the tree host that fills the modal body.
        const host: HTMLElement = content.createDiv({
            cls: "commitment-graph__tree-host",
        });

        // Build the vault adapter for this graph and the current settings.
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            this.app,
            this.result.graph,
            (kind) => this.creation()[kind],
            () => this.creation().idStyle,
        );

        // Wrap the adapter so success closes the modal and failure reports once.
        const actions: ContainerFileActions = {
            actionFor: (identity) => adapter.actionFor(identity),
            activate: async (identity): Promise<void> => {
                try {
                    // Open or create the container file.
                    await adapter.activate(identity);

                    // Close the modal only after the file opened or was created.
                    this.close();
                } catch (error) {
                    // Report exactly one failure notice and keep the modal open.
                    new Notice(describeFailure(error));
                }
            },
        };

        // Mount the interactive tree with the same behavior as the standalone view.
        const tree: GraphTree = GraphTree.mount(host, this.result.graph.getAreas(), actions);
        this.tree = tree;

        // Bind "/" to the search field through the modal keymap.
        this.scope.register(null, "/", (): false | true => {
            // Leave the key alone when the field already has focus.
            if (tree.hasSearchFocus()) {
                // Let the slash reach the field.
                return true;
            }

            // Focus the search field.
            tree.focusSearch();

            // Return false so Obsidian prevents the slash from being typed.
            return false;
        });

        // Clear the filter on Escape before Obsidian closes the modal.
        this.scope.register(null, "Escape", (): false | true => {
            // Leave Escape alone unless the search field has focus.
            if (!tree.hasSearchFocus()) {
                // Let Obsidian close the modal.
                return true;
            }

            // Clear the query and keep the modal open.
            tree.clearSearch();
            return false;
        });
    }

    /** Add the warnings heading and entries when the build reported any. */
    private renderWarnings(content: HTMLElement): void {
        // Add nothing without findings.
        if (this.result.diagnostics.length === 0) {
            // Leave the graph content without a warnings section.
            return;
        }

        // Add a warnings heading below the graph.
        content.createEl("h3", {
            text: "Warnings",
            cls: "commitment-graph__warnings-title",
        });

        // List each warning with its affected paths.
        const list: HTMLElement = content.createEl("ul", {
            cls: "commitment-graph__warnings",
        });
        for (const diagnostic of this.result.diagnostics) {
            // Render the warning message and its paths as text.
            const item: HTMLElement = list.createEl("li", {
                text: diagnostic.message,
            });

            // Add the paths when the warning names any.
            if (diagnostic.paths.length > 0) {
                // Render the source paths as a separate line.
                item.createEl("div", {
                    text: diagnostic.paths.join(", "),
                    cls: "commitment-graph__paths",
                });
            }
        }
    }
}
