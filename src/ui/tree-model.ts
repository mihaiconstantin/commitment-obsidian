/**
 * Query, order, and totals for the interactive graph tree.
 *
 * The model is a function of the graph areas. Native `details` elements own the
 * fold state, so no element is created and no listener is registered here; the
 * rendering class stays focused on the DOM.
 */

import type { GraphArea, GraphProgram } from "../graph/types";
import type { GraphSort } from "../settings/settings";
import { countAreaProjects, orderAreas } from "./area-order";


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


/**
 * Interactive tree state for areas, programs, and projects.
 *
 * One model lives with each mounted tree and owns the active query, the
 * configured area order, and the display totals. Rendering reads the model;
 * only the tree class creates elements and registers listeners.
 */
export class TreeModel {
    /** Areas available to this tree in canonical order. */
    private readonly areas: readonly GraphArea[];

    /** Configured area display order. */
    private readonly sort: GraphSort;

    /** Total project count across every area. */
    private readonly totalProjects: number;

    /** Total program count across every area. */
    private readonly totalPrograms: number;

    /** Largest area project count, used to size every meter. */
    private readonly maxTotal: number;

    /** Active filter query. */
    private query: string = "";

    /** Report whether one identifier matches the active query. */
    private matches(text: string): boolean {
        // Require every entry when no query is active.
        return this.query === "" || text.toLowerCase().includes(this.query.toLowerCase());
    }

    /** Read the graph areas, their order, and their totals. */
    public constructor(areas: readonly GraphArea[], sort: GraphSort) {
        // Store the data and order for every later view.
        this.areas = areas;
        this.sort = sort;

        // Read the display totals once for the stats line and the meters.
        this.totalProjects = areas.reduce(
            (sum: number, area: GraphArea): number => sum + this.countArea(area),
            0,
        );
        this.totalPrograms = areas.reduce(
            (sum: number, area: GraphArea): number => sum + area.programs.length,
            0,
        );
        this.maxTotal = areas.reduce(
            (max: number, area: GraphArea): number => Math.max(max, this.countArea(area)),
            0,
        );
    }

    /** Replace the active filter query. */
    public setQuery(query: string): void {
        // Store the latest query.
        this.query = query;
    }

    /** Return the active filter query. */
    public getQuery(): string {
        // Report the latest query.
        return this.query;
    }

    /** Return the graph areas in the configured display order. */
    public orderedAreas(): readonly GraphArea[] {
        // Apply the configured order to the stored graph areas.
        return orderAreas(this.areas, this.sort);
    }

    /** Return the part of one area that survives the active query. */
    public filterArea(area: GraphArea): AreaView {
        // Keep the whole area when no query is active.
        if (this.query === "") {
            // Count the visible projects through the shared project count.
            const total: number = this.countArea(area);

            // Return the unfiltered view.
            return { projects: area.projects, programs: area.programs, visible: true, total };
        }

        // Read whether the area identifier matches.
        const areaHit: boolean = this.matches(area.id);

        // Keep matching direct projects even when the area matches.
        const projects: readonly string[] = area.projects.filter(
            (project: string): boolean => this.matches(project),
        );

        // Keep programs whose identifier or projects match.
        const programs: GraphProgram[] = [];
        let total: number = projects.length;
        for (const program of area.programs) {
            // Keep every project when the area or program matches.
            const keepAll: boolean = areaHit || this.matches(program.id);

            // Keep the matching projects otherwise.
            const kept: readonly string[] = keepAll
                ? program.projects
                : program.projects.filter((project: string): boolean => this.matches(project));

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

    /** Return an area's direct and program project count. */
    public countArea(area: GraphArea): number {
        // Delegate the shared project count.
        return countAreaProjects(area);
    }

    /** Return the total project count across every area. */
    public getTotalProjects(): number {
        // Report the counted total.
        return this.totalProjects;
    }

    /** Return the total program count across every area. */
    public getTotalPrograms(): number {
        // Report the counted total.
        return this.totalPrograms;
    }

    /** Return the largest area project count. */
    public getMaxTotal(): number {
        // Report the meter maximum.
        return this.maxTotal;
    }

    /** Return the number of areas in the graph. */
    public getAreaCount(): number {
        // Report the stored area count.
        return this.areas.length;
    }
}
