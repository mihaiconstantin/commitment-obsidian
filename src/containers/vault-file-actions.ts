/**
 * Vault-backed container file actions for area, program, and project rows.
 *
 * Existing rows open their indexed source file. Implicit rows compose a new
 * document from the configured template and create it without overwriting.
 */

import { moment, TFile, TFolder, type App, type TAbstractFile } from "obsidian";

import type { CommitmentGraph } from "../graph/commitment-graph";
import type { ContainerIdentity } from "../graph/types";
import { describeFailure } from "../helpers/utils";
import type { CommitmentCreationSettings, ContainerCreationSettings } from "../settings/settings";
import type { ContainerDocumentComposer } from "./container-document";
import type { ContainerFileActions, ContainerFileAction } from "./container-file-actions";
import { ContainerPathBuilder } from "./container-path";
import type { VaultFileOpener, VaultFileOpenResult } from "./vault-file-opener";


/** Open existing container files and create implicit ones. */
export class VaultContainerFileActions implements ContainerFileActions {
    /** App used for the vault and the workspace leaf. */
    private readonly app: App;

    /** Graph whose source index decides between open and create. */
    private readonly graph: CommitmentGraph;

    /** Supplier for the complete creation settings, read at activation time. */
    private readonly creation: () => CommitmentCreationSettings;

    /** Composer for new container documents. */
    private readonly composer: ContainerDocumentComposer;

    /** Shared policy for resolving and opening a vault path. */
    private readonly opener: VaultFileOpener;

    /** Open one indexed container source file. */
    private async openIndexed(path: string): Promise<void> {
        // Resolve and open the indexed path through the shared policy.
        const result: VaultFileOpenResult = await this.opener.open(path);

        // Reject an indexed path that no longer exists.
        if (result === "missing") {
            // Report the vanished indexed container.
            throw new Error(`Indexed file \`${path}\` is missing.`);
        }

        // Reject an indexed path that became a folder.
        if (result === "not-file") {
            // Report the unsupported indexed shape.
            throw new Error(`Indexed path \`${path}\` is not a file.`);
        }
    }

    /** Read the configured template and compose the target document. */
    private async composeDocument(identity: ContainerIdentity, settings: ContainerCreationSettings, target: string): Promise<string> {
        // Use an empty template when none is configured.
        let templateText: string = "";

        // Read the configured template when one is set.
        if (settings.templatePath !== "") {
            // Read the configured template file.
            templateText = await this.readTemplate(settings.templatePath);
        }

        // Compose the document with the exact identity and the current moment.
        try {
            // Validate the identity, apply placeholders, and apply the identity override.
            return this.composer.compose(
                templateText,
                identity,
                (pattern: string): string => moment().format(pattern),
            );
        } catch (error) {
            // Report the composition failure naming the target and template.
            throw new Error(
                this.composeMessage(target, settings.templatePath, describeFailure(error)),
            );
        }
    }

    /** Return the composition failure message with its template context. */
    private composeMessage(target: string, templatePath: string, reason: string): string {
        // Name the template only when one is configured.
        return templatePath === ""
            ? `Cannot compose \`${target}\`, ${reason}.`
            : `Cannot compose \`${target}\` from \`${templatePath}\`, ${reason}.`;
    }

    /** Read one configured template file. */
    private async readTemplate(path: string): Promise<string> {
        // Resolve the configured template path.
        const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);

        // Reject a missing template path.
        if (entry === null) {
            // Report the missing template with its path.
            throw new Error(`Template \`${path}\` is missing.`);
        }

        // Require the template path to point at an ordinary file.
        if (!(entry instanceof TFile)) {
            // Report the unsupported template shape.
            throw new Error(`Template \`${path}\` is not a file.`);
        }

        // Read the template text.
        try {
            // Return the exact saved template text.
            return await this.app.vault.read(entry);
        } catch (error) {
            // Report the unreadable template with its path.
            throw new Error(`Cannot read template \`${path}\`, ${describeFailure(error)}`);
        }
    }

    /** Create the missing folder chain for one target path. */
    private async ensureFolders(target: string): Promise<void> {
        // Read the directories that lead to the target file.
        const directories: readonly string[] = target.split("/").slice(0, -1);

        // Walk the chain from the vault root.
        let current: string = "";

        // Visit every folder in the chain.
        for (const directory of directories) {
            // Extend the current folder path.
            current = current === "" ? directory : `${current}/${directory}`;

            // Read the existing entry at the current folder path.
            const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(current);

            // If the folder already exists, continue with the next folder.
            if (entry instanceof TFolder) {
                // Continue with the next folder when it already exists.
                continue;
            }

            // Reject a file that occupies the folder path.
            if (entry !== null) {
                // Report the occupied parent path.
                throw new Error(
                    `Cannot create \`${target}\`, \`${current}\` is not a folder.`,
                );
            }

            // Create the missing folder.
            try {
                // Create the current folder in the chain.
                await this.app.vault.createFolder(current);
            } catch (error) {
                // Report the folder creation failure with its path.
                throw new Error(
                    `Cannot create folder \`${current}\`, ${describeFailure(error)}`,
                );
            }
        }
    }

    /** Construct the actions with their graph, live settings, composer, and opener. */
    public constructor(app: App, graph: CommitmentGraph, creation: () => CommitmentCreationSettings, composer: ContainerDocumentComposer, opener: VaultFileOpener) {
        // Store the app, graph, live settings, and injected collaborators.
        this.app = app;
        this.graph = graph;
        this.creation = creation;
        this.composer = composer;
        this.opener = opener;
    }

    /** Return whether the row opens an indexed file or creates one. */
    public actionFor(identity: ContainerIdentity): ContainerFileAction {
        // Read the indexed source path without touching the vault.
        return this.graph.getContainerPath(identity.kind, identity.id) === null
            ? "create"
            : "open";
    }

    /** Open the indexed file or create the configured new document. */
    public async activate(identity: ContainerIdentity): Promise<void> {
        // Open an existing container file.
        const indexed: string | null = this.graph.getContainerPath(identity.kind, identity.id);

        // If the container has an indexed source, open it.
        if (indexed !== null) {
            // Open the indexed source file.
            await this.openIndexed(indexed);
            return;
        }

        // Read one current creation-settings snapshot for this activation.
        const creation: CommitmentCreationSettings = this.creation();
        const settings: ContainerCreationSettings = creation[identity.kind];

        // Derive the configured target path.
        const target: string = new ContainerPathBuilder(
            settings.folderPath,
            settings.pattern,
            creation.idStyle,
        ).path(identity);

        // Reject any file or folder that already occupies the target.
        if (this.app.vault.getAbstractFileByPath(target) !== null) {
            // Report the occupied target without writing.
            throw new Error(`Cannot create \`${target}\`. Path exists.`);
        }

        // Read and compose the template before any folder or file write.
        const text: string = await this.composeDocument(identity, settings, target);

        // Create the missing parent folders after composition succeeds.
        await this.ensureFolders(target);

        // Create the composed document without overwriting.
        let file: TFile;

        // Create the target file.
        try {
            file = await this.app.vault.create(target, text);
        } catch (error) {
            // Report the creation failure with its target path.
            throw new Error(`Cannot create \`${target}\`, ${describeFailure(error)}`);
        }

        // Open the created file in the main workspace.
        await this.app.workspace.getLeaf(false).openFile(file);
    }
}
