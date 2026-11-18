/**
 * Ordering helper shared by graph diagnostics and JSON projection.
 *
 * JavaScript's default string comparison uses UTF-16 code units. The Python
 * graph orders identifiers by Unicode code point, so compare explicitly.
 */

/** Compare two strings by Unicode code point. */
export function compareCodePoints(left: string, right: string): number {
    // Walk both strings by code point without allocating intermediate arrays.
    let leftIndex: number = 0;
    let rightIndex: number = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
        // Read the code point value of each side.
        const leftCode: number = left.codePointAt(leftIndex) ?? 0;
        const rightCode: number = right.codePointAt(rightIndex) ?? 0;

        // Return the first differing position.
        if (leftCode !== rightCode) {
            // Report the code point difference.
            return leftCode - rightCode;
        }

        // Advance past the compared code point.
        leftIndex += leftCode > 0xffff ? 2 : 1;
        rightIndex += rightCode > 0xffff ? 2 : 1;
    }

    // Order a prefix before its longer extension.
    return left.length - leftIndex - (right.length - rightIndex);
}
