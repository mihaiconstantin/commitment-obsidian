/**
 * Settings tab for graph presentation and container creation.
 */

import {
    Plugin,
    PluginSettingTab,
    Setting,
    type App,
    type ColorComponent,
    type DropdownComponent,
    type ExtraButtonComponent,
    type TextComponent,
    type ToggleComponent,
} from "obsidian";

import { CONFIG } from "../constants";
import { IdStyleCatalog } from "../containers/file-name";
import { PROJECT_STATES, type ProjectState } from "../graph/project-state";
import type { CommitmentLevel } from "../graph/types";
import { titleCase } from "../helpers/strings";
import type {
    AccentLevel,
    CommitmentSettings,
    GraphSort,
    PresentationMode,
    PresentationSettings,
    TreeDefaultsSettings,
} from "./settings";


/** Plugin surface used by the settings tab. */
export interface CommitmentSettingsHost extends Plugin {
    /** Settings currently persisted for this plugin. */
    readonly settings: CommitmentSettings;

    /** Persist a complete settings value. */
    saveSettings(next: CommitmentSettings): Promise<void>;
}


/** One tree state scope. */
type TreeStateKind = "project" | "program";


/** One editable creation field. */
interface CreationField {
    /** Container kind edited by the field. */
    readonly kind: CommitmentLevel;

    /** Which creation value the field edits. */
    readonly field: "templatePath" | "folderPath" | "pattern";
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


/** Settings tab for graph presentation and container creation. */
export class CommitmentSettingTab extends PluginSettingTab {
    /** Plugin whose settings this tab edits. */
    private readonly host: CommitmentSettingsHost;

    /** Supported identifier styles for the dropdown and change gate. */
    private readonly styles: IdStyleCatalog = new IdStyleCatalog();

    /** Accent copy for the two supported levels. */
    private readonly accentDescriptions: Readonly<Record<AccentLevel, string>> = {
        area: "Color for area names and size meters.",
        program: "Color for program names and glyphs.",
    };

    /** Persist one settings change against the latest values. */
    private commit(change: (current: CommitmentSettings) => CommitmentSettings): void {
        // Save the complete value derived from the latest settings.
        void this.host.saveSettings(change(this.host.settings));
    }

    /** Render one group heading using the setting widget Obsidian provides. */
    private heading(container: HTMLElement, text: string): void {
        // Use the heading form of a setting, which exists at the minimum app version.
        new Setting(container).setName(text).setHeading();
    }

    /** Persist one accent color change with the other settings intact. */
    private saveAppearance(kind: AccentLevel, value: string): void {
        // Replace only the edited commitment level.
        this.commit((current: CommitmentSettings): CommitmentSettings => ({
            ...current,
            appearance: { ...current.appearance, [kind]: value },
        }));
    }

    /** Persist one creation field change with the other settings intact. */
    private saveCreation(field: CreationField, value: string): void {
        // Replace only the edited field.
        this.commit((current: CommitmentSettings): CommitmentSettings => ({
            ...current,
            creation: {
                ...current.creation,
                [field.kind]: { ...current.creation[field.kind], [field.field]: value },
            },
        }));
    }

    /** Persist presentation changes with the other settings intact. */
    private savePresentation(patch: Partial<PresentationSettings>): void {
        // Merge the change into the latest presentation values.
        this.commit((current: CommitmentSettings): CommitmentSettings => ({
            ...current,
            presentation: { ...current.presentation, ...patch },
        }));
    }

    /** Persist tree default changes with the other presentation settings intact. */
    private saveTreeDefaults(patch: Partial<TreeDefaultsSettings>): void {
        // Merge the change into the latest tree defaults.
        this.savePresentation({
            treeDefaults: { ...this.host.settings.presentation.treeDefaults, ...patch },
        });
    }

    /** Render the default area visibility choice. */
    private areaDefaultsSetting(container: HTMLElement): void {
        // Create the area default toggle.
        new Setting(container)
            .setName("Hide inactive areas by default")
            .setDesc("Start each tree with areas marked inactive hidden.")
            .addToggle((toggle: ToggleComponent): void => {
                // Show the stored default.
                toggle.setValue(this.host.settings.presentation.treeDefaults.hideInactiveAreas);

                // Persist a changed choice.
                toggle.onChange((value: boolean): void => {
                    // Save the area default.
                    this.saveTreeDefaults({ hideInactiveAreas: value });
                });
            });
    }

    /** Render one state's default selection toggle. */
    private stateDefaultSetting(container: HTMLElement, kind: TreeStateKind, state: ProjectState): void {
        // Read the selection for this scope.
        const key: "projectStates" | "programStates" = kind === "project"
            ? "projectStates"
            : "programStates";

        // Create the state toggle.
        new Setting(container)
            .setName(`${titleCase(state)} ${kind}s`)
            .addToggle((toggle: ToggleComponent): void => {
                // Show the stored selection.
                toggle.setValue(this.host.settings.presentation.treeDefaults[key].includes(state));

                // Persist a changed selection.
                toggle.onChange((value: boolean): void => {
                    // Read the latest selection before changing it.
                    const current: readonly ProjectState[] =
                        this.host.settings.presentation.treeDefaults[key];

                    // Add or remove the edited state.
                    const next: readonly ProjectState[] = value
                        ? [...current, state]
                        : current.filter((candidate: ProjectState): boolean => candidate !== state);

                    // Save the updated selection.
                    this.saveTreeDefaults({ [key]: next });
                });
            });
    }

    /** Render the six default state toggles for one scope. */
    private stateDefaultsSetting(container: HTMLElement, kind: TreeStateKind): void {
        // Explain the group before its toggles.
        new Setting(container)
            .setName(`Default ${kind} states`)
            .setDesc("States checked when a tree opens. Changes in the tree are session-only.");

        // Add one toggle per recognized state.
        for (const state of PROJECT_STATES) {
            // Render the state toggle.
            this.stateDefaultSetting(container, kind, state);
        }
    }

    /** Read the copy for one creation field. */
    private copyFor(field: CreationField): CreationCopy {
        // Read the readable kind label.
        const label: string = CONFIG.KIND_LABELS[field.kind];

        // Describe the pattern field.
        if (field.field === "pattern") {
            // Return the pattern copy with the placeholder spelled out.
            return {
                name: `${label} file name`,
                description: `Base name for new ${field.kind} files without the extension. Use {{id}} for the identifier. This value must contain a unique part.`,
                placeholder: CONFIG.DEFAULT_PATTERNS[field.kind],
            };
        }

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
                // Offer every supported presentation with its readable label.
                for (const mode of Object.keys(CONFIG.PRESENTATION_MODES) as PresentationMode[]) {
                    // Add the mode with its readable label.
                    dropdown.addOption(mode, CONFIG.PRESENTATION_MODES[mode]);
                }

                // Select the stored presentation and persist a change.
                dropdown.setValue(this.host.settings.presentation.mode);
                dropdown.onChange((value: string): void => {
                    // Persist only a mode defined by the shared map.
                    if (Object.prototype.hasOwnProperty.call(CONFIG.PRESENTATION_MODES, value)) {
                        // Save the selected mode with the order and creation settings intact.
                        this.savePresentation({ mode: value as PresentationMode });
                    }
                });
            });
    }

    /** Render the graph area order choice. */
    private sortSetting(container: HTMLElement): void {
        // Create the sort setting.
        new Setting(container)
            .setName("Graph order")
            .setDesc("Order areas in every graph view.")
            .addDropdown((dropdown: DropdownComponent): void => {
                // Offer every supported order with its readable label.
                for (const sort of Object.keys(CONFIG.GRAPH_SORTS) as GraphSort[]) {
                    // Add the order with its readable label.
                    dropdown.addOption(sort, CONFIG.GRAPH_SORTS[sort]);
                }

                // Select the stored order and persist a change.
                dropdown.setValue(this.host.settings.presentation.sort);
                dropdown.onChange((value: string): void => {
                    // Persist only an order defined by the shared map.
                    if (Object.prototype.hasOwnProperty.call(CONFIG.GRAPH_SORTS, value)) {
                        // Save the selected order with the mode and creation settings intact.
                        this.savePresentation({ sort: value as GraphSort });
                    }
                });
            });
    }

    /** Render one commitment level's accent color choice. */
    private appearanceSetting(container: HTMLElement, kind: AccentLevel): void {
        // Read the stored color and the shipped default.
        const stored: string = this.host.settings.appearance[kind];
        const fallback: string = CONFIG.DEFAULT_SETTINGS.appearance[kind];

        // Keep the picker accessible to the reset control.
        let picker: ColorComponent | null = null;

        // Create the color setting and its reset action.
        const setting: Setting = new Setting(container)
            .setName(`${CONFIG.KIND_LABELS[kind]} accent`)
            .setDesc(this.accentDescriptions[kind]);
        setting.addColorPicker((component: ColorComponent): void => {
            // Store the component and show the applied color.
            picker = component;
            component.setValue(stored);

            // Persist a changed picker value.
            component.onChange((value: string): void => {
                // Save the selected accent.
                this.saveAppearance(kind, value);
            });
        });
        setting.addExtraButton((button: ExtraButtonComponent): void => {
            // Restore the shipped default and update the visible picker.
            button.setIcon("rotate-ccw");
            button.setTooltip("Reset to the default");
            button.onClick((): void => {
                // Restore the default color.
                this.saveAppearance(kind, fallback);

                // Show the restored default.
                picker?.setValue(fallback);
            });
        });
    }

    /** Render the identifier style choice. */
    private styleSetting(container: HTMLElement): void {
        // Create the style setting.
        new Setting(container)
            .setName("File name identifier")
            .setDesc("How the identifier is written inside created file names. Template placeholders are unchanged.")
            .addDropdown((dropdown: DropdownComponent): void => {
                // Offer every supported style.
                for (const style of this.styles.keys()) {
                    // Add the style with its readable label.
                    dropdown.addOption(style, this.styles.label(style));
                }

                // Select the stored style and persist a change.
                dropdown.setValue(this.host.settings.creation.idStyle);
                dropdown.onChange((value: string): void => {
                    // Persist only a supported style.
                    if (this.styles.isStyle(value)) {
                        // Save the style with every other setting intact.
                        this.commit((current: CommitmentSettings): CommitmentSettings => ({
                            ...current,
                            creation: { ...current.creation, idStyle: value },
                        }));
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

    /** Construct the tab for one app and plugin. */
    public constructor(app: App, host: CommitmentSettingsHost) {
        // Initialize the settings tab with its app and plugin.
        super(app, host);

        // Store the settings host used for reads and writes.
        this.host = host;
    }

    /** Render the presentation and creation settings. */
    public override display(): void {
        // Read the settings container element.
        const container: HTMLElement = this.containerEl;

        // Clear any previous content.
        container.empty();

        // Render the plugin-wide choices.
        this.heading(container, "General");
        this.presentationSetting(container);
        this.sortSetting(container);
        this.styleSetting(container);

        // Render the accent color heading.
        this.heading(container, "Appearance");

        // Add a color picker for every supported commitment level.
        for (const kind of ["area", "program"] as const) {
            // Add the level's color picker and reset action.
            this.appearanceSetting(container, kind);
        }

        // Add the three creation fields for every container kind.
        for (const kind of ["area", "program", "project"] as const) {
            // Group the kind's fields under its own heading.
            this.heading(container, CONFIG.KIND_LABELS[kind]);

            // Add the area default before its creation fields.
            if (kind === "area") {
                // Render the default area visibility choice.
                this.areaDefaultsSetting(container);
            } else {
                // Render the default state toggles for this kind.
                this.stateDefaultsSetting(container, kind);
            }

            // Render the template, folder, and pattern fields.
            this.creationSetting(container, { kind, field: "templatePath" });
            this.creationSetting(container, { kind, field: "folderPath" });
            this.creationSetting(container, { kind, field: "pattern" });
        }
    }
}
