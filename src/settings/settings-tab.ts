/**
 * Settings tab for graph presentation and container creation.
 */

import {
    Plugin,
    PluginSettingTab,
    Setting,
    type App,
    type DropdownComponent,
    type TextComponent,
} from "obsidian";

import type { CommitmentLevel } from "../graph/types";
import type {
    CommitmentSettings,
    ContainerCreationSettings,
} from "./settings";
import { isPresentationMode } from "./settings";


/** Plugin surface used by the settings tab. */
export interface CommitmentSettingsHost extends Plugin {
    /** Settings currently persisted for this plugin. */
    readonly settings: CommitmentSettings;

    /** Persist a complete settings value. */
    saveSettings(next: CommitmentSettings): Promise<void>;
}


/** One editable creation field. */
interface CreationField {
    /** Container kind edited by the field. */
    readonly kind: CommitmentLevel;

    /** Whether the field edits the template or the folder. */
    readonly field: "templatePath" | "folderPath";
}


/** Labels for one creation field. */
interface CreationCopy {
    /** Setting name. */
    readonly name: string;

    /** Setting description. */
    readonly description: string;

    /** Field placeholder. */
    readonly placeholder: string;
}


/** Readable copy for every container kind. */
const KIND_LABELS: Readonly<Record<CommitmentLevel, string>> = {
    area: "Area",
    program: "Program",
    project: "Project",
};


/** Settings tab for graph presentation and container creation. */
export class CommitmentSettingTab extends PluginSettingTab {
    /** Plugin whose settings this tab edits. */
    private readonly host: CommitmentSettingsHost;

    /** Construct the tab for one app and plugin. */
    constructor(app: App, host: CommitmentSettingsHost) {
        // Initialize the settings tab with its app and plugin.
        super(app, host);

        // Store the settings host used for reads and writes.
        this.host = host;
    }

    /** Render the presentation and creation settings. */
    display(): void {
        // Read the settings container element.
        const container: HTMLElement = this.containerEl;

        // Clear any previous content.
        container.empty();

        // Render the unchanged display-mode choice.
        this.presentationSetting(container);

        // Add the template and folder fields for every container kind.
        for (const kind of ["area", "program", "project"] as const) {
            // Render the template path field.
            this.creationSetting(container, { kind, field: "templatePath" });

            // Render the folder path field.
            this.creationSetting(container, { kind, field: "folderPath" });
        }
    }

    /** Persist one creation field change with the other settings intact. */
    private saveCreation(field: CreationField, value: string): void {
        // Read the current creation values.
        const creation: ContainerCreationSettings = this.host.settings.creation[field.kind];

        // Replace only the edited field.
        const next: CommitmentSettings = {
            ...this.host.settings,
            creation: {
                ...this.host.settings.creation,
                [field.kind]: { ...creation, [field.field]: value },
            },
        };

        // Persist the complete normalized value.
        void this.host.saveSettings(next);
    }

    /** Read the copy for one creation field. */
    private copyFor(field: CreationField): CreationCopy {
        // Read the readable kind label.
        const label: string = KIND_LABELS[field.kind];

        // Describe the template field.
        if (field.field === "templatePath") {
            // Return the template copy.
            return {
                name: `${label} template`,
                description: `Vault path to the template for new ${field.kind} files. Leave empty to create frontmatter only.`,
                placeholder: "Templates/container.md",
            };
        }

        // Return the folder copy.
        return {
            name: `${label} folder`,
            description: `Vault folder for new ${field.kind} files. Leave empty to use the vault root.`,
            placeholder: "Commitments",
        };
    }

    /** Render the display-mode choice. */
    private presentationSetting(container: HTMLElement): void {
        // Create the presentation setting.
        new Setting(container)
            .setName("Graph view")
            .setDesc("Show the graph as JSON text or as a foldable tree.")
            .addDropdown((dropdown: DropdownComponent): void => {
                // Offer the JSON text presentation.
                dropdown.addOption("json", "JSON");

                // Offer the foldable tree presentation.
                dropdown.addOption("html", "Tree");

                // Select the stored presentation and persist a change.
                dropdown.setValue(this.host.settings.presentation.mode);
                dropdown.onChange((value: string): void => {
                    // Persist only a supported presentation.
                    if (isPresentationMode(value)) {
                        // Save the selected mode with the creation settings intact.
                        void this.host.saveSettings({
                            ...this.host.settings,
                            presentation: { mode: value },
                        });
                    }
                });
            });
    }

    /** Render one creation field. */
    private creationSetting(container: HTMLElement, field: CreationField): void {
        // Read the field copy.
        const copy: CreationCopy = this.copyFor(field);

        // Create the text setting.
        new Setting(container)
            .setName(copy.name)
            .setDesc(copy.description)
            .addText((text: TextComponent): void => {
                // Show the current value.
                text.setPlaceholder(copy.placeholder);
                text.setValue(this.host.settings.creation[field.kind][field.field]);

                // Persist a change with the other settings intact.
                text.onChange((value: string): void => {
                    // Save the edited field.
                    this.saveCreation(field, value);
                });
            });
    }
}
