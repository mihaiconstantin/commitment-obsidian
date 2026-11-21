/**
 * Diagnostic construction helpers.
 */

import type { Diagnostic, DiagnosticCode } from "../graph/types";


/** Build one diagnostic with its source paths. */
export function createDiagnostic(
    code: DiagnosticCode,
    message: string,
    paths: readonly string[],
): Diagnostic {
    // Return the complete finding.
    return { code, message, paths };
}
