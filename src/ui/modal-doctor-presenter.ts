/**
 * Modal presentation of nonblocking commitment diagnostics.
 *
 * One Doctor presentation is open at a time: showing diagnostics again closes
 * the previous modal.
 */

import type { App } from "obsidian";

import type { Diagnostic } from "../graph/types";
import { DoctorModal } from "./doctor-modal";


/** Present the Doctor in one modal and keep its lifecycle local. */
export class ModalDoctorPresenter {
    /** App used to open the modal and its source files. */
    private readonly app: App;

    /** Modal of the previous presentation, or null when none is open. */
    private modal: DoctorModal | null = null;

    /** Construct the presenter for one app. */
    public constructor(app: App) {
        // Store the app used for presentation and source actions.
        this.app = app;
    }

    /** Display the findings in a modal. */
    public show(diagnostics: readonly Diagnostic[]): void {
        // Close the previous modal so only one Doctor is open.
        this.modal?.close();
        this.modal = null;

        // Create the modal and drop the reference once it releases its content.
        const modal: DoctorModal = new DoctorModal(
            this.app,
            diagnostics,
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
