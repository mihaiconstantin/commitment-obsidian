/**
 * Shared plain value types for the commitment graph plugin.
 *
 * These are data shapes only. The graph snapshot class, the vault store, and
 * the presenter own the behavior that produces and consumes them.
 */


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


/** One nonblocking finding about the graph inputs. */
export interface Diagnostic {
    /** Stable category code for the finding. */
    readonly code: string;

    /** Readable message naming the affected identifiers and paths. */
    readonly message: string;

    /** Root-relative vault paths related to the finding. */
    readonly paths: readonly string[];

    /** Actual observed count when the finding compares counts. */
    readonly actual?: number;

    /** Required count when the finding compares counts. */
    readonly required?: number;
}


/** One program and its coordinated project identifiers. */
export interface GraphProgram {
    /** Exact program identifier text. */
    readonly id: string;

    /** Sorted project identifiers coordinated by the program. */
    readonly projects: readonly string[];
}


/** One area with its direct projects and programs. */
export interface GraphArea {
    /** Exact area identifier text. */
    readonly id: string;

    /** Sorted identifiers of projects not coordinated by a program. */
    readonly projects: readonly string[];

    /** Programs under the area in identifier order. */
    readonly programs: readonly GraphProgram[];
}


/** One saved eligible file and its raw text. */
export interface SourceDocument {
    /** Root-relative vault path. */
    readonly path: string;

    /** Exact saved file text. */
    readonly text: string;
}


/** One saved file with its parsed frontmatter mapping. */
export interface CanonicalInput {
    /** Root-relative vault path. */
    readonly path: string;

    /** Parsed frontmatter as own entries. */
    readonly frontmatter: ReadonlyMap<string, unknown>;
}


/** The eligible saved inputs captured at one moment. */
export interface InputSnapshot {
    /** Every eligible saved file in path order. */
    readonly documents: readonly SourceDocument[];

    /** Parsed frontmatter for every eligible saved file. */
    readonly inputs: readonly CanonicalInput[];
}
