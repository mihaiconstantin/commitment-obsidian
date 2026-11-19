/**
 * File name patterns and identifier styling for created containers.
 *
 * Pure leaf module: the settings reader, the path builder, and the settings tab
 * all need the same style list, and none of them may drag an Obsidian import
 * into the others.
 */

import type { CommitmentLevel } from "../graph/types";


/** How the identifier text is capitalized inside a file name. */
export type IdStyle = "titleCase" | "none";


/** One supported style with its settings label and text transform. */
export interface IdStyleSpec {
    /** Label shown in the settings dropdown. */
    readonly label: string;

    /** Return the identifier text for the style. */
    readonly format: (id: string) => string;
}


/** Split one identifier into title-case words without changing the rest. */
function titleCase(id: string): string {
    // Split on dashes so each dash becomes one word separator.
    return id
        .split("-")
        .filter((word: string): boolean => word !== "")
        .map((word: string): string => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}


/** Every supported style; adding one costs one entry here and one union member. */
export const ID_STYLES: Readonly<Record<IdStyle, IdStyleSpec>> = {
    titleCase: { label: "Title Case", format: titleCase },
    none: { label: "None", format: (id: string): string => id },
};


/** Style used when the data file stores none. */
export const DEFAULT_ID_STYLE: IdStyle = "none";


/** Default basename pattern per kind; reproduces the names earlier releases wrote. */
export const DEFAULT_PATTERNS: Readonly<Record<CommitmentLevel, string>> = {
    area: "Area - {{id}}",
    program: "Program - {{id}}",
    project: "Project - {{id}}",
};


/** Return whether a value is a supported identifier style. */
export function isIdStyle(value: unknown): value is IdStyle {
    // Require exact text that names an own style entry.
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(ID_STYLES, value);
}
