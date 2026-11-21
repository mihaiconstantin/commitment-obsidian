/**
 * Modal presentation of the commitment graph for the plugin commands.
 *
 * One presentation is open at a time: showing a second graph closes the first.
 */

import type { App } from "obsidian";

import type { GraphResult } from "../graph/commitment-graph";
import type { CommitmentCreationSettings, PresentationMode } from "../settings/settings";
import { GraphModal } from "./graph-modal";
import type { GraphPresenter } from "./presenter";


/** Present the graph in the standard modal as scrollable text or a tree. */
export class ModalGraphPresenter implements GraphPresenter {
    /** App used to open the modal. */
    private readonly app: App;

    /** Supplier for the creation settings used by tree file actions. */
    private readonly creation: () => CommitmentCreationSettings;

    /** Modal of the previous presentation, or null when none is open. */
    private modal: GraphModal | null = null;

    /** Construct the presenter for one app and creation settings supplier. */
    public constructor(app: App, creation: () => CommitmentCreationSettings) {
        // Store the app and settings supplier used for presentation.
        this.app = app;
        this.creation = creation;
    }

    /** Display one graph and its warnings in a modal. */
    public show(result: GraphResult, mode: PresentationMode): void {
        // Close the previous modal so only one presentation is open.
        this.modal?.close();
        this.modal = null;

        // Create the modal and drop the reference once it releases its content.
        const modal: GraphModal = new GraphModal(
            this.app,
            result,
            mode,
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
