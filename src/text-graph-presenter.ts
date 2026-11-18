/**
 * Standard Obsidian modal presentation of the commitment graph.
 */

import { Modal, type App } from "obsidian";

import type { CommitmentGraph } from "./commitment-graph";
import type { Diagnostic } from "./graph-types";
import type { GraphPresenter } from "./graph-presenter";


/** Present the graph as selectable, scrollable text with its warnings. */
export class TextGraphPresenter implements GraphPresenter {
    /** App used to open the modal. */
    private readonly app: App;

    /** Construct the presenter for one app. */
    constructor(app: App) {
        // Store the app used for presentation.
        this.app = app;
    }

    /** Display one graph and its warnings in a modal. */
    show(graph: CommitmentGraph, diagnostics: readonly Diagnostic[]): void {
        // Create the standard app modal.
        const modal: Modal = new Modal(this.app);

        // Set the readable modal title.
        modal.setTitle("Commitment graph");

        // Read the modal content element.
        const content: HTMLElement = modal.contentEl;

        // Clear any previous content.
        content.empty();

        // Add the saved-files label before the graph text.
        content.createEl("p", {
            text: "Graph from saved files",
            cls: "commitment-graph__label",
        });

        // Add the graph JSON as selectable text in a scrollable block.
        const block: HTMLElement = content.createEl("pre", {
            cls: "commitment-graph__json",
        });
        block.setText(graph.toJson());

        // Add the warnings when the build reported any.
        if (diagnostics.length > 0) {
            // Add a warnings heading below the graph.
            content.createEl("h3", {
                text: "Warnings",
                cls: "commitment-graph__warnings-title",
            });

            // List each warning with its affected paths.
            const list: HTMLElement = content.createEl("ul", {
                cls: "commitment-graph__warnings",
            });
            for (const diagnostic of diagnostics) {
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

        // Open the modal on the active window.
        modal.open();
    }
}
