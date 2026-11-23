/**
 * Obsidian modal that renders one commitment graph as a tree or as JSON text.
 *
 * The modal owns the rendered content and the keymap shortcuts. It builds its
 * body in `onOpen()` so Obsidian controls when the content is attached, and
 * releases the rendered content in `onClose()`.
 */

import { Notice, type App } from "obsidian";

import { CONFIG } from "../constants";
import type { ContainerFileActions } from "../containers/container-file-actions";
import type { CommitmentGraph } from "../graph/commitment-graph";
import type { GraphArea } from "../graph/types";
import { orderAreas } from "../helpers/area-order";
import { describeFailure } from "../helpers/utils";
import type {
    AppearanceSettings,
    PresentationSettings,
} from "../settings/settings";
import { GraphTree } from "./graph-tree";
import { CommitmentModal } from "./commitment-modal";


/** Modal showing one derived graph. */
export class GraphModal extends CommitmentModal {
    /** Graph snapshot shown by this modal. */
    private readonly graph: CommitmentGraph;

    /** Shape and area order used to present the graph. */
    private readonly presentation: PresentationSettings;

    /** Accent colors used by the tree. */
    private readonly appearance: AppearanceSettings;

    /** File actions composed for this graph, or none for JSON presentation. */
    private readonly actions: ContainerFileActions | null;

    /** Called after the modal released its content, or null when unused. */
    private readonly released: (() => void) | null;

    /** Keep the base modal from focusing its first input when opened. */
    public hasInitialInputFocus: boolean = false;

    /** Mount the tree and bind the modal keymap shortcuts to it. */
    private renderTree(content: HTMLElement): void {
        // Create the tree host that fills the modal body.
        const host: HTMLElement = content.createDiv({
            cls: "commitment-graph__tree-host commitment-modal__body",
        });

        // Use the file actions composed for this graph.
        const adapter: ContainerFileActions | null = this.actions;

        // Wrap the adapter so success closes the modal and failure reports once.
        const actions: ContainerFileActions | null = adapter === null ? null : {
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

        // Mount the interactive tree in the configured area order.
        const tree: GraphTree = new GraphTree(
            host,
            this.graph.getAreas(),
            this.presentation.sort,
            actions,
            this.appearance,
            this.presentation.treeDefaults,
        );

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
    }

    /** Construct the modal without touching the DOM. */
    public constructor(app: App, graph: CommitmentGraph, presentation: PresentationSettings, appearance: AppearanceSettings, actions: ContainerFileActions | null, released: (() => void) | null = null) {
        // Initialize the Obsidian modal and retain its inputs.
        super(app);
        this.graph = graph;
        this.presentation = presentation;
        this.appearance = appearance;
        this.actions = actions;
        this.released = released;
    }

    /** Build the modal body when Obsidian opens it. */
    public override onOpen(): void {
        // Use the shared shell only for the full-height tree presentation.
        if (this.presentation.mode === "tree") {
            // Apply the shared title, shell, and phone sizing classes.
            this.configureCommitmentModal(CONFIG.GRAPH_TITLE, "commitment-graph-modal");
        } else {
            // Keep the default auto-sized JSON modal.
            this.setTitle(CONFIG.GRAPH_TITLE);
        }

        // Read the modal content element and clear any previous content.
        const content: HTMLElement = this.contentEl;
        content.empty();

        // Render the selected shape: the projection or the interactive tree.
        if (this.presentation.mode === "tree") {
            // Render the interactive tree with file actions.
            this.renderTree(content);
        } else {
            // Create the selectable block that carries the projection.
            const block: HTMLElement = content.createEl("pre", {
                cls: "commitment-graph__json",
            });

            // Order a copy of the graph areas for this presentation.
            const orderedAreas: readonly GraphArea[] = orderAreas(
                this.graph.getAreas(),
                this.presentation.sort,
            );

            // Serialize that ordered list through the graph's projection format.
            block.setText(this.graph.toJson(orderedAreas));
        }
    }

    /** Release the rendered content when Obsidian closes the modal. */
    public override onClose(): void {
        // Release the rendered tree so a closed modal retains no view state.
        this.contentEl.empty();

        // Notify the owner so it can drop its reference to this modal.
        this.released?.();
    }
}
