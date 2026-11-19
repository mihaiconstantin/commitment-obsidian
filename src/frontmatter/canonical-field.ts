/**
 * Canonical frontmatter fields shared by graph reading and YAML tag checks.
 *
 * The tag check must inspect exactly the fields that graph construction reads.
 * Typing both sides with one union lets the compiler reject a field known to
 * one side but missing from the other.
 */


/** Field names that drive canonical recognition or graph relationships. */
export type CanonicalField = "type" | "id" | "area" | "program" | "level" | "anchor";


/** Canonical field membership for frontmatter keys. */
const CANONICAL_FIELDS: Readonly<Record<CanonicalField, true>> = {
    type: true,
    id: true,
    area: true,
    program: true,
    level: true,
    anchor: true,
};


/** Return whether a frontmatter key names a canonical field. */
export function isCanonicalField(value: string): value is CanonicalField {
    // Require an own entry so prototype names are not canonical fields.
    return Object.prototype.hasOwnProperty.call(CANONICAL_FIELDS, value);
}
