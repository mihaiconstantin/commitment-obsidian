/**
 * Parse saved Markdown frontmatter with a pinned browser-compatible YAML
 * library and its default YAML 1.2 schema.
 */

import { getFrontMatterInfo, type FrontMatterInfo } from "obsidian";
import { parseDocument, type Document } from "yaml";

import { firstLineOf } from "../helpers/strings";


/** Parse saved Markdown frontmatter into own mapping entries. */
export class FrontmatterParser {
    /** Return whether the saved text starts with a frontmatter opening delimiter. */
    private hasOpeningDelimiter(text: string): boolean {
        // Read the first line without its terminator.
        const firstLine: string = firstLineOf(text);

        // Recognize the delimiter only on the first line.
        return firstLine === "---";
    }

    /** Parse one YAML document into a canonical frontmatter mapping. */
    private parseMappedDocument(
        path: string,
        yamlText: string,
    ): ReadonlyMap<string, unknown> {
        // Parse the document with the reviewed structural options.
        const document: Document = parseDocument(yamlText, {
            version: "1.2",
            strict: true,
            uniqueKeys: true,
            stringKeys: false,
            merge: true,
            logLevel: "silent",
        });

        // Reject every parse or duplicate-key error with its source path.
        if (document.errors.length > 0) {
            // Report the first parser error.
            throw this.failure(path, document.errors[0]?.message ?? "invalid YAML");
        }

        // Convert to own mapping entries in a prototype-safe Map.
        let values: unknown;
        try {
            // Convert the parsed document with the default alias limit.
            values = document.toJS({ mapAsMap: true });
        } catch (error) {
            // Report the path-scoped conversion failure.
            throw this.failure(
                path,
                error instanceof Error ? error.message : "frontmatter conversion failed",
            );
        }

        // Treat an empty or explicit null document as an empty mapping.
        if (values === null) {
            // Return the empty mapping.
            return new Map<string, unknown>();
        }

        // Reject a document root that is not a mapping.
        if (!(values instanceof Map)) {
            // Report the unsupported root shape.
            throw this.failure(path, "frontmatter must be a mapping");
        }

        // Retain text keys only; other key shapes cannot name canonical fields.
        const mapping: Map<string, unknown> = new Map<string, unknown>();
        for (const [key, value] of values) {
            // Skip a key that is not exact text, as canonical recognition ignores it.
            if (typeof key !== "string") {
                // Continue with the next entry.
                continue;
            }

            // Retain the key and decoded value.
            mapping.set(key, value);
        }

        // Return the canonical mapping.
        return mapping;
    }

    /** Build one path-scoped parse failure. */
    private failure(path: string, reason: string): Error {
        // Render a readable message that names the source path.
        const message: string = `Could not parse frontmatter in '${path}': ${reason}`;

        // Return the path-scoped parse failure.
        return new Error(message);
    }

    /** Parse one saved file's frontmatter into own mapping entries. */
    public parse(path: string, text: string): ReadonlyMap<string, unknown> {
        // Read the documented frontmatter boundaries for the saved text.
        const info: FrontMatterInfo = getFrontMatterInfo(text);

        // Treat a file without a frontmatter block as an empty mapping.
        if (!info.exists) {
            // Reject an opening delimiter that Obsidian did not recognize as closed.
            if (this.hasOpeningDelimiter(text)) {
                // Report the unterminated block with its source path.
                throw this.failure(path, "unterminated frontmatter block");
            }

            // Return the empty mapping.
            return new Map<string, unknown>();
        }

        // Read the YAML text between the documented content offsets.
        const yamlText: string = text.slice(info.from, info.to);

        // Parse the single frontmatter document with the reviewed settings.
        return this.parseMappedDocument(path, yamlText);
    }
}
