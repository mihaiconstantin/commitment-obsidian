/**
 * Generic string helpers shared across the plugin.
 *
 * Text ordering uses JavaScript's default string comparison, which orders by
 * UTF-16 code unit. That is the plugin's stable ordering for paths and
 * identifiers.
 */

/** Split one identifier into title-case words without changing the rest. */
export function titleCase(id: string): string {
    // Split on dashes so each dash becomes one word separator.
    return id
        .split("-")
        .filter((word: string): boolean => word !== "")
        .map((word: string): string => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}


/** Return whether a value is a non-empty exact identifier string. */
export function isValidIdentifier(value: unknown): value is string {
    // Reject non-text, empty, and padded values without normalizing.
    return typeof value === "string" && value !== "" && value === value.trim();
}


/** Return one count with its singular or plural noun. */
export function countLabel(count: number, singular: string): string {
    // Append the regular plural suffix unless the count is one.
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
}


/** Compare text by UTF-16 code unit order. */
export function compareText(left: string, right: string): number {
    // Return the first differing order, or equality for identical text.
    return left < right ? -1 : left > right ? 1 : 0;
}


/** Return the first line of the text without its terminator. */
export function firstLineOf(text: string): string {
    // Split at the first newline and remove a trailing carriage return.
    const end: number = text.indexOf("\n");
    const line: string = end === -1 ? text : text.slice(0, end);
    return line.endsWith("\r") ? line.slice(0, -1) : line;
}
