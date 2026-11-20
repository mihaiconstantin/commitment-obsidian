/**
 * Vault-backed container file actions for area, program, and project rows.
 *
 * Existing rows open their indexed source file. Implicit rows compose a new
 * document from the configured template and create it without overwriting.
 */

import { moment, TFile, TFolder, type App, type TAbstractFile } from "obsidian";

import { parseFrontmatter } from "../frontmatter/parser";
import { CommitmentGraph } from "../graph/commitment-graph";
import { DEFAULT_ID_STYLE, type IdStyle } from "./file-name";
import type { CommitmentLevel, ContainerIdentity } from "../graph/types";
import { describeFailure } from "../plugin-failure";
import type { ContainerCreationSettings } from "../settings/settings";
import { composeContainerDocument } from "./container-document";
import type { ContainerFileActions, ContainerFileAction } from "./container-file-actions";
import { containerPath } from "./container-path";


/** Open existing container files and create implicit ones. */
export class VaultContainerFileActions implements ContainerFileActions {
    /** App used for the vault and the workspace leaf. */
    private readonly app: App;

    /** Graph whose source index decides between open and create. */
    private readonly graph: CommitmentGraph;

    /** Supplier for one kind's creation settings, read at activation time. */
    private readonly settingsFor: (kind: CommitmentLevel) => ContainerCreationSettings;

    /** Supplier for the global identifier style, read at activation time. */
    private readonly styleFor: () => IdStyle;

    /** Construct the actions for one graph and creation settings supplier. */
    constructor(
        app: App,
        graph: CommitmentGraph,
        settingsFor: (kind: CommitmentLevel) => ContainerCreationSettings,
        styleFor: () => IdStyle = (): IdStyle => DEFAULT_ID_STYLE,
    ) {
        // Store the app, graph, and settings suppliers.
        this.app = app;
        this.graph = graph;
        this.settingsFor = settingsFor;
        this.styleFor = styleFor;
    }

    /** Return whether the row opens an indexed file or creates one. */
    actionFor(identity: ContainerIdentity): ContainerFileAction {
        // Read the indexed source path without touching the vault.
        return this.graph.getContainerPath(identity.kind, identity.id) === null
            ? "create"
            : "open";
    }

    /** Open the indexed file or create the configured new document. */
    async activate(identity: ContainerIdentity): Promise<void> {
        // Open an existing container file.
        const indexed: string | null = this.graph.getContainerPath(identity.kind, identity.id);
        if (indexed !== null) {
            // Open the indexed source file.
            await this.openIndexed(indexed);
            return;
        }

        // Read the kind's creation settings at activation time.
        const settings: ContainerCreationSettings = this.settingsFor(identity.kind);

        // Derive the target path, reporting an unusable identifier.
        let target: string;
        try {
            // Derive the configured target path.
            target = containerPath(identity, settings.folderPath, settings.pattern, this.styleFor());
        } catch (error) {
            // Report the path-naming failure with the affected kind and identifier.
            throw new Error(
                `Cannot name the ${identity.kind} file for '${identity.id}': ${describeFailure(error)}`,
            );
        }

        // Reject any file or folder that already occupies the target.
        if (this.app.vault.getAbstractFileByPath(target) !== null) {
            // Report the occupied target without writing.
            throw new Error(`Cannot create '${target}': the path is already occupied.`);
        }

        // Read and compose the template before any folder or file write.
        const text: string = await this.composeDocument(identity, settings, target);

        // Create the missing parent folders after composition succeeds.
        await this.ensureFolders(target);

        // Create the composed document without overwriting.
        let file: TFile;
        try {
            // Create the target document.
            file = await this.app.vault.create(target, text);
        } catch (error) {
            // Report the creation failure with its target path.
            throw new Error(`Could not create '${target}': ${describeFailure(error)}`);
        }

        // Open the created file in the main workspace.
        await this.app.workspace.getLeaf(false).openFile(file);
    }

    /** Open one indexed container source file. */
    private async openIndexed(path: string): Promise<void> {
        // Require the indexed path to still resolve.
        const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
        if (entry === null) {
            // Report the vanished indexed container.
            throw new Error(`Indexed container file '${path}' no longer exists.`);
        }

        // Require the indexed path to still be an ordinary file.
        if (!(entry instanceof TFile)) {
            // Report the unsupported indexed shape.
            throw new Error(`Indexed container path '${path}' is not a file.`);
        }

        // Open the indexed file in the main workspace.
        await this.app.workspace.getLeaf(false).openFile(entry);
    }

    /** Read the configured template and compose the target document. */
    private async composeDocument(
        identity: ContainerIdentity,
        settings: ContainerCreationSettings,
        target: string,
    ): Promise<string> {
        // Use an empty template when none is configured.
        let templateText: string = "";
        if (settings.templatePath !== "") {
            // Read the configured template file.
            templateText = await this.readTemplate(settings.templatePath);
        }

        // Compose the document with the exact identity and the current moment.
        let text: string;
        try {
            // Apply placeholders and the identity override.
            text = composeContainerDocument(
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

        // Validate the composed frontmatter before writing anything.
        this.assertValidDocument(identity, settings.templatePath, target, text);

        // Return the validated document text.
        return text;
    }

    /** Return the composition failure message with its template context. */
    private composeMessage(target: string, templatePath: string, reason: string): string {
        // Name the template only when one is configured.
        return templatePath === ""
            ? `Could not compose '${target}': ${reason}.`
            : `Could not compose '${target}' from template '${templatePath}': ${reason}.`;
    }

    /** Read one configured template file. */
    private async readTemplate(path: string): Promise<string> {
        // Resolve the configured template path.
        const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
        if (entry === null) {
            // Report the missing template with its path.
            throw new Error(`Template file '${path}' does not exist.`);
        }

        // Require the template path to point at an ordinary file.
        if (!(entry instanceof TFile)) {
            // Report the unsupported template shape.
            throw new Error(`Template path '${path}' is not a file.`);
        }

        // Read the template text.
        try {
            // Return the exact saved template text.
            return await this.app.vault.read(entry);
        } catch (error) {
            // Report the unreadable template with its path.
            throw new Error(`Could not read template '${path}': ${describeFailure(error)}`);
        }
    }

    /** Ensure the composed document builds and reports the expected identity. */
    private assertValidDocument(
        identity: ContainerIdentity,
        templatePath: string,
        target: string,
        text: string,
    ): void {
        try {
            // Parse the composed frontmatter and build the single-document graph.
            const frontmatter = parseFrontmatter(target, text);
            const result = CommitmentGraph.build([{ path: target, frontmatter }]);

            // Require the composed identity to be a graph member.
            if (!result.graph.contains(identity.kind, identity.id)) {
                // Report the missing identity.
                throw new Error(`the ${identity.kind} identity is absent from the graph`);
            }
        } catch (error) {
            // Report the invalid composed document with its target and template.
            throw new Error(
                this.composeMessage(target, templatePath, describeFailure(error)),
            );
        }
    }

    /** Create the missing folder chain for one target path. */
    private async ensureFolders(target: string): Promise<void> {
        // Read the directories that lead to the target file.
        const directories: readonly string[] = target.split("/").slice(0, -1);

        // Walk the chain from the vault root.
        let current: string = "";
        for (const directory of directories) {
            // Extend the current folder path.
            current = current === "" ? directory : `${current}/${directory}`;

            // Read the existing entry at the current folder path.
            const entry: TAbstractFile | null = this.app.vault.getAbstractFileByPath(current);
            if (entry instanceof TFolder) {
                // Continue with the next folder when it already exists.
                continue;
            }

            // Reject a file that occupies the folder path.
            if (entry !== null) {
                // Report the occupied parent path.
                throw new Error(
                    `Cannot create '${target}': parent path '${current}' is not a folder.`,
                );
            }

            // Create the missing folder.
            try {
                // Create the current folder in the chain.
                await this.app.vault.createFolder(current);
            } catch (error) {
                // Report the folder creation failure with its path.
                throw new Error(
                    `Could not create folder '${current}': ${describeFailure(error)}`,
                );
            }
        }
    }
}
