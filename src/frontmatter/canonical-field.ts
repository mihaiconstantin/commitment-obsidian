/**
 * Canonical frontmatter field names.
 *
 * Typing the fields in one union lets graph reading and any future consumer
 * agree on the exact names that drive canonical recognition.
 */


/** Field names that drive canonical recognition or graph relationships. */
export type CanonicalField = "type" | "id" | "area" | "program" | "level" | "anchor";
