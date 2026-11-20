/**
 * Canonical input reading for graph construction.
 *
 * Classification validates the fields that drive graph recognition and
 * relationships, so the builder never re-checks a value. This module has no
 * Obsidian, presentation, or file dependency.
 */

import type { CanonicalField } from "../frontmatter/canonical-field";
import { createDiagnostic, createFailure } from "../plugin-failure";
import type {
    CanonicalInput,
    CommitmentKind,
    CommitmentLevel,
    Diagnostic,
} from "./types";


/** One canonical area representation. */
export interface AreaInput {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated area identifier. */
    readonly id: string;
}


/** One canonical program representation. */
export interface ProgramInput {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated program identifier. */
    readonly id: string;

    /** Required program area. */
    readonly area: string;
}


/** One canonical project representation. */
export interface ProjectInput {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated project identifier. */
    readonly id: string;

    /** Required project area. */
    readonly area: string;

    /** Optional project program. */
    readonly program: string | null;
}


/** One pending support anchor awaiting graph membership. */
export interface PendingSupport {
    /** Concept level of the anchored identifier. */
    readonly level: CommitmentLevel;

    /** Exact anchored identifier text. */
    readonly identifier: string;

    /** Root-relative source path. */
    readonly path: string;
}


/** One recognized support association derived from canonical fields. */
interface SupportAssociation {
    /** Concept level of the anchored identifier. */
    readonly level: CommitmentLevel;

    /** Exact anchored identifier text. */
    readonly identifier: string;
}


/** Every structural input read from one canonical document set. */
export interface CanonicalInputs {
    /** Area containers. */
    readonly areas: readonly AreaInput[];

    /** Areas established only by an area-level support anchor. */
    readonly supportAreas: readonly string[];

    /** Program containers. */
    readonly programs: readonly ProgramInput[];

    /** Projects. */
    readonly projects: readonly ProjectInput[];

    /** Support anchors that need the finished membership sets. */
    readonly pendingSupports: readonly PendingSupport[];

    /** Classification findings in source path order, extended by the builder. */
    readonly diagnostics: Diagnostic[];
}


/** Canonical kinds recognized by graph construction. */
const CANONICAL_KINDS: Readonly<Record<string, true>> = {
    area: true,
    program: true,
    project: true,
    meeting: true,
    note: true,
    task: true,
    board: true,
};


/** Recognized support levels. */
const SUPPORT_LEVELS: Readonly<Record<string, true>> = {
    area: true,
    program: true,
    project: true,
};


/** Read one own frontmatter entry as exact text or no value. */
function textField(input: CanonicalInput, field: CanonicalField): string | null {
    // Report no supplied value for an absent field.
    if (!input.frontmatter.has(field)) {
        // Return the absent marker.
        return null;
    }

    // Require exact string text for the supplied value.
    const value: unknown = input.frontmatter.get(field);
    return typeof value === "string" ? value : null;
}


/** Return whether a value is a valid identifier for its concept level. */
function isValidIdentifier(value: unknown): value is string {
    // Reject every non-text value without coercing it.
    if (typeof value !== "string") {
        // Report the unsupported value.
        return false;
    }

    // Reject empty and padded values without normalizing.
    return value !== "" && value === value.trim();
}


/** Throw when an identifier is absent or invalid for a required field. */
function requiredIdentifier(
    input: CanonicalInput,
    field: CanonicalField,
    kind: CommitmentKind,
    code: string,
): string {
    // Reject an absent required field.
    if (!input.frontmatter.has(field)) {
        // Report the missing field with its source path.
        throw createFailure(
            code,
            `Canonical ${kind} container '${input.path}' is missing required field '${field}'.`,
            [createDiagnostic(code, `Missing required field '${field}'.`, [input.path])],
        );
    }

    // Read the supplied value without changing it.
    const value: unknown = input.frontmatter.get(field);

    // Reject a present value that is not a valid identifier.
    if (!isValidIdentifier(value)) {
        // Report the invalid field with its source path.
        throw createFailure(
            code,
            `Canonical ${kind} container '${input.path}' has an invalid '${field}' value.`,
            [createDiagnostic(code, `Invalid '${field}' value.`, [input.path])],
        );
    }

    // Return the validated identifier text.
    return value;
}


/** Return the canonical kind of one input, or null when it is not canonical. */
function canonicalKind(input: CanonicalInput): CommitmentKind | null {
    // Read the exact type value as text.
    const value: string | null = textField(input, "type");

    // Accept only exact supported canonical type values.
    if (value !== null && CANONICAL_KINDS[value] === true) {
        // Return the recognized canonical kind.
        return value as CommitmentKind;
    }

    // Treat every other document as non-canonical.
    return null;
}


/** Read one optional project program value using the canonical rules. */
function optionalProjectProgram(input: CanonicalInput): string | null {
    // Name the canonical relationship field for typed access.
    const field: CanonicalField = "program";

    // Treat an absent program field as no relationship.
    if (!input.frontmatter.has(field)) {
        // Report no relationship.
        return null;
    }

    // Read the present value without changing it.
    const value: unknown = input.frontmatter.get(field);

    // Treat an explicit null value as no relationship.
    if (value === null || value === undefined) {
        // Report no relationship.
        return null;
    }

    // Reject every other value that is not a valid program identifier.
    if (!isValidIdentifier(value)) {
        // Report the invalid optional relationship.
        throw createFailure(
            "invalid_project_program",
            `Canonical project container '${input.path}' has an invalid 'program' value.`,
            [
                createDiagnostic(
                    "invalid_project_program",
                    "Invalid 'program' value.",
                    [input.path],
                ),
            ],
        );
    }

    // Return the validated program identifier.
    return value;
}


/** Read one support association from its exact dependent fields. */
function supportAssociation(input: CanonicalInput): SupportAssociation | null {
    // Read the dependent level and anchor fields as exact text.
    const level: string | null = textField(input, "level");
    const anchor: string | null = textField(input, "anchor");

    // Reject a missing or malformed level or anchor.
    if (level === null || anchor === null || SUPPORT_LEVELS[level] !== true) {
        // Report no usable association.
        return null;
    }

    // Reject an invalid anchored identifier.
    if (!isValidIdentifier(anchor)) {
        // Report no usable association.
        return null;
    }

    // Return the recognized support association.
    return { level: level as CommitmentLevel, identifier: anchor };
}


/** Classify one canonical document set into structural graph inputs. */
export class CanonicalInputReader {
    /** Area containers. */
    private readonly areas: AreaInput[] = [];

    /** Areas established only by an area-level support anchor. */
    private readonly supportAreas: string[] = [];

    /** Program containers. */
    private readonly programs: ProgramInput[] = [];

    /** Projects. */
    private readonly projects: ProjectInput[] = [];

    /** Support anchors that need the finished membership sets. */
    private readonly pendingSupports: PendingSupport[] = [];

    /** Classification findings. */
    private readonly diagnostics: Diagnostic[] = [];

    /** Read one input list, which must already be in path order. */
    static read(inputs: readonly CanonicalInput[]): CanonicalInputs {
        // Classify every input in the supplied order.
        return new CanonicalInputReader().classify(inputs);
    }

    /** Classify each input and collect the structural ones. */
    private classify(inputs: readonly CanonicalInput[]): CanonicalInputs {
        // Classify each input for graph construction.
        for (const input of inputs) {
            // Read the canonical kind and skip non-canonical documents.
            const kind: CommitmentKind | null = canonicalKind(input);
            if (kind === null) {
                // Continue with the next input.
                continue;
            }

            // Collect a canonical area container's required identity.
            if (kind === "area") {
                // Require a valid typed area identifier.
                this.areas.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_area_identity"),
                });
                continue;
            }

            // Collect a canonical program container's required identity and area.
            if (kind === "program") {
                // Require valid program identity and area references.
                this.programs.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_program_identity"),
                    area: requiredIdentifier(input, "area", kind, "missing_program_area"),
                });
                continue;
            }

            // Collect a canonical project's identity, area, and optional program.
            if (kind === "project") {
                // Require valid project identity and area references.
                this.projects.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_project_identity"),
                    area: requiredIdentifier(input, "area", kind, "missing_project_area"),
                    program: optionalProjectProgram(input),
                });
                continue;
            }

            // Read the support association from its dependent fields.
            const association: SupportAssociation | null = supportAssociation(input);

            // Diagnose a support container with no usable canonical anchor.
            if (association === null) {
                // Report the unresolved input without inventing a target.
                this.diagnostics.push(
                    createDiagnostic(
                        "unresolved_anchor",
                        `Canonical ${kind} container '${input.path}' has no usable canonical anchor; it is omitted from the commitment graph.`,
                        [input.path],
                    ),
                );
                continue;
            }

            // Establish an explicit area-level support anchor directly.
            if (association.level === "area") {
                // Add the referenced area without inventing a graph node.
                this.supportAreas.push(association.identifier);
                continue;
            }

            // Defer project and program targets until the graph exists.
            this.pendingSupports.push({
                level: association.level,
                identifier: association.identifier,
                path: input.path,
            });
        }

        // Return the collected structural inputs and findings.
        return {
            areas: this.areas,
            supportAreas: this.supportAreas,
            programs: this.programs,
            projects: this.projects,
            pendingSupports: this.pendingSupports,
            diagnostics: this.diagnostics,
        };
    }
}
