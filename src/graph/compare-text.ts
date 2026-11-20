/**
 * Ordering helper shared by graph diagnostics, discovery, and JSON output.
 *
 * JavaScript's default string comparison orders by UTF-16 code unit. That is
 * the plugin's stable ordering for paths and identifiers.
 */

/** Compare two strings by UTF-16 code unit order. */
export function compareText(left: string, right: string): number {
    // Return the first differing order, or equality for identical text.
    return left < right ? -1 : left > right ? 1 : 0;
}
