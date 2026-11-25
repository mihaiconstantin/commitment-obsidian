/**
 * Persisted plugin settings for graph presentation and container creation.
 */

import { CONFIG } from "../constants";
import { IdStyleCatalog, type IdStyle } from "../containers/file-name";
import { PROJECT_STATES, isProjectState, type ProjectState } from "../graph/project-state";
import type { CommitmentLevel } from "../graph/types";
import { ownValue } from "../helpers/utils";


/** How the graph content is presented. */
export type PresentationMode = "json" | "tree";


/** Order used for graph areas in every presentation. */
export type GraphSort = "name" | "count";


/** One container kind's creation settings. */
export interface ContainerCreationSettings {
    /** Vault path of the new document template, or empty for frontmatter only. */
    readonly templatePath: string;

    /** Vault folder for new files, or empty for the vault root. */
    readonly folderPath: string;

    /** Basename pattern without extension; `{{id}}` marks the identifier. */
    readonly pattern: string;
}


/** Creation settings for every container kind. */
export interface CommitmentCreationSettings {
    /** How the identifier is capitalized inside created file names. */
    readonly idStyle: IdStyle;

    /** Area creation settings. */
    readonly area: ContainerCreationSettings;

    /** Program creation settings. */
    readonly program: ContainerCreationSettings;

    /** Project creation settings. */
    readonly project: ContainerCreationSettings;
}


/** Default filters applied when a tree opens. */
export interface TreeDefaultsSettings {
    /** Project states checked when a tree opens. */
    readonly projectStates: readonly ProjectState[];

    /** Program states checked when a tree opens. */
    readonly programStates: readonly ProjectState[];

    /** Whether explicitly inactive areas are hidden when a tree opens. */
    readonly hideInactiveAreas: boolean;
}


/** Presentation settings stored in the plugin data file. */
export interface PresentationSettings {
    /** Shape used to present the graph. */
    readonly mode: PresentationMode;

    /** Order used for graph areas. */
    readonly sort: GraphSort;

    /** Default filters applied when a tree opens. */
    readonly treeDefaults: TreeDefaultsSettings;
}


/** Commitment levels with an editable accent color. */
export type AccentLevel = "area" | "program";


/** Accent colors for the two commitment levels that carry one. */
export interface AppearanceSettings {
    /** Area accent. */
    readonly area: string;

    /** Program accent. */
    readonly program: string;
}


/** Settings stored in the plugin data file. */
export interface CommitmentSettings {
    /** Graph presentation settings. */
    readonly presentation: PresentationSettings;

    /** Graph appearance settings. */
    readonly appearance: AppearanceSettings;

    /** Container creation settings. */
    readonly creation: CommitmentCreationSettings;
}


/** Reads and normalizes the supported settings from persisted plugin data. */
export class SettingsReader {
    /** Supported identifier styles used to gate the persisted value. */
    private readonly styles: IdStyleCatalog = new IdStyleCatalog();

    /** Read one supported choice, falling back on an unknown or malformed value. */
    private readChoice<T extends string>(value: unknown, options: Readonly<Record<T, string>>, fallback: T): T {
        // Require exact text that names an own supported choice.
        return typeof value === "string" && Object.prototype.hasOwnProperty.call(options, value)
            ? value as T
            : fallback;
    }

    /** Return a vault-relative setting path, or empty when it is unsafe. */
    private readVaultPath(value: unknown): string {
        // Require exact text.
        if (typeof value !== "string") {
            // Treat a malformed value as unset.
            return "";
        }

        // Trim surrounding whitespace.
        const trimmed: string = value.trim();

        // Treat an empty value as unset.
        if (trimmed === "") {
            // Report no configured path.
            return "";
        }

        // Normalize separators before inspecting or removing segments.
        const parts: readonly string[] = trimmed.replace(/\\/g, "/").split("/");

        // Reject any traversal segment.
        if (parts.some((segment: string): boolean => segment === "..")) {
            // Drop a path that can escape the vault.
            return "";
        }

        // Remove current-directory segments before checking the path root.
        const withoutDots: readonly string[] = parts.filter(
            (segment: string): boolean => segment !== ".",
        );

        // Reject absolute, UNC, and empty paths from a leading empty segment.
        if (withoutDots.length === 0 || withoutDots[0] === "") {
            // Drop the rooted path.
            return "";
        }

        // Remove empty segments inside the path.
        const segments: readonly string[] = withoutDots.filter(
            (segment: string): boolean => segment !== "",
        );
        const normalized: string = segments.join("/");

        // Reject an empty result or a drive-letter path.
        if (normalized === "" || /^[A-Za-z]:/.test(normalized)) {
            // Drop the unusable path.
            return "";
        }

        // Return the normalized vault-relative path.
        return normalized;
    }

    /** Read one accent color, falling back on a malformed or absent value. */
    private readColor(value: unknown, fallback: string): string {
        // Require exact text.
        if (typeof value !== "string") {
            // Use the shipped default.
            return fallback;
        }

        // Normalize the color for comparison and storage.
        const color: string = value.trim().toLowerCase();

        // Keep only a complete six-digit hexadecimal color.
        return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
    }

    /** Read one state selection in canonical order, falling back on malformed data. */
    private readStates(value: unknown, fallback: readonly ProjectState[]): readonly ProjectState[] {
        // Require a stored array.
        if (!Array.isArray(value)) {
            // Use the shipped selection.
            return fallback;
        }

        // Start the recognized state set.
        const selected: Set<ProjectState> = new Set<ProjectState>();

        // Keep only recognized states and remove duplicates.
        for (const candidate of value) {
            // Add each recognized state.
            if (isProjectState(candidate)) {
                // Store the state for canonical ordering.
                selected.add(candidate);
            }
        }

        // Fall back when a non-empty array has no recognized state.
        if (selected.size === 0 && value.length > 0) {
            // Treat the malformed selection as unset.
            return fallback;
        }

        // Return the selection in the closed vocabulary order.
        return PROJECT_STATES.filter((state: ProjectState): boolean => selected.has(state));
    }

    /** Read the default tree filters without trusting their shape. */
    private readTreeDefaults(value: unknown): TreeDefaultsSettings {
        // Read both state selections and the area flag independently.
        const projectStates: readonly ProjectState[] = this.readStates(
            ownValue(value, "projectStates"),
            CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults.projectStates,
        );
        const programStates: readonly ProjectState[] = this.readStates(
            ownValue(value, "programStates"),
            CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults.programStates,
        );

        // Require the exact boolean true for the area flag.
        const hideInactiveAreas: boolean = ownValue(value, "hideInactiveAreas") === true;

        // Return the normalized defaults.
        return { projectStates, programStates, hideInactiveAreas };
    }

    /** Read the accent color for each supported level. */
    private readAppearance(value: unknown): AppearanceSettings {
        // Read each supported level and ignore unknown level keys.
        return {
            area: this.readColor(
                ownValue(value, "area"),
                CONFIG.DEFAULT_SETTINGS.appearance.area,
            ),
            program: this.readColor(
                ownValue(value, "program"),
                CONFIG.DEFAULT_SETTINGS.appearance.program,
            ),
        };
    }

    /** Read one basename pattern, falling back on a malformed or empty value. */
    private readPattern(value: unknown, kind: CommitmentLevel): string {
        // Require exact text with visible content.
        if (typeof value !== "string" || value.trim() === "") {
            // Return the kind's default pattern.
            return CONFIG.DEFAULT_PATTERNS[kind];
        }

        // Keep the pattern text as stored.
        return value;
    }

    /** Read one kind's creation settings, ignoring malformed values. */
    private readCreation(value: unknown, kind: CommitmentLevel): ContainerCreationSettings {
        // Read the template and folder paths without trusting their shape.
        const templatePath: string = this.readVaultPath(ownValue(value, "templatePath"));
        const folderPath: string = this.readVaultPath(ownValue(value, "folderPath"));

        // Read the basename pattern, defaulting a malformed or empty value.
        const pattern: string = this.readPattern(ownValue(value, "pattern"), kind);

        // Return the normalized triple.
        return { templatePath, folderPath, pattern };
    }

    /** Read the supported settings from unvalidated plugin data. */
    public read(data: unknown): CommitmentSettings {
        // Read the nested presentation settings without trusting their shape.
        const presentation: unknown = ownValue(data, "presentation");
        const storedMode: unknown = ownValue(presentation, "mode");
        const storedSort: unknown = ownValue(presentation, "sort");

        // Fall back on the configured defaults for malformed presentation values.
        const mode: PresentationMode = this.readChoice(
            storedMode,
            CONFIG.PRESENTATION_MODES,
            CONFIG.DEFAULT_SETTINGS.presentation.mode,
        );
        const sort: GraphSort = this.readChoice(
            storedSort,
            CONFIG.GRAPH_SORTS,
            CONFIG.DEFAULT_SETTINGS.presentation.sort,
        );

        // Read the default tree filters without trusting their shape.
        const treeDefaults: TreeDefaultsSettings = this.readTreeDefaults(
            ownValue(presentation, "treeDefaults"),
        );

        // Read the accent colors without trusting their shape.
        const appearance: AppearanceSettings = this.readAppearance(ownValue(data, "appearance"));

        // Read each known creation kind and ignore unknown kind keys.
        const creationSource: unknown = ownValue(data, "creation");

        // Read the global style, falling back on an unknown value.
        const storedStyle: unknown = ownValue(creationSource, "idStyle");
        const idStyle: IdStyle = this.styles.isStyle(storedStyle)
            ? storedStyle
            : CONFIG.DEFAULT_ID_STYLE;

        // Read each kind with its own default pattern.
        const creation: Record<CommitmentLevel, ContainerCreationSettings> = {
            area: this.readCreation(ownValue(creationSource, "area"), "area"),
            program: this.readCreation(ownValue(creationSource, "program"), "program"),
            project: this.readCreation(ownValue(creationSource, "project"), "project"),
        };

        // Return the normalized settings shape.
        return {
            presentation: { mode, sort, treeDefaults },
            appearance,
            creation: { idStyle, ...creation },
        };
    }
}
