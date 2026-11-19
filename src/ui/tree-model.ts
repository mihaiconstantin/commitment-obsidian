/**
 * Pure data model and presentation helpers for the interactive graph tree.
 *
 * Everything here is a function of its arguments plus, for the remembered sort
 * order, `localStorage`. No element is created and no listener is registered,
 * so the rendering class stays focused on the DOM.
 */

import type { CommitmentLevel, ContainerIdentity, GraphArea, GraphProgram } from "../graph/types";


/** Storage key for the remembered sort order. */
const SORT_STORAGE_KEY: "commitment-graph-tree-sort" = "commitment-graph-tree-sort";


/** Sort orders offered by the toolbar. */
export type TreeSort = "count" | "name";


/** One area reduced to the part that survives the active query. */
export interface AreaView {
    /** Direct project identifiers that match. */
    readonly projects: readonly string[];

    /** Programs whose identifier or projects match. */
    readonly programs: readonly GraphProgram[];

    /** Whether any entry in the area is visible. */
    readonly visible: boolean;

    /** Number of visible projects, direct and coordinated. */
    readonly total: number;
}


/** Return whether one identifier matches the active query. */
function matches(text: string, query: string): boolean {
    // Require every identifier when no query is active.
    return query === "" || text.toLowerCase().includes(query.toLowerCase());
}


/** Return an area's direct and program project count. */
export function countArea(area: GraphArea): number {
    // Count the direct projects.
    let total: number = area.projects.length;

    // Add each program's coordinated projects.
    for (const program of area.programs) {
        // Add the coordinated count.
        total += program.projects.length;
    }

    // Return the area total.
    return total;
}


/** Read the remembered sort order, defaulting to the largest first. */
export function readSort(): TreeSort {
    // Read the stored order without trusting it.
    try {
        // Require the stored identifier order.
        return window.localStorage.getItem(SORT_STORAGE_KEY) === "name" ? "name" : "count";
    } catch {
        // Fall back when storage is denied.
        return "count";
    }
}


/** Remember one sort order for the next open, ignoring denied storage. */
export function writeSort(sort: TreeSort): void {
    // Store the selected order without surfacing a denied backend.
    try {
        // Persist the order for the next mount.
        window.localStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {
        // Ignore a denied storage backend.
    }
}


/** Read the focus-restoration key for one container file action. */
export function fileKey(identity: ContainerIdentity): string {
    // Include every identity part that can repeat across rows.
    return `file:${identity.kind}:${identity.area}:${identity.program ?? ""}:${identity.id}`;
}


/** Build the identity for one rendered row. */
export function rowIdentity(
    kind: CommitmentLevel,
    id: string,
    area: string,
    program: string | null,
): ContainerIdentity {
    // Return the exact row identity.
    return { kind, id, area, program };
}


/** Return the areas ordered for display. */
export function orderedAreas(areas: readonly GraphArea[], sort: TreeSort): readonly GraphArea[] {
    // Copy the areas before sorting.
    const ordered: GraphArea[] = [...areas];

    // Sort by identifier or by descending size.
    ordered.sort((left: GraphArea, right: GraphArea): number => {
        // Use the identifier order when requested.
        if (sort === "name") {
            // Compare the identifiers.
            return left.id.localeCompare(right.id);
        }

        // Compare by size, then by identifier for a stable order.
        return countArea(right) - countArea(left) || left.id.localeCompare(right.id);
    });

    // Return the ordered areas.
    return ordered;
}


/** Return the part of one area that survives the active query. */
export function filterArea(area: GraphArea, query: string): AreaView {
    // Keep the whole area when no query is active.
    if (query === "") {
        // Count the visible projects.
        let total: number = area.projects.length;

        // Add each program's projects.
        for (const program of area.programs) {
            // Add the coordinated count.
            total += program.projects.length;
        }

        // Return the unfiltered view.
        return { projects: area.projects, programs: area.programs, visible: true, total };
    }

    // Read whether the area identifier matches.
    const areaHit: boolean = matches(area.id, query);

    // Keep matching direct projects.
    const projects: readonly string[] = area.projects.filter(
        (project: string): boolean => matches(project, query),
    );

    // Keep programs whose identifier or projects match.
    const programs: GraphProgram[] = [];
    let total: number = projects.length;
    for (const program of area.programs) {
        // Keep every project when the area or program matches.
        const keepAll: boolean = areaHit || matches(program.id, query);

        // Keep the matching projects otherwise.
        const kept: readonly string[] = keepAll
            ? program.projects
            : program.projects.filter((project: string): boolean => matches(project, query));

        // Skip a program with nothing visible.
        if (!keepAll && kept.length === 0) {
            // Continue with the next program.
            continue;
        }

        // Retain the visible program.
        programs.push({ id: program.id, projects: kept });
        total += kept.length;
    }

    // Report whether anything in the area is visible.
    const visible: boolean = areaHit || projects.length > 0 || programs.length > 0;

    // Return the filtered view.
    return { projects, programs, visible, total };
}


