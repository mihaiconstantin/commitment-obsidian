/**
 * Obsidian plugin entry point: composition root for the two graph commands.
 */

import { Notice, Plugin, type App, type PluginManifest } from "obsidian";

import { CONFIG } from "./constants";
import { GraphBuilder } from "./graph/builder";
import type { GraphResult } from "./graph/commitment-graph";
import { VaultGraphStore, type WriteOutcome } from "./graph/store";
import type { CanonicalInput } from "./graph/types";
import { describeFailure } from "./helpers/utils";
import {
    SettingsReader,
    type CommitmentCreationSettings,
    type CommitmentSettings,
} from "./settings/settings";
import { CommitmentSettingTab } from "./settings/settings-tab";
import { ModalGraphPresenter } from "./ui/modal-presenter";
import type { GraphPresenter } from "./ui/presenter";


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

    /** Reads and normalizes persisted plugin data. */
    private readonly settingsReader: SettingsReader = new SettingsReader();

    /** Persisted graph presentation and container creation settings. */
    public settings: CommitmentSettings = CONFIG.DEFAULT_SETTINGS;

    /** Derive and display the graph without writing a vault file. */
    private async runView(): Promise<void> {
        // Require the ready workspace and release the guard on every path.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Read the saved inputs and build the same graph as Update.
            const inputs: readonly CanonicalInput[] = await this.store.readInputs();
            const result: GraphResult = new GraphBuilder(inputs).build();

            // Display the graph and its warnings without writing.
            this.presenter.show(result, this.settings.presentation.mode);
        } catch (error) {
            // Report the actionable failure without a partial graph.
            this.reportError(error);
        } finally {
            // Release the command guard.
            this.finishCommand();
        }
    }

    /** Derive and persist the graph, reporting the outcome. */
    private async runUpdate(): Promise<void> {
        // Require the ready workspace and release the guard on every path.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Read the saved inputs and build the graph.
            const inputs: readonly CanonicalInput[] = await this.store.readInputs();
            const result: GraphResult = new GraphBuilder(inputs).build();

            // Create, leave unchanged, or replace the derived output.
            const outcome: WriteOutcome = await this.store.writeGraph(result.graph.toJson());

            // Report the concise update outcome.
            new Notice(`Commitment graph ${outcome}`);

            // Present the graph when the build reported nonblocking warnings.
            if (result.diagnostics.length > 0) {
                // Show the warnings with their source paths.
                this.presenter.show(result, this.settings.presentation.mode);
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
            new Notice(CONFIG.NOT_READY_MESSAGE);
            return false;
        }

        // Reject a command while another graph command is running.
        if (this.busy) {
            // Report the busy message.
            new Notice(CONFIG.BUSY_MESSAGE);
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
        // Report the readable failure message.
        new Notice(describeFailure(error));
    }

    /** Compose the vault store and the modal presenter for one app. */
    public constructor(app: App, manifest: PluginManifest) {
        // Initialize the Obsidian plugin base with its app and manifest.
        super(app, manifest);

        // Compose the vault store and the modal presenter once.
        this.store = new VaultGraphStore(app.vault);
        this.presenter = new ModalGraphPresenter(
            app,
            (): CommitmentCreationSettings => this.settings.creation,
        );
    }

    /** Persist one complete settings value after normalization. */
    public async saveSettings(next: CommitmentSettings): Promise<void> {
        // Normalize the supplied value through the settings reader.
        const normalized: CommitmentSettings = this.settingsReader.read(next);

        // Retain the normalized settings for the next command or action.
        this.settings = normalized;

        // Persist only the normalized settings shape.
        await this.saveData(normalized);
    }

    /** Register the two commands and defer reads until the layout is ready. */
    public override async onload(): Promise<void> {
        // Apply the stored settings before any command or tab can read them.
        this.settings = this.settingsReader.read(await this.loadData().catch((): null => null));

        // Register the settings tab for presentation and creation.
        this.addSettingTab(new CommitmentSettingTab(this.app, this));

        // Mark the workspace ready after the layout loads.
        this.app.workspace.onLayoutReady((): void => {
            // Record the ready state for later command invocations.
            this.ready = true;
        });

        // Register the read-only graph command.
        this.addCommand({
            id: "view-graph",
            name: CONFIG.VIEW_COMMAND,
            callback: (): Promise<void> => {
                // Return the command promise so callers can observe completion.
                return this.runView();
            },
        });

        // Register the graph update command.
        this.addCommand({
            id: "update-graph",
            name: CONFIG.UPDATE_COMMAND,
            callback: (): Promise<void> => {
                // Return the command promise so callers can observe completion.
                return this.runUpdate();
            },
        });
    }
}
