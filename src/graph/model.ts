/**
 * Internal read-only data shapes shared by graph construction and diagnostics.
 *
 * These types describe one normalized graph pass. They stay separate from the
 * public graph snapshot so diagnostic checks can inspect the same data without
 * depending on the builder implementation.
 */

import type { ProjectState } from "./project-state";
import type { CommitmentKind, CommitmentLevel } from "./types";


/** One grouped container with its source path and identifier. */
export interface IdentifiedEntry {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated identifier for its concept level. */
    readonly id: string;
}


/** One grouped area container. */
export interface AreaEntry extends IdentifiedEntry {
    /** Explicit area relevance, or null when absent or invalid. */
    readonly active: boolean | null;

    /** Whether the area declared an active field. */
    readonly activePresent: boolean;
}


/** One grouped program container. */
export interface ProgramEntry extends IdentifiedEntry {
    /** Required program area. */
    readonly area: string;

    /** Recognized program state, or null when absent or invalid. */
    readonly state: ProjectState | null;

    /** Whether the program declared a state field. */
    readonly statePresent: boolean;
}


/** One grouped project container. */
export interface ProjectEntry extends IdentifiedEntry {
    /** Required project area. */
    readonly area: string;

    /** Optional project program. */
    readonly program: string | null;

    /** Recognized project state, or null when absent or invalid. */
    readonly state: ProjectState | null;

    /** Whether the project declared a state field. */
    readonly statePresent: boolean;
}


/** One recognized support association derived from canonical fields. */
export interface SupportAssociation {
    /** Concept level of the anchored identifier. */
    readonly level: CommitmentLevel;

    /** Exact anchored identifier text. */
    readonly identifier: string;
}


/** One support container with its optional association and state. */
export interface SupportEntry {
    /** Root-relative source path. */
    readonly path: string;

    /** Canonical support kind. */
    readonly kind: CommitmentKind;

    /** Valid association, or null when level or anchor is unusable. */
    readonly association: SupportAssociation | null;

    /** Recognized task state, or null when absent or invalid. */
    readonly state: ProjectState | null;

    /** Whether the support container declared a state field. */
    readonly statePresent: boolean;
}


/** One duplicated container identifier and every distinct source path. */
export interface DuplicateContainers {
    /** Duplicated concept level. */
    readonly level: CommitmentLevel;

    /** Duplicated identifier text. */
    readonly identifier: string;

    /** Distinct source paths in code-unit order. */
    readonly paths: readonly string[];
}


/** Local data produced by one normalization scan. */
export interface NormalizedInputs {
    /** Area containers grouped by identifier. */
    readonly areas: Map<string, AreaEntry[]>;

    /** Program containers grouped by identifier. */
    readonly programs: Map<string, ProgramEntry[]>;

    /** Project containers grouped by identifier. */
    readonly projects: Map<string, ProjectEntry[]>;

    /** Project references grouped by program and declaring area. */
    readonly programProjects: Map<string, Map<string, ProjectEntry[]>>;

    /** Every established area identifier. */
    readonly areaIds: Set<string>;

    /** Every support container in source path order. */
    readonly supports: readonly SupportEntry[];

    /** First duplicate representation, or null when every container is unique. */
    readonly duplicate: DuplicateContainers | null;
}


/** One validated program with its area, state, and coordinated projects. */
export interface ResolvedProgram {
    /** Validated program identifier. */
    readonly id: string;

    /** Validated program area. */
    readonly area: string;

    /** Recognized program state, or null when absent or invalid. */
    readonly state: ProjectState | null;

    /** Coordinated project identifiers in declaration order. */
    readonly projects: readonly string[];

    /** Program container source path, or null when derived from projects. */
    readonly containerPath: string | null;

    /** Distinct source paths that define the program. */
    readonly paths: readonly string[];
}
