/**
 * Warning diagnostics and readable error text for command handlers.
 */

import type { Diagnostic } from "./graph/types";


/** Build one diagnostic value. */
export function createDiagnostic(
    code: string,
    message: string,
    paths: readonly string[] = [],
    actual?: number,
    required?: number,
): Diagnostic {
    // Include counts only when the caller supplies them.
    if (actual === undefined || required === undefined) {
        // Return the finding without count fields.
        return { code, message, paths };
    }

    // Return the finding with its observed and required counts.
    return { code, message, paths, actual, required };
}


/** Read a short message from any thrown value. */
export function describeFailure(error: unknown): string {
    // Prefer the error message and fall back to the plain value text.
    return error instanceof Error ? error.message : String(error);
}
