/**
 * Obsidian plugin entry point: composition root for the two graph commands.
 */

import { Notice, Plugin, type App, type PluginManifest } from "obsidian";

import { CommitmentGraph } from "./commitment-graph";
import type { GraphResult } from "./commitment-graph";
import type { GraphPresenter } from "./graph-presenter";
import type { InputSnapshot } from "./graph-types";
import { isPluginFailure } from "./plugin-failure";
import { TextGraphPresenter } from "./text-graph-presenter";
import { VaultGraphStore } from "./vault-graph-store";
import type { WriteOutcome } from "./vault-graph-store";


/** Command names registered under the `Commitment` plugin name. */
const VIEW_COMMAND: "View graph" = "View graph";
const UPDATE_COMMAND: "Update graph" = "Update graph";


/** Readiness message shown before the workspace has finished loading. */
const NOT_READY_MESSAGE: "Vault is still loading; try again" = "Vault is still loading; try again";


/** Busy message shown when one graph command is already running. */
const BUSY_MESSAGE: "A commitment graph command is already running" = "A commitment graph command is already running";


/** Commitment graph plugin. */
export default class CommitmentPlugin extends Plugin {
    /** Vault-backed graph inputs and output. */
    private readonly store: VaultGraphStore;

    /** Replaceable graph presentation seam. */
    private readonly presenter: GraphPresenter;

    /** Whether the workspace finished loading its layout. */
    private ready = false;

    /** Whether one graph command is already running. */
    private busy = false;

    /** Compose the vault store and the modal presenter for one app. */
    constructor(app: App, manifest: PluginManifest) {
        // Initialize the Obsidian plugin base with its app and manifest.
        super(app, manifest);

        // Compose the vault store and the modal presenter once.
        this.store = new VaultGraphStore(app.vault);
        this.presenter = new TextGraphPresenter(app);
    }

    /** Derive and display the graph without writing a vault file. */
    private async runView(): Promise<void> {
        // Require the ready workspace and release the guard on every path.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Read the saved inputs and build the same graph as Update.
            const snapshot: InputSnapshot = await this.store.readInputs();
            const result: GraphResult = CommitmentGraph.build(snapshot.inputs);

            // Display the graph and its warnings without writing.
            this.presenter.show(result.graph, result.diagnostics);
        } catch (error) {
            // Report the actionable failure without a partial graph.
            this.reportError(error);
        } finally {
            // Release the command guard.
            this.finishCommand();
        }
    }

    /** Derive, recheck, and persist the graph, reporting the outcome. */
    private async runUpdate(): Promise<void> {
        // Require the ready workspace and release the guard on every path.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Read the saved inputs and build the graph.
            const snapshot: InputSnapshot = await this.store.readInputs();
            const result: GraphResult = CommitmentGraph.build(snapshot.inputs);

            // Reject changed inputs before touching the destination.
            await this.store.assertUnchanged(snapshot);

            // Create, leave unchanged, or replace the derived output.
            const outcome: WriteOutcome = await this.store.writeGraph(result.graph.toJson());

            // Report the concise update outcome.
            new Notice(`Commitment graph ${outcome}`);

            // Present the graph when the build reported nonblocking warnings.
            if (result.diagnostics.length > 0) {
                // Show the warnings with their source paths.
                this.presenter.show(result.graph, result.diagnostics);
            }
        } catch (error) {
            // Report the actionable failure without a partial write.
            this.reportError(error);
        } finally {
            // Release the command guard.
            this.finishCommand();
        }
    }

    /** Check readiness and acquire the single command guard. */
    private beginCommand(): boolean {
        // Reject commands before the workspace layout is ready.
        if (!this.ready) {
            // Report the readiness message.
            new Notice(NOT_READY_MESSAGE);
            return false;
        }

        // Reject a command while another graph command is running.
        if (this.busy) {
            // Report the busy message.
            new Notice(BUSY_MESSAGE);
            return false;
        }

        // Acquire the command guard.
        this.busy = true;
        return true;
    }

    /** Release the single command guard. */
    private finishCommand(): void {
        // Clear the command guard.
        this.busy = false;
    }

    /** Report one command failure with a concise notice. */
    private reportError(error: unknown): void {
        // Read the structured message when the failure carries one.
        if (isPluginFailure(error)) {
            // Report the path-specific message.
            new Notice(error.message);
            return;
        }

        // Report the unexpected failure message.
        new Notice(error instanceof Error ? error.message : String(error));
    }

    /** Register the two commands and defer reads until the layout is ready. */
    onload(): void {
        // Mark the workspace ready after the layout loads.
        this.app.workspace.onLayoutReady((): void => {
            // Record the ready state for later command invocations.
            this.ready = true;
        });

        // Register the read-only graph command.
        this.addCommand({
            id: "view-graph",
            name: VIEW_COMMAND,
            callback: (): Promise<void> => {
                // Return the command promise so callers can observe completion.
                return this.runView();
            },
        });

        // Register the graph update command.
        this.addCommand({
            id: "update-graph",
            name: UPDATE_COMMAND,
            callback: (): Promise<void> => {
                // Return the command promise so callers can observe completion.
                return this.runUpdate();
            },
        });
    }
}
