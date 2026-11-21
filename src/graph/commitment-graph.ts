/**
 * Immutable commitment graph snapshot with structured access and JSON output.
 *
 * Construction lives in `GraphBuilder`; this class owns only the finished
 * snapshot and the pending-support diagnosis that needs membership lookups.
 */

import { createDiagnostic } from "./diagnostics";
import type {
    CommitmentLevel,
    Diagnostic,
    GraphArea,
    PendingSupport,
} from "./types";


/** A graph snapshot and the diagnostics captured with it. */
export interface GraphResult {
    /** Immutable graph snapshot. */
    readonly graph: CommitmentGraph;

    /** Nonblocking findings from the same build moment. */
    readonly diagnostics: readonly Diagnostic[];
}


/** One program in the direct JSON projection. */
interface ProjectedProgram {
    /** Sorted coordinated project identifiers. */
    readonly projects: readonly string[];
}


/** One area in the direct JSON projection. */
interface ProjectedArea {
    /** Sorted direct project identifiers. */
    readonly projects: readonly string[];

    /** Programs keyed by identifier. */
    readonly programs: Record<string, ProjectedProgram>;
}


/** Immutable commitment graph with structured access and JSON projection. */
export class CommitmentGraph {
    /** Sorted area snapshots. */
    private readonly areas: readonly GraphArea[];

    /** Known identifiers by concept level. */
    private readonly members: Readonly<Record<CommitmentLevel, ReadonlySet<string>>>;

    /** Explicit container source paths by concept level and identifier. */
    private readonly containerPaths: Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>>;

    /** Construct the graph from prepared snapshots. */
    public constructor(
        areas: readonly GraphArea[],
        members: Readonly<Record<CommitmentLevel, ReadonlySet<string>>>,
        containerPaths: Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>>,
        pendingSupports: readonly PendingSupport[],
        findings: Diagnostic[],
    ) {
        // Store the prepared snapshot and source index.
        this.areas = areas;
        this.members = members;
        this.containerPaths = containerPaths;

        // Diagnose support anchors whose typed targets are absent from the graph.
        for (const support of pendingSupports) {
            // Require the support target to be a known graph member.
            if (this.contains(support.level, support.identifier)) {
                // Continue when the target already exists in the graph.
                continue;
            }

            // Diagnose the unresolved target without inventing a node.
            findings.push(
                createDiagnostic(
                    "unresolved_anchor",
                    `Support container '${support.path}' anchors to unknown ${support.level} identifier '${support.identifier}'; it is omitted from the commitment graph.`,
                    [support.path],
                ),
            );
        }
    }

    /** Return whether a typed identifier is a member of the graph. */
    public contains(level: CommitmentLevel, identifier: string): boolean {
        // Report membership from the matching concept-level set.
        return this.members[level].has(identifier);
    }

    /** Return the source path of an explicit container, or null when implicit. */
    public getContainerPath(level: CommitmentLevel, identifier: string): string | null {
        // Read the indexed path for the typed identifier.
        return this.containerPaths[level].get(identifier) ?? null;
    }

    /** Return the sorted area snapshots. */
    public getAreas(): readonly GraphArea[] {
        // Return the immutable area list.
        return this.areas;
    }

    /** Serialize the direct projection with four-space indentation. */
    public toJson(): string {
        // Use a null prototype so `__proto__` remains an ordinary area key.
        const projection: Record<string, ProjectedArea> = Object.create(null);
        for (const area of this.areas) {
            // Use a null prototype so `__proto__` remains an ordinary program key.
            const programs: Record<string, ProjectedProgram> = Object.create(null);
            for (const program of area.programs) {
                // Add the program with its sorted project identifiers.
                programs[program.id] = { projects: program.projects };
            }

            // Add the area with its direct projects and programs.
            projection[area.id] = { projects: area.projects, programs };
        }

        // Render the projection with one final newline.
        return JSON.stringify(projection, null, 4) + "\n";
    }
}
