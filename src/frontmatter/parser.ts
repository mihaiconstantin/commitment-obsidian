/**
 * Parse saved Markdown frontmatter with a pinned browser-compatible YAML
 * library and the reviewed scalar contract.
 */

import { getFrontMatterInfo, type FrontMatterInfo } from "obsidian";
import { Document, parseDocument, type Node } from "yaml";

import { createFailure } from "../plugin-failure";
import { createScalarTags, type YamlVersion } from "./scalar-tags";
import { assertCanonicalTagsResolved } from "./tag-check";


/** YAML version used for every bounded frontmatter block. */
const YAML_VERSION: YamlVersion = "1.2";


/** Parse one saved file's frontmatter into own mapping entries. */
export function parseFrontmatter(
    path: string,
    text: string,
): ReadonlyMap<string, unknown> {
    // Read the documented frontmatter boundaries for the saved text.
    const info: FrontMatterInfo = getFrontMatterInfo(text);

    // Treat a file without a frontmatter block as an empty mapping.
    if (!info.exists) {
        // Reject an opening delimiter that Obsidian did not recognize as closed.
        if (hasOpeningDelimiter(text)) {
            // Report the unterminated block with its source path.
            throw parseFailure(path, "unterminated frontmatter block");
        }

        // Return the empty mapping.
        return new Map<string, unknown>();
    }

    // Read the YAML text between the documented content offsets.
    const yamlText: string = text.slice(info.from, info.to);

    // Parse the single frontmatter document with the reviewed settings.
    return parseMappedDocument(path, yamlText);
}


/** Return whether the saved text starts with a frontmatter opening delimiter. */
function hasOpeningDelimiter(text: string): boolean {
    // Read the first line without its terminator.
    const firstLine: string = firstLineOf(text);

    // Recognize the delimiter only on the first line.
    return firstLine === "---";
}


/** Return the first line of the text without its terminator. */
function firstLineOf(text: string): string {
    // Split at the first newline and remove a trailing carriage return.
    const end: number = text.indexOf("\n");
    const line: string = end === -1 ? text : text.slice(0, end);
    return line.endsWith("\r") ? line.slice(0, -1) : line;
}


/** Parse one YAML document into a canonical frontmatter mapping. */
function parseMappedDocument(
    path: string,
    yamlText: string,
): ReadonlyMap<string, unknown> {
    // Reject a YAML directive that bounded frontmatter cannot honor.
    rejectYamlDirective(path, yamlText);

    // Parse the document with the reviewed options and scalar tags.
    const document: Document = parseDocument(yamlText, {
        version: YAML_VERSION,
        strict: true,
        uniqueKeys: true,
        stringKeys: false,
        merge: true,
        logLevel: "silent",
        customTags: createScalarTags(YAML_VERSION),
    });

    // Reject every parse or duplicate-key error with its source path.
    if (document.errors.length > 0) {
        // Report the first parser error.
        throw parseFailure(path, document.errors[0]?.message ?? "invalid YAML");
    }

    // Reject unresolved tags on effective canonical fields.
    if (document.contents !== null) {
        try {
            // Inspect the mapping for tagged canonical values.
            assertCanonicalTagsResolved(
                document,
                document.contents as Node,
            );
        } catch (error) {
            // Report the tagged canonical field with its source path.
            throw parseFailure(
                path,
                error instanceof Error ? error.message : "unresolved canonical tag",
            );
        }
    }

    // Convert to own mapping entries in a prototype-safe Map.
    let values: unknown;
    try {
        // Convert the parsed document once.
        values = convertDocument(document);
    } catch (error) {
        // Report the path-scoped conversion failure.
        throw parseFailure(
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
        throw parseFailure(path, "frontmatter must be a mapping");
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


/** Convert the parsed document without losing big integer precision. */
function convertDocument(document: Document): unknown {
    // Convert with map semantics and the reviewed alias policy.
    const converted: unknown = document.toJS({
        mapAsMap: true,
        maxAliasCount: -1,
    });

    // Return the converted value.
    return converted;
}


/**
 * Reject a YAML directive inside one bounded frontmatter block.
 *
 * Obsidian ends the block at the next `---` line and a YAML directive requires
 * a document-start line after it, so a directive cannot appear inside a
 * bounded frontmatter block. The Python parser fails on the same blocks.
 */
function rejectYamlDirective(path: string, yamlText: string): void {
    // Read the first content line without its terminator.
    const first: string = (yamlText.split("\n")[0] ?? "").replace(/\r$/, "").trim();

    // Report a directive that cannot be honored inside bounded frontmatter.
    if (first.startsWith("%")) {
        // Reject the unsupported directive with its source path.
        throw parseFailure(
            path,
            "YAML directives cannot appear inside frontmatter",
        );
    }
}


/** Build one path-scoped parse failure. */
function parseFailure(path: string, reason: string): Error {
    // Render a readable message that names the source path.
    const message: string = `Could not parse frontmatter in '${path}': ${reason}`;

    // Return the structured failure for the affected source.
    return createFailure("parse_error", message, [
        {
            code: "parse_error",
            message: reason,
            paths: [path],
        },
    ]);
}
