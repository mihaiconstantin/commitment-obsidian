/**
 * Compose one new container document from a template and its identity.
 *
 * Placeholders are replaced across the whole template before the identity
 * override. YAML parsing keeps unrelated keys, comments, and key order.
 */

import { isMap, parseDocument, type Document } from "yaml";

import type { ContainerIdentity } from "../graph/types";


/** Format one moment token sequence for the current moment. */
export type MomentFormatter = (format: string) => string;


/** One template split into its optional YAML and its body. */
interface TemplateParts {
    /** Frontmatter YAML without the delimiters, or no frontmatter. */
    readonly yaml: string | null;

    /** Body text after the frontmatter delimiter. */
    readonly body: string;
}


/** Substitute the supported placeholders across the whole template. */
function substitutePlaceholders(text: string, identity: ContainerIdentity, format: MomentFormatter): string {
    // Replace title and the two formatter placeholders, leaving other braces alone.
    return text.replace(
        /{{title}}|{{(date|time)(?::([^{}]*))?}}/g,
        (match: string, kind: string | undefined, pattern: string | undefined): string => {
            // Use the exact identifier for the title placeholder.
            if (match === "{{title}}") {
                // Return the identifier without normalization.
                return identity.id;
            }

            // Use the default date or time pattern when none is supplied.
            const selected: string = pattern === undefined
                ? (kind === "date" ? "YYYY-MM-DD" : "HH:mm")
                : pattern;

            // Format the selected moment pattern.
            return format(selected);
        },
    );
}


/** Split one normalized template into frontmatter YAML and body text. */
function splitTemplate(text: string): TemplateParts {
    // Treat text without a first-line delimiter as a body-only template.
    if (!text.startsWith("---\n")) {
        // Return the whole text as the body.
        return { yaml: null, body: text };
    }

    // Match the opening and closing delimiters with an optional YAML block.
    const match: RegExpExecArray | null = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/.exec(text);

    // Reject an opening delimiter that has no closing delimiter.
    if (match === null) {
        // Report the unterminated block.
        throw new Error("unterminated frontmatter block");
    }

    // Return the YAML block and the remaining body text.
    return {
        yaml: match[1] ?? "",
        body: text.slice(match[0].length),
    };
}


/** Parse one template's frontmatter into a mutable YAML document. */
function parseTemplateDocument(yamlText: string): Document {
    // Parse the bounded block with duplicate-key rejection.
    const document: Document = parseDocument(yamlText, {
        version: "1.2",
        strict: true,
        uniqueKeys: true,
        logLevel: "silent",
    });

    // Reject every parse or duplicate-key error.
    if (document.errors.length > 0) {
        // Report the first parser error.
        throw new Error(document.errors[0]?.message ?? "invalid YAML");
    }

    // Require a mapping root or an empty document.
    if (document.contents !== null && !isMap(document.contents)) {
        // Report the unsupported root shape.
        throw new Error("frontmatter must be a mapping");
    }

    // Return the parsed document for the identity override.
    return document;
}


/** Apply the plugin-owned identity fields to one parsed document. */
function applyIdentity(document: Document, identity: ContainerIdentity): void {
    // Override the plugin-owned identity fields.
    document.set("type", identity.kind);
    document.set("id", identity.id);

    // Keep an owning area only for the kinds that have one; an area owns itself.
    if (identity.kind !== "area") {
        // Set the enclosing area.
        document.set("area", identity.area);
    } else if (document.has("area")) {
        // Delete the field an area must not carry.
        document.delete("area");
    }

    // Keep a project program only when the row has one; drop stale template text.
    if (identity.kind === "project" && identity.program !== null) {
        // Set the enclosing program.
        document.set("program", identity.program);
    } else if (document.has("program")) {
        // Delete the stale program field.
        document.delete("program");
    }

    // Read the template state without treating an empty value as a state.
    const state: unknown = document.get("state");

    // Default the state only for the kinds that require one.
    if (identity.kind !== "area" && (state === undefined || state === null || state === "")) {
        // Mark the new program or project active.
        document.set("state", "active");
    }

    // Require a canonical area active flag.
    if (identity.kind === "area") {
        // Read the template active value.
        const active: unknown = document.get("active");

        // Default the flag when the template provides no value.
        if (active === undefined || active === null || active === "") {
            // Mark the new area active.
            document.set("active", true);
        }
    }
}


/** Compose one container document from template text and its identity. */
export function composeContainerDocument(
    templateText: string,
    identity: ContainerIdentity,
    format: MomentFormatter,
): string {
    // Normalize line endings before any text handling.
    const normalized: string = templateText.replace(/\r\n?/g, "\n");

    // Substitute the supported placeholders across the whole template.
    const substituted: string = substitutePlaceholders(normalized, identity, format);

    // Split the frontmatter from the body.
    const parts: TemplateParts = splitTemplate(substituted);

    // Parse the frontmatter, or start an empty document when there is none.
    const document: Document = parseTemplateDocument(parts.yaml ?? "");

    // Apply the plugin-owned identity fields.
    applyIdentity(document, identity);

    // Emit canonical YAML without folding long scalar values.
    const yamlText: string = document.toString({ lineWidth: 0 }).replace(/\n+$/g, "");

    // Build the canonical frontmatter block.
    const block: string = `---\n${yamlText}\n---`;

    // Normalize the separator blank line and keep the body otherwise verbatim.
    const body: string = parts.body.replace(/^\n+/g, "");

    // Emit the block with a blank line before a non-empty body.
    return body === "" ? `${block}\n` : `${block}\n\n${body}`;
}
