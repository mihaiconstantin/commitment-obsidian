/**
 * Modal presentation of the commitment graph for the plugin commands.
 *
 * One presentation is open at a time: showing a second graph closes the first.
 */

import type { App } from "obsidian";

import { CONFIG } from "../constants";
import type { CommitmentGraph } from "../graph/commitment-graph";
import type {
    AppearanceSettings,
    CommitmentCreationSettings,
    PresentationSettings,
} from "../settings/settings";
import { GraphModal } from "./graph-modal";


/** Present the graph in the standard modal as scrollable text or a tree. */
export class ModalGraphPresenter {
    /** App used to open the modal. */
    private readonly app: App;

    /** Supplier for the creation settings used by tree file actions. */
    private readonly creation: () => CommitmentCreationSettings;

    /** Supplier for the accent colors used by the tree. */
    private readonly appearance: () => AppearanceSettings;

    /** Modal of the previous presentation, or null when none is open. */
    private modal: GraphModal | null = null;

    /** Construct the presenter for one app and settings suppliers. */
    public constructor(
        app: App,
        creation: () => CommitmentCreationSettings,
        appearance: () => AppearanceSettings = (): AppearanceSettings => CONFIG.DEFAULT_SETTINGS.appearance,
    ) {
        // Store the app and settings suppliers used for presentation.
        this.app = app;
        this.creation = creation;
        this.appearance = appearance;
    }

    /** Display one graph in a modal. */
    public show(graph: CommitmentGraph, presentation: PresentationSettings): void {
        // Close the previous modal so only one presentation is open.
        this.modal?.close();
        this.modal = null;

        // Create the modal and drop the reference once it releases its content.
        const modal: GraphModal = new GraphModal(
            this.app,
            graph,
            presentation,
            this.appearance(),
            this.creation,
            (): void => {
                // Forget the released modal when it is still the current one.
                if (this.modal === modal) {
                    // Drop the closed modal reference.
                    this.modal = null;
                }
            },
        );
        this.modal = modal;
        modal.open();
    }
}
