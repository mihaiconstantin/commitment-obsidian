/**
 * Plugin failures carry a stable code and path-scoped diagnostics so command
 * handlers can report actionable errors without a second error hierarchy.
 */

import type { Diagnostic } from "./graph-types";


/** Error value with a stable code and structured findings. */
export interface PluginFailure extends Error {
    /** Stable failure category. */
    readonly code: string;

    /** Findings that describe the failure. */
    readonly diagnostics: readonly Diagnostic[];
}


/** Create one structured plugin failure. */
export function createFailure(
    code: string,
    message: string,
    diagnostics: readonly Diagnostic[] = [],
): PluginFailure {
    // Build the error value and attach the stable category and findings.
    const failure: Error & PluginFailure = Object.assign(
        new Error(message),
        { code, diagnostics },
    );

    // Return the created failure.
    return failure;
}


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


/** Return whether a value is a structured plugin failure. */
export function isPluginFailure(error: unknown): error is PluginFailure {
    // Require an error value carrying the stable category and diagnostics.
    return (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        "diagnostics" in error &&
        Array.isArray(error.diagnostics)
    );
}
