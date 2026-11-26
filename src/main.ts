/**
 * Obsidian plugin entry point: composition root for the graph and Doctor
 * commands.
 */

import { Notice, Plugin, type App, type PluginManifest } from "obsidian";

import { CONFIG } from "./constants";
import { ContainerDocumentComposer } from "./containers/container-document";
import { VaultContainerFileActions } from "./containers/vault-file-actions";
import { VaultFileOpener } from "./containers/vault-file-opener";
import { Diagnostics, type Diagnostic } from "./diagnostics/diagnostics";
import { FrontmatterParser } from "./frontmatter/parser";
import { GraphBuilder, type GraphBuild } from "./graph/builder";
import { VaultGraphStore, type WriteOutcome } from "./graph/store";
import type { CanonicalInput } from "./graph/types";
import { countLabel } from "./helpers/strings";
import { describeFailure } from "./helpers/utils";
import {
    SettingsReader,
    type AppearanceSettings,
    type CommitmentCreationSettings,
    type CommitmentSettings,
} from "./settings/settings";
import { CommitmentSettingTab } from "./settings/settings-tab";
import { ModalDoctorPresenter } from "./ui/modal-doctor-presenter";
import { ModalGraphPresenter } from "./ui/modal-presenter";
import { TreeModel } from "./ui/tree-model";


/** Commitment graph plugin. */
export default class CommitmentPlugin extends Plugin {
    /** Vault-backed graph inputs and output. */
    private readonly store: VaultGraphStore;

    /** Nonblocking diagnostic collaborator. */
    private readonly diagnostics: Diagnostics;

    /** Composer shared by graph-specific container file actions. */
    private readonly composer: ContainerDocumentComposer;

    /** File opener shared by the graph and Doctor file actions. */
    private readonly opener: VaultFileOpener;

    /** Graph presentation owned by the plugin. */
    private readonly graphPresenter: ModalGraphPresenter;

    /** Doctor presentation owned by the plugin. */
    private readonly doctorPresenter: ModalDoctorPresenter;

    /** Whether the workspace finished loading its layout. */
    private ready = false;

    /** Whether one commitment command is already running. */
    private busy = false;

    /** Reads and normalizes persisted plugin data. */
    private readonly settingsReader: SettingsReader = new SettingsReader();

    /** Persisted graph presentation and container creation settings. */
    public settings: CommitmentSettings = CONFIG.DEFAULT_SETTINGS;

    /** Read the saved inputs and build the graph read model. */
    private async readBuild(): Promise<GraphBuild> {
        // Read every eligible saved file and parse its frontmatter.
        const inputs: readonly CanonicalInput[] = await this.store.readInputs();

        // Build the graph and read model without running diagnostics.
        return new GraphBuilder(inputs).build();
    }

    /** Derive and display the graph without writing a vault file. */
    private runView(): Promise<void> {
        // Run the graph display behind the shared command guard.
        return this.runGuarded(async (): Promise<void> => {
            // Build the same graph as Update without writing.
            const build: GraphBuild = await this.readBuild();

            // Create vault file actions only for the interactive tree.
            const actions: VaultContainerFileActions | null = this.settings.presentation.mode === "tree"
                ? new VaultContainerFileActions(
                    this.app,
                    build.graph,
                    (): CommitmentCreationSettings => this.settings.creation,
                    this.composer,
                    this.opener,
                )
                : null;

            // Create the tree model only for the interactive tree.
            const model: TreeModel | null = this.settings.presentation.mode === "tree"
                ? new TreeModel(
                    build.graph.getAreas(),
                    this.settings.presentation.sort,
                    this.settings.presentation.treeDefaults,
                )
                : null;

            // Display the graph without writing.
            this.graphPresenter.show(build.graph, this.settings.presentation, actions, model);
        });
    }

    /** Derive and persist the graph, reporting the outcome. */
    private runUpdate(): Promise<void> {
        // Run the graph update behind the shared command guard.
        return this.runGuarded(async (): Promise<void> => {
            // Build the graph before touching the derived output.
            const build: GraphBuild = await this.readBuild();

            // Collect the findings used by the update notice.
            const findings: readonly Diagnostic[] = this.diagnostics.collect(build.normalized, build.programs);

            // Create, leave unchanged, or replace the derived output.
            const outcome: WriteOutcome = await this.store.writeGraph(build.graph.toJson());

            // Report the update and any findings that need the Doctor.
            new Notice(this.updateNotice(outcome, findings.length));
        });
    }

    /** Display the current nonblocking findings without writing a file. */
    private runDoctor(): Promise<void> {
        // Run the Doctor display behind the shared command guard.
        return this.runGuarded(async (): Promise<void> => {
            // Build the graph from the current saved inputs.
            const build: GraphBuild = await this.readBuild();

            // Collect the findings from the same read model.
            const findings: readonly Diagnostic[] = this.diagnostics.collect(build.normalized, build.programs);

            // Show the findings without writing a vault file.
            this.doctorPresenter.show(findings);
        });
    }

    /** Run one command behind the shared readiness and busy guard. */
    private async runGuarded(action: () => Promise<void>): Promise<void> {
        // Require the ready workspace and acquire the guard.
        if (!this.beginCommand()) {
            // Stop when the plugin is not ready or another command is running.
            return;
        }

        try {
            // Run the command body.
            await action();
        } catch (error) {
            // Report the actionable failure without a partial result.
            this.reportError(error);
        } finally {
            // Release the command guard.
            this.finishCommand();
        }
    }

    /** Build the update notice with the finding count when it is nonzero. */
    private updateNotice(outcome: WriteOutcome, issueCount: number): string {
        // Read the plain outcome.
        const base: string = `Graph ${outcome}`;

        // If the build found no issues, keep the plain outcome.
        if (issueCount === 0) {
            // Report the unchanged or written outcome alone.
            return base;
        }

        // Point the user to the command that presents the findings.
        return `${base}. ${countLabel(issueCount, "issue")}. Run \`Commitment: ${CONFIG.DOCTOR_COMMAND}\`.`;
    }

    /** Check readiness and acquire the single command guard. */
    private beginCommand(): boolean {
        // Reject commands before the workspace layout is ready.
        if (!this.ready) {
            // Report the readiness message.
            new Notice(CONFIG.NOT_READY_MESSAGE);
            return false;
        }

        // Reject a command while another commitment command is running.
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

    /** Compose the vault store and both modal presenters for one app. */
    public constructor(app: App, manifest: PluginManifest) {
        // Initialize the Obsidian plugin base with its app and manifest.
        super(app, manifest);

        // Compose the vault store and both modal presenters once.
        this.store = new VaultGraphStore(app.vault, new FrontmatterParser());
        this.diagnostics = new Diagnostics();
        this.composer = new ContainerDocumentComposer();
        this.opener = new VaultFileOpener(app);
        this.graphPresenter = new ModalGraphPresenter(
            app,
            (): AppearanceSettings => this.settings.appearance,
        );
        this.doctorPresenter = new ModalDoctorPresenter(app, this.opener);
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

    /** Register the commands and defer reads until the layout is ready. */
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

        // Register the read-only diagnostics command.
        this.addCommand({
            id: "doctor",
            name: CONFIG.DOCTOR_COMMAND,
            callback: (): Promise<void> => {
                // Return the command promise so callers can observe completion.
                return this.runDoctor();
            },
        });
    }
}
