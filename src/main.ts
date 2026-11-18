/**
 * Obsidian plugin entry point: composition root for the two graph commands.
 */

import { Notice, Plugin } from "obsidian";

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
    private store: VaultGraphStore | null = null;

    /** Replaceable graph presentation seam. */
    private presenter: GraphPresenter | null = null;

    /** Whether the workspace finished loading its layout. */
    private ready = false;

    /** Whether one graph command is already running. */
    private busy = false;

    /** Register the two commands and defer reads until the layout is ready. */
    onload(): void {
        // Compose the vault store and the modal presenter.
        this.store = new VaultGraphStore(this.app.vault);
        this.presenter = new TextGraphPresenter(this.app);

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

    /** Derive and display the graph without writing a vault file. */
    private async runView(): Promise<void> {
        // Require the ready workspace and release the guard on every path.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Read the saved inputs and build the same graph as Update.
            const result: GraphResult = await this.buildGraph();

            // Display the graph and its warnings without writing.
            this.presenter?.show(result.graph, result.diagnostics);
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
            // Require the configured store before any vault access.
            const store: VaultGraphStore = this.requireStore();

            // Read the saved inputs and build the graph.
            const snapshot: InputSnapshot = await store.readInputs();
            const result: GraphResult = CommitmentGraph.build(snapshot.inputs);

            // Reject changed inputs before touching the destination.
            await store.assertUnchanged(snapshot);

            // Create, leave unchanged, or replace the derived output.
            const outcome: WriteOutcome = await store.writeGraph(result.graph.toJson());

            // Report the concise update outcome.
            new Notice(`Commitment graph ${outcome}`);

            // Present any nonblocking warnings with their source paths.
            this.showWarnings(result);
        } catch (error) {
            // Report the actionable failure without a partial write.
            this.reportError(error);
        } finally {
            // Release the command guard.
            this.finishCommand();
        }
    }

    /** Read the saved inputs and build the graph through the shared model. */
    private async buildGraph(): Promise<GraphResult> {
        // Read the saved inputs through the configured store.
        const snapshot: InputSnapshot = await this.requireStore().readInputs();

        // Derive the canonical graph from the saved inputs.
        return CommitmentGraph.build(snapshot.inputs);
    }

    /** Require the store composed during plugin load. */
    private requireStore(): VaultGraphStore {
        // Read the composed store.
        const store: VaultGraphStore | null = this.store;

        // Reject a command that runs before composition.
        if (store === null) {
            // Report the unavailable composition state.
            throw new Error("Commitment graph plugin is not initialized");
        }

        // Return the composed store.
        return store;
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

    /** Show nonblocking warnings through the shared presentation seam. */
    private showWarnings(result: GraphResult): void {
        // Skip presentation when the build produced no warnings.
        if (result.diagnostics.length === 0) {
            // Return without opening a modal.
            return;
        }

        // Present the derived graph and its warnings for readable scrolling.
        this.presenter?.show(result.graph, result.diagnostics);
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
}
