/**
 * Derive the file name and vault path for one container.
 *
 * The identity stays exact in frontmatter. Only the file name is sanitized,
 * because the vault path cannot contain separators or Windows-illegal text.
 */

import { CONFIG } from "../constants";
import type { ContainerIdentity } from "../graph/types";
import { IdStyleCatalog, type IdStyle } from "./file-name";


/** Characters that a file name cannot carry on every supported platform. */
const UNSAFE_NAME_CHARACTERS: RegExp = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;


/** Build file names and vault paths from one folder, pattern, and style. */
export class ContainerPathBuilder {
    /** Configured folder, or empty for the vault root. */
    private readonly folder: string;

    /** Configured basename pattern, or empty for the kind's default. */
    private readonly pattern: string;

    /** Identifier style applied inside the pattern. */
    private readonly style: IdStyle;

    /** Supported identifier styles used to render the placeholder. */
    private readonly styles: IdStyleCatalog = new IdStyleCatalog();

    /** Normalize the configured folder separators and edges. */
    private normalizeFolder(): string {
        // Replace Windows separators, split segments, drop empty ones, and rejoin.
        return this.folder
            .trim()
            .replace(/\\/g, "/")
            .split("/")
            .filter((segment: string): boolean => segment !== "")
            .join("/");
    }

    /** Construct a builder for one folder, pattern, and identifier style. */
    public constructor(folder: string = "", pattern: string = "", style: IdStyle = CONFIG.DEFAULT_ID_STYLE) {
        // Store the folder, pattern, and identifier style used by every call.
        this.folder = folder;
        this.pattern = pattern;
        this.style = style;
    }

    /** Return the identifier text as a portable file name segment. */
    public sanitize(id: string): string {
        // Replace separators, illegal characters, and control characters.
        const replaced: string = id.replace(UNSAFE_NAME_CHARACTERS, "-");

        // Collapse every run of replacement dashes.
        const collapsed: string = replaced.replace(/-+/g, "-");

        // Trim trailing dots and spaces that some file systems drop.
        return collapsed.replace(/[. ]+$/g, "");
    }

    /** Return the target file name for one container identity. */
    public fileName(identity: ContainerIdentity): string {
        // Reject an identifier that cannot produce a file name.
        if (this.sanitize(identity.id) === "") {
            // Report the unusable identifier.
            throw new Error(
                `${CONFIG.KIND_LABELS[identity.kind]} \`${identity.id}\` cannot produce a file name.`,
            );
        }

        // Choose the configured pattern, falling back to the kind's default when blank.
        const pattern: string = this.pattern.trim() === ""
            ? CONFIG.DEFAULT_PATTERNS[identity.kind]
            : this.pattern;

        // Render {{id}} with the styled identifier.
        // Use a replacer so an identifier containing `$` stays literal.
        const rendered: string = pattern.replace(
            /\{\{id\}\}/g,
            (): string => this.styles.format(this.style, identity.id),
        );

        // Sanitize the rendered basename so a pattern cannot inject a separator.
        const name: string = this.sanitize(rendered);

        // Reject a pattern that cannot produce a file name.
        if (name === "") {
            // Report the unusable pattern.
            throw new Error(
                `${CONFIG.KIND_LABELS[identity.kind]} pattern \`${this.pattern}\` cannot produce a file name.`,
            );
        }

        // Append the markdown extension to the rendered basename.
        return `${name}.md`;
    }

    /** Return the vault path for one container in the configured folder. */
    public path(identity: ContainerIdentity): string {
        // Derive the file name before joining the folder.
        const name: string = this.fileName(identity);

        // Normalize the configured folder separators and edges.
        const normalized: string = this.normalizeFolder();

        // Use the vault root when the folder is unset.
        if (normalized === "") {
            // Return the root-level file name.
            return name;
        }

        // Join the nested folder and the file name.
        return `${normalized}/${name}`;
    }
}
