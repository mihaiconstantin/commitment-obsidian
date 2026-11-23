/**
 * Shared plain value types for the commitment graph plugin.
 *
 * These are data shapes only. The graph snapshot class, the vault store, and
 * the presenter own the behavior that produces and consumes them.
 */

import type { ProjectState } from "./project-state";


/** Canonical container kinds recognized by the graph. */
export type CommitmentKind = "area" | "program" | "project" | "meeting" | "note" | "task" | "board";


/** Concept levels that identify an area, program, or project instance. */
export type CommitmentLevel = "area" | "program" | "project";


/** One area, program, or project row that offers a file action. */
export interface ContainerIdentity {
    /** Concept level of the row. */
    readonly kind: CommitmentLevel;

    /** Exact identifier text for the row. */
    readonly id: string;

    /** Owning area identifier. Area rows use their own identifier. */
    readonly area: string;

    /** Enclosing program identifier for a project row, or no program. */
    readonly program: string | null;
}


/** One program with its state and coordinated project identifiers. */
export interface GraphProgram {
    /** Exact program identifier text. */
    readonly id: string;

    /** Recognized program state, or null when absent or invalid. */
    readonly state: ProjectState | null;

    /** Sorted project identifiers coordinated by the program. */
    readonly projects: readonly string[];
}


/** One area with its direct projects, programs, relevance, and project states. */
export interface GraphArea {
    /** Exact area identifier text. */
    readonly id: string;

    /** Explicit area relevance, or null when no valid area container declares it. */
    readonly active: boolean | null;

    /** Sorted identifiers of projects not coordinated by a program. */
    readonly projects: readonly string[];

    /** Programs under the area in identifier order. */
    readonly programs: readonly GraphProgram[];

    /** Recognized project states in this area, keyed by project identifier. */
    readonly projectStates: ReadonlyMap<string, ProjectState>;
}


/** One saved file with its parsed frontmatter mapping. */
export interface CanonicalInput {
    /** Root-relative vault path. */
    readonly path: string;

    /** Parsed frontmatter as own entries. */
    readonly frontmatter: ReadonlyMap<string, unknown>;
}
