/**
 * Immutable commitment graph snapshot with structured access and JSON output.
 *
 * Construction and nonblocking diagnostics live in `GraphBuilder`; this class
 * owns only the finished snapshot.
 */

import type { CommitmentLevel, GraphArea } from "./types";


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

    /** Explicit container source paths by concept level and identifier. */
    private readonly containerPaths: Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>>;

    /** Construct the graph from prepared snapshots. */
    public constructor(areas: readonly GraphArea[], containerPaths: Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>>) {
        // Store the prepared snapshot and source index.
        this.areas = areas;
        this.containerPaths = containerPaths;
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

    /**
     * Serialize one ordered area list as the direct projection.
     *
     * The stored canonical order is the default.
     */
    public toJson(areas: readonly GraphArea[] = this.areas): string {
        // Use a null prototype so `__proto__` remains an ordinary area key.
        const projection: Record<string, ProjectedArea> = Object.create(null);

        // Add every area in order.
        for (const area of areas) {
            // Use a null prototype so `__proto__` remains an ordinary program key.
            const programs: Record<string, ProjectedProgram> = Object.create(null);

            // Add every program in order.
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
