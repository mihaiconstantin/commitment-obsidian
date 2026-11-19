/**
 * Derive the file name and vault path for one container.
 *
 * The identity stays exact in frontmatter. Only the file name is sanitized,
 * because the vault path cannot contain separators or Windows-illegal text.
 */

import type { ContainerIdentity } from "../graph/types";
import { DEFAULT_ID_STYLE, DEFAULT_PATTERNS, ID_STYLES, type IdStyle } from "./file-name";


/** Characters that a file name cannot carry on every supported platform. */
const UNSAFE_NAME_CHARACTERS: RegExp = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;


/** Return the identifier text as a portable file name segment. */
export function sanitizeFileName(id: string): string {
    // Replace separators, illegal characters, and control characters.
    const replaced: string = id.replace(UNSAFE_NAME_CHARACTERS, "-");

    // Collapse every run of replacement dashes.
    const collapsed: string = replaced.replace(/-+/g, "-");

    // Trim trailing dots and spaces that some file systems drop.
    return collapsed.replace(/[. ]+$/g, "");
}


/** Return the target file name for one container identity. */
export function containerFileName(
    identity: ContainerIdentity,
    pattern: string = DEFAULT_PATTERNS[identity.kind],
    style: IdStyle = DEFAULT_ID_STYLE,
): string {
    // Reject an identifier with no usable file name text.
    if (sanitizeFileName(identity.id) === "") {
        // Report the unusable identifier.
        throw new Error(`Container identifier '${identity.id}' has no usable file name.`);
    }

    // Render {{id}} with the styled identifier, falling back when the pattern is blank.
    // Use a replacer so an identifier containing `$` stays literal.
    const rendered: string = (pattern.trim() === "" ? DEFAULT_PATTERNS[identity.kind] : pattern)
        .replace(/\{\{id\}\}/g, (): string => ID_STYLES[style].format(identity.id));

    // Sanitize the rendered basename so a pattern cannot inject a separator.
    const name: string = sanitizeFileName(rendered);

    // Reject a pattern that renders no usable name.
    if (name === "") {
        // Report the unusable pattern.
        throw new Error(`Container pattern '${pattern}' has no usable file name.`);
    }

    // Append the markdown extension to the rendered basename.
    return `${name}.md`;
}


/** Return the vault path for one container in the configured folder. */
export function containerPath(
    identity: ContainerIdentity,
    folder: string,
    pattern: string = DEFAULT_PATTERNS[identity.kind],
    style: IdStyle = DEFAULT_ID_STYLE,
): string {
    // Derive the file name before joining the folder.
    const name: string = containerFileName(identity, pattern, style);

    // Normalize the configured folder separators and edges.
    const normalized: string = folder
        .trim()
        .replace(/\\/g, "/")
        .split("/")
        .filter((segment: string): boolean => segment !== "")
        .join("/");

    // Use the vault root when the folder is unset.
    if (normalized === "") {
        // Return the root-level file name.
        return name;
    }

    // Join the nested folder and the file name.
    return `${normalized}/${name}`;
}
