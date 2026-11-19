/**
 * Persisted plugin settings for graph presentation and container creation.
 *
 * The data file stores only the current nested shape. Reading accepts the
 * legacy top-level presentation mode so existing installations keep working.
 */

import {
    DEFAULT_ID_STYLE,
    DEFAULT_PATTERNS,
    isIdStyle,
    type IdStyle,
} from "../containers/file-name";
import type { CommitmentLevel } from "../graph/types";


/** How the graph content is presented. */
export type PresentationMode = "json" | "html";


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


/** Empty creation settings for one kind. */
function emptyCreation(kind: CommitmentLevel): ContainerCreationSettings {
    // Default the pattern to the name earlier releases wrote.
    return { templatePath: "", folderPath: "", pattern: DEFAULT_PATTERNS[kind] };
}


/** Settings used before the data file supplies any. */
export const DEFAULT_SETTINGS: CommitmentSettings = {
    presentation: { mode: "json" },
    creation: {
        idStyle: DEFAULT_ID_STYLE,
        area: emptyCreation("area"),
        program: emptyCreation("program"),
        project: emptyCreation("project"),
    },
};


/** Return whether a value is a supported presentation mode. */
export function isPresentationMode(value: unknown): value is PresentationMode {
    // Accept only the two supported presentations.
    return value === "json" || value === "html";
}


/** Return one own property from an unknown object. */
function ownValue(value: unknown, key: string): unknown {
    // Require an object before reading a property.
    if (typeof value !== "object" || value === null) {
        // Report no usable property.
        return undefined;
    }

    // Read only own properties, never the prototype chain.
    return Object.prototype.hasOwnProperty.call(value, key)
        ? (value as Record<string, unknown>)[key]
        : undefined;
}


/** Return a vault-relative setting path, or empty when it is unsafe. */
function readVaultPath(value: unknown): string {
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
function readPattern(value: unknown, kind: CommitmentLevel): string {
    // Require exact text with visible content.
    if (typeof value !== "string" || value.trim() === "") {
        // Return the kind's default pattern.
        return DEFAULT_PATTERNS[kind];
    }

    // Keep the pattern text as stored.
    return value;
}


/** Read one kind's creation settings, ignoring malformed values. */
function readCreation(value: unknown, kind: CommitmentLevel): ContainerCreationSettings {
    // Read the template and folder paths without trusting their shape.
    const templatePath: string = readVaultPath(ownValue(value, "templatePath"));
    const folderPath: string = readVaultPath(ownValue(value, "folderPath"));

    // Read the basename pattern, defaulting a malformed or empty value.
    const pattern: string = readPattern(ownValue(value, "pattern"), kind);

    // Return the normalized triple.
    return { templatePath, folderPath, pattern };
}


/** Read the supported settings from unvalidated plugin data. */
export function readCommitmentSettings(data: unknown): CommitmentSettings {
    // Read the nested presentation mode when it is valid.
    const nested: unknown = ownValue(ownValue(data, "presentation"), "mode");

    // Read the legacy top-level presentation mode for existing installations.
    const legacy: unknown = ownValue(data, "mode");

    // Prefer the nested mode, then the legacy mode, then the default.
    const mode: PresentationMode = isPresentationMode(nested)
        ? nested
        : isPresentationMode(legacy)
            ? legacy
            : "json";

    // Read each known creation kind and ignore unknown kind keys.
    const creationSource: unknown = ownValue(data, "creation");

    // Read the global style, falling back on an unknown value.
    const storedStyle: unknown = ownValue(creationSource, "idStyle");
    const idStyle: IdStyle = isIdStyle(storedStyle) ? storedStyle : DEFAULT_ID_STYLE;

    // Read each kind with its own default pattern.
    const creation: Record<CommitmentLevel, ContainerCreationSettings> = {
        area: readCreation(ownValue(creationSource, "area"), "area"),
        program: readCreation(ownValue(creationSource, "program"), "program"),
        project: readCreation(ownValue(creationSource, "project"), "project"),
    };

    // Return the normalized settings shape.
    return {
        presentation: { mode },
        creation: { idStyle, ...creation },
    };
}
