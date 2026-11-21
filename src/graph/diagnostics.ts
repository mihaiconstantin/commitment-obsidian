/**
 * Diagnostic construction shared by graph construction and snapshot checks.
 */

import type { Diagnostic } from "./types";


/** Build one diagnostic with the graph's optional count fields. */
export function createDiagnostic(
    code: string,
    message: string,
    paths: readonly string[] = [],
    actual?: number,
    required?: number,
): Diagnostic {
    // Include counts only when the caller supplies both of them.
    if (actual === undefined || required === undefined) {
        // Return the finding without count fields.
        return { code, message, paths };
    }

    // Return the finding with its observed and required counts.
    return { code, message, paths, actual, required };
}
