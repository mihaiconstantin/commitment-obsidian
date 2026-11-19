/**
 * Derive the file name and vault path for one container.
 *
 * The identity stays exact in frontmatter. Only the file name is sanitized,
 * because the vault path cannot contain separators or Windows-illegal text.
 */

import type { CommitmentLevel, ContainerIdentity } from "../graph/types";


/** File name prefix for each container kind. */
const KIND_PREFIX: Readonly<Record<CommitmentLevel, string>> = {
    area: "Area",
    program: "Program",
    project: "Project",
};


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
export function containerFileName(identity: ContainerIdentity): string {
    // Sanitize the exact identifier.
    const name: string = sanitizeFileName(identity.id);

    // Reject an identifier with no usable file name text.
    if (name === "") {
        // Report the unusable identifier.
        throw new Error(`Container identifier '${identity.id}' has no usable file name.`);
    }

    // Prefix the name with its container kind.
    return `${KIND_PREFIX[identity.kind]} - ${name}.md`;
}


/** Return the vault path for one container in the configured folder. */
export function containerPath(identity: ContainerIdentity, folder: string): string {
    // Derive the file name before joining the folder.
    const name: string = containerFileName(identity);

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
