/**
 * Persisted plugin settings for graph presentation and container creation.
 */

import { CONFIG } from "../constants";
import { IdStyleCatalog, type IdStyle } from "../containers/file-name";
import type { CommitmentLevel } from "../graph/types";
import { ownValue } from "../helpers/utils";


/** How the graph content is presented. */
export type PresentationMode = "json" | "tree";


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


/** Presentation settings stored in the plugin data file. */
export interface PresentationSettings {
    /** Shape used to present the graph. */
    readonly mode: PresentationMode;
}


/** Settings stored in the plugin data file. */
export interface CommitmentSettings {
    /** Graph presentation settings. */
    readonly presentation: PresentationSettings;

    /** Container creation settings. */
    readonly creation: CommitmentCreationSettings;
}


/** Reads and normalizes the supported settings from persisted plugin data. */
export class SettingsReader {
    /** Supported identifier styles used to gate the persisted value. */
    private readonly styles: IdStyleCatalog = new IdStyleCatalog();

    /** Return whether a value is a supported presentation mode. */
    private isPresentationMode(value: unknown): value is PresentationMode {
        // Require exact text that names an own supported mode.
        return typeof value === "string"
            && Object.prototype.hasOwnProperty.call(CONFIG.PRESENTATION_MODES, value);
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
        // Read the nested presentation mode without trusting its shape.
        const nested: unknown = ownValue(ownValue(data, "presentation"), "mode");

        // Fall back on the configured default presentation mode.
        const mode: PresentationMode = this.isPresentationMode(nested)
            ? nested
            : CONFIG.DEFAULT_SETTINGS.presentation.mode;

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
            presentation: { mode },
            creation: { idStyle, ...creation },
        };
    }
}
