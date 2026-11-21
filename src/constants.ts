/**
 * Application-level configuration for the commitment graph plugin.
 *
 * This module is the single discoverable home for values that describe how the
 * plugin behaves as a whole: its output path, command names, user-facing copy,
 * and default settings. Implementation details stay beside the modules that use
 * them. Typed local constants come first where a value needs its declared type,
 * so the defaults can share the same pattern and style values that `CONFIG`
 * exposes.
 */

import type { IdStyle } from "./containers/file-name";
import type { CommitmentLevel } from "./graph/types";
import type {
    AppearanceSettings,
    CommitmentSettings,
    GraphSort,
    PresentationMode,
} from "./settings/settings";


/** Default basename pattern per kind. */
const defaultPatterns: Readonly<Record<CommitmentLevel, string>> = {
    area: "Area - {{id}}",
    program: "Program - {{id}}",
    project: "Project - {{id}}",
};


/** Style used when the data file stores none. */
const defaultIdStyle: IdStyle = "none";


/** Readable copy for every container kind. */
const kindLabels: Readonly<Record<CommitmentLevel, string>> = {
    area: "Area",
    program: "Program",
    project: "Project",
};


/** Appearance used before the data file supplies any. */
const defaultAppearance: AppearanceSettings = {
    area: "#74a7ff",
    program: "#b6682f"
};


/** Settings used before the data file supplies any. */
const defaultSettings: CommitmentSettings = {
    presentation: { mode: "json", sort: "name" },
    appearance: defaultAppearance,
    creation: {
        idStyle: defaultIdStyle,
        area: { templatePath: "", folderPath: "", pattern: defaultPatterns.area },
        program: { templatePath: "", folderPath: "", pattern: defaultPatterns.program },
        project: { templatePath: "", folderPath: "", pattern: defaultPatterns.project },
    },
};


/** Readable label for every supported presentation mode. */
const presentationModes: Readonly<Record<PresentationMode, string>> = {
    json: "JSON",
    tree: "Tree",
};


/** Readable label for every supported graph sort. */
const graphSorts: Readonly<Record<GraphSort, string>> = {
    name: "A–Z",
    count: "Largest first",
};


/** Every application-level configuration value. */
export const CONFIG = {
    /** Root-relative path of the derived graph output. */
    GRAPH_PATH: "commitment-graph.json",

    /** Directory name whose contents are excluded from discovery. */
    TEMPLATE_DIRECTORY: "Templates",

    /** Command names registered under the `Commitment` plugin name. */
    VIEW_COMMAND: "View graph",
    UPDATE_COMMAND: "Update graph",

    /** Readiness message shown before the workspace has finished loading. */
    NOT_READY_MESSAGE: "Vault is still loading; try again",

    /** Busy message shown when one graph command is already running. */
    BUSY_MESSAGE: "A commitment graph command is already running",

    /** Readable modal title. */
    TITLE: "Commitment Graph",

    /** Labels used by the tree chrome. */
    SEARCH_PLACEHOLDER: "Filter areas, programs, projects",

    /** Style used when the data file stores none. */
    DEFAULT_ID_STYLE: defaultIdStyle,

    /** Default basename pattern per kind. */
    DEFAULT_PATTERNS: defaultPatterns,

    /** Settings used before the data file supplies any. */
    DEFAULT_SETTINGS: defaultSettings,

    /** Readable label for every supported presentation mode. */
    PRESENTATION_MODES: presentationModes,

    /** Readable label for every supported graph sort. */
    GRAPH_SORTS: graphSorts,

    /** Readable copy for every container kind. */
    KIND_LABELS: kindLabels,
} as const;
