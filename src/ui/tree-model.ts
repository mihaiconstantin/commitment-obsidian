/**
 * Filters, order, and totals for the interactive graph tree.
 *
 * The model is a function of the graph areas. Native `details` elements own the
 * fold state, so no element is created and no listener is registered here; the
 * rendering class stays focused on the DOM.
 */

import { PROJECT_STATES, type ProjectState } from "../graph/project-state";
import type { GraphArea, GraphProgram } from "../graph/types";
import { countAreaProjects, orderAreas } from "../helpers/area-order";
import type { GraphSort, TreeDefaultsSettings } from "../settings/settings";


/** One area reduced to the part that survives the active filters. */
export interface AreaView {
    /** Direct project identifiers that survive the filters. */
    readonly projects: readonly string[];

    /** Programs that survive the filters. */
    readonly programs: readonly GraphProgram[];

    /** Whether the area row remains visible under the active filters. */
    readonly visible: boolean;

    /** Number of visible projects, direct and coordinated. */
    readonly total: number;
}


/**
 * Interactive tree state for areas, programs, and projects.
 *
 * One model lives with each mounted tree and owns the active filters, the
 * configured area order, and the display totals. Rendering reads the model;
 * only the tree class creates elements and registers listeners.
 *
 * Each filter owns one row level:
 * - `hideInactiveAreas` owns area visibility.
 * - `programStates` owns program visibility.
 * - `projectStates` owns project visibility.
 * - `query` owns cross-level matching.
 *
 * No filter changes the scope of another row level.
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

    /** Project states currently selected by the tree controls. */
    private projectStates: ReadonlySet<ProjectState>;

    /** Program states currently selected by the tree controls. */
    private programStates: ReadonlySet<ProjectState>;

    /** Whether explicitly inactive areas are hidden. */
    private hideInactiveAreas: boolean;

    /** Project states applied when the tree opened. */
    private readonly defaultProjectStates: ReadonlySet<ProjectState>;

    /** Program states applied when the tree opened. */
    private readonly defaultProgramStates: ReadonlySet<ProjectState>;

    /** Area visibility applied when the tree opened. */
    private readonly defaultHideInactiveAreas: boolean;

    /** Report whether one identifier matches the active query. */
    private matches(text: string): boolean {
        // Require every entry when no query is active.
        return this.query === "" || text.toLowerCase().includes(this.query.toLowerCase());
    }

    /** Report whether an area passes its own scope filter. */
    private areaInScope(area: GraphArea): boolean {
        // Hide only an area whose explicit container says it is inactive.
        return !this.hideInactiveAreas || area.active !== false;
    }

    /** Report whether a program passes its own state filter. */
    private programInScope(program: GraphProgram): boolean {
        // Keep programs with unknown or invalid state in scope.
        if (!this.isProgramStateFiltering() || program.state === null) {
            // Keep the program.
            return true;
        }

        // Hide a recognized state outside the selected set.
        return this.programStates.has(program.state);
    }

    /** Report whether a project-state constraint is applied. */
    private isProjectStateFiltering(): boolean {
        // Report a constraint when any recognized project state is unselected.
        return PROJECT_STATES.some(
            (state: ProjectState): boolean => !this.projectStates.has(state),
        );
    }

    /** Report whether a program-state constraint is applied. */
    private isProgramStateFiltering(): boolean {
        // Report a constraint when any recognized program state is unselected.
        return PROJECT_STATES.some(
            (state: ProjectState): boolean => !this.programStates.has(state),
        );
    }

    /** Report whether two state selections contain the same states. */
    private statesEqual(left: ReadonlySet<ProjectState>, right: ReadonlySet<ProjectState>): boolean {
        // Require equal sizes before checking membership.
        if (left.size !== right.size) {
            // Report a different selection.
            return false;
        }

        // Require every left state to exist on the right.
        return Array.from(left).every((state: ProjectState): boolean => right.has(state));
    }

    /** Return whether one project passes the active state constraint. */
    private matchesState(area: GraphArea, identifier: string): boolean {
        // Accept every project when no project-state constraint is active.
        if (!this.isProjectStateFiltering()) {
            // Keep the project.
            return true;
        }

        // Read the recognized state, if any.
        const state: ProjectState | undefined = area.projectStates.get(identifier);

        // Require a recognized state that is selected.
        return state !== undefined && this.projectStates.has(state);
    }

    /** Return scoped programs with their selected projects, keeping empty programs. */
    private selectedPrograms(area: GraphArea, programs: readonly GraphProgram[]): readonly GraphProgram[] {
        // Reduce every program to its state-selected projects.
        return programs.map(
            (program: GraphProgram): GraphProgram => ({
                id: program.id,
                state: program.state,
                projects: program.projects.filter(
                    (identifier: string): boolean => this.matchesState(area, identifier),
                ),
            }),
        );
    }

    /** Read the graph areas, their order, totals, and default filters. */
    public constructor(areas: readonly GraphArea[], sort: GraphSort, defaults: TreeDefaultsSettings) {
        // Store the data and order for every later view.
        this.areas = areas;
        this.sort = sort;

        // Copy the configured defaults so later control changes stay local.
        this.defaultProjectStates = new Set<ProjectState>(defaults.projectStates);
        this.defaultProgramStates = new Set<ProjectState>(defaults.programStates);
        this.defaultHideInactiveAreas = defaults.hideInactiveAreas;
        this.projectStates = new Set<ProjectState>(defaults.projectStates);
        this.programStates = new Set<ProjectState>(defaults.programStates);
        this.hideInactiveAreas = defaults.hideInactiveAreas;

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

    /** Replace the selected project states. */
    public setStates(states: ReadonlySet<ProjectState>): void {
        // Copy the caller's set so later mutations do not change the view.
        this.projectStates = new Set(states);
    }

    /** Return the selected project states. */
    public getStates(): ReadonlySet<ProjectState> {
        // Report the current selection without exposing a mutable set.
        return this.projectStates;
    }

    /** Replace the selected program states. */
    public setProgramStates(states: ReadonlySet<ProjectState>): void {
        // Copy the caller's set so later mutations do not change the view.
        this.programStates = new Set(states);
    }

    /** Return the selected program states. */
    public getProgramStates(): ReadonlySet<ProjectState> {
        // Report the current selection without exposing a mutable set.
        return this.programStates;
    }

    /** Set whether explicitly inactive areas are hidden. */
    public setHideInactiveAreas(hide: boolean): void {
        // Store the latest control value.
        this.hideInactiveAreas = hide;
    }

    /** Return whether explicitly inactive areas are hidden. */
    public getHideInactiveAreas(): boolean {
        // Report the current control value.
        return this.hideInactiveAreas;
    }

    /** Report whether the active filters match the opening defaults. */
    public isAtDefaults(): boolean {
        // Compare the query, both state selections, and the area scope.
        return (
            this.query === ""
            && this.hideInactiveAreas === this.defaultHideInactiveAreas
            && this.statesEqual(this.projectStates, this.defaultProjectStates)
            && this.statesEqual(this.programStates, this.defaultProgramStates)
        );
    }

    /** Report whether any tree filter is active. */
    public isFiltering(): boolean {
        // Combine the text query, both state subsets, and the area scope.
        return (
            this.query !== ""
            || this.isProjectStateFiltering()
            || this.isProgramStateFiltering()
            || this.hideInactiveAreas
        );
    }

    /** Return the empty-result message for the current filters. */
    public emptyMessage(): string {
        // Keep the existing message when the graph is empty or no filter is active.
        if (this.areas.length === 0 || !this.isFiltering()) {
            // Report the empty graph.
            return "No areas.";
        }

        // Name the query when it is the only active filter.
        if (
            this.query !== ""
            && !this.isProjectStateFiltering()
            && !this.isProgramStateFiltering()
            && !this.hideInactiveAreas
        ) {
            // Report the unmatched query.
            return `No match for \`${this.query}\`.`;
        }

        // Name the query when another filter shares the empty result.
        if (this.query !== "") {
            // Report the unmatched query under the remaining filters.
            return `No match for \`${this.query}\` under the current filters.`;
        }

        // Report a filter-only empty result.
        return "No matching areas.";
    }

    /** Return the graph areas in the configured display order. */
    public orderedAreas(): readonly GraphArea[] {
        // Apply the configured order to the stored graph areas.
        return orderAreas(this.areas, this.sort);
    }

    /** Return the part of one area that survives the active filters. */
    public filterArea(area: GraphArea): AreaView {
        // Keep the existing fast path when no filter is active.
        if (!this.isFiltering()) {
            // Return every project and program unchanged.
            return {
                projects: area.projects,
                programs: area.programs,
                visible: true,
                total: this.countArea(area),
            };
        }

        // Apply the area scope before any child filter.
        if (!this.areaInScope(area)) {
            // Return an empty, hidden view.
            return { projects: [], programs: [], visible: false, total: 0 };
        }

        // Read whether a project-state constraint is applied.
        const stateFiltering: boolean = this.isProjectStateFiltering();

        // Reduce direct projects by state when needed.
        const projects: readonly string[] = stateFiltering
            ? area.projects.filter(
                (identifier: string): boolean => this.matchesState(area, identifier),
            )
            : area.projects;

        // Apply the program scope before project selection.
        const scopedPrograms: readonly GraphProgram[] = area.programs.filter(
            (program: GraphProgram): boolean => this.programInScope(program),
        );

        // Reduce scoped programs and their projects by state when needed.
        const programs: readonly GraphProgram[] = stateFiltering
            ? this.selectedPrograms(area, scopedPrograms)
            : scopedPrograms;

        // Apply no text query.
        if (this.query === "") {
            // Start the state-visible project count.
            let total: number = projects.length;

            // Add every program's visible projects.
            for (const program of programs) {
                // Add the program's visible projects.
                total += program.projects.length;
            }

            // Keep every area that passes its own scope, even when no project remains.
            return { projects, programs, visible: true, total };
        }

        // Apply the existing text-query semantics to the state-visible sets.
        const areaHit: boolean = this.matches(area.id);

        // Keep matching direct projects even when the area matches.
        const matchedProjects: readonly string[] = projects.filter(
            (identifier: string): boolean => this.matches(identifier),
        );

        // Start the matched program list and the total project count.
        const matchedPrograms: GraphProgram[] = [];
        let total: number = matchedProjects.length;

        // Reduce every program to its matching projects.
        for (const program of programs) {
            // Keep every selected project when the area or program matches.
            const keepAll: boolean = areaHit || this.matches(program.id);

            // Otherwise keep the matching selected projects.
            const kept: readonly string[] = keepAll
                ? program.projects
                : program.projects.filter(
                    (identifier: string): boolean => this.matches(identifier),
                );

            if (!keepAll && kept.length === 0) {
                // Skip a program with nothing visible.
                continue;
            }

            // Retain the visible program and its state.
            matchedPrograms.push({ id: program.id, state: program.state, projects: kept });
            total += kept.length;
        }

        // Require an area or child match when a query is active.
        const hasContent: boolean = matchedProjects.length > 0 || matchedPrograms.length > 0;

        // Return the composed view.
        return {
            projects: matchedProjects,
            programs: matchedPrograms,
            visible: areaHit || hasContent,
            total,
        };
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
