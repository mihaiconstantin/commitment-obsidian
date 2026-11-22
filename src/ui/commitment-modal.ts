/**
 * Shared shell for full-height commitment modals.
 *
 * Encapsulates the title and the Obsidian classes that provide the common
 * desktop height, mobile bottom-sheet behavior, and content layout.
 */

import { Modal } from "obsidian";


/** Base class for commitment modals with one shared shell. */
export abstract class CommitmentModal extends Modal {
    /** Apply the shared title, shell, and phone sizing classes. */
    protected configureCommitmentModal(title: string, modalClass: string): void {
        // Set the visible modal title.
        this.setTitle(title);

        // Apply the shared layout and the modal-specific identity.
        this.modalEl.classList.add("commitment-modal", modalClass, "mod-lg");
    }
}
