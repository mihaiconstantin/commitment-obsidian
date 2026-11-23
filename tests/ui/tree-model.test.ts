import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/constants";
import { PROJECT_STATES, type ProjectState } from "../../src/graph/project-state";
import type { GraphArea } from "../../src/graph/types";
import { TreeModel } from "../../src/ui/tree-model";


const AREAS: readonly GraphArea[] = [
    {
        id: "active",
        active: true,
        projects: ["done-direct"],
        programs: [
            { id: "active-program", state: "active", projects: ["done-coordinated"] },
            { id: "done-program", state: "done", projects: ["active-project"] },
        ],
        projectStates: new Map<string, ProjectState>([
            ["done-direct", "done"],
            ["done-coordinated", "done"],
            ["active-project", "active"],
        ]),
    },
    {
        id: "empty",
        active: true,
        projects: [],
        programs: [],
        projectStates: new Map<string, ProjectState>(),
    },
    {
        id: "inactive",
        active: false,
        projects: ["inactive-project"],
        programs: [],
        projectStates: new Map<string, ProjectState>([["inactive-project", "active"]]),
    },
];


/** Return one test area by identifier. */
function area(identifier: string): GraphArea {
    // Find the requested fixture.
    const found: GraphArea | undefined = AREAS.find(
        (candidate: GraphArea): boolean => candidate.id === identifier,
    );
    if (found === undefined) {
        // Fail fast when the fixture is missing.
        throw new Error(`Missing test area: ${identifier}`);
    }

    // Return the matching fixture.
    return found;
}


/** Mount one model with every area in the test graph. */
function model(): TreeModel {
    // Build the model with count order and shipped defaults.
    return new TreeModel(AREAS, "count", CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults);
}


describe("tree filter model", () => {
    it("keeps every area and program when no filter is active", () => {
        // Read the active area without filters.
        const view = model().filterArea(area("active"));

        expect(view.visible).toBe(true);
        expect(view.total).toBe(3);
        expect(view.projects).toEqual(["done-direct"]);
        expect(view.programs.map((program) => program.id)).toEqual([
            "active-program",
            "done-program",
        ]);
    });

    it("starts from the configured tree defaults", () => {
        // Build the model with restrictive defaults.
        const tree: TreeModel = new TreeModel(AREAS, "count", {
            projectStates: ["active"],
            programStates: ["active"],
            hideInactiveAreas: true,
        });

        // Require both selections and the area scope at startup.
        expect(tree.getStates()).toEqual(new Set<ProjectState>(["active"]));
        expect(tree.getProgramStates()).toEqual(new Set<ProjectState>(["active"]));
        expect(tree.filterArea(area("inactive")).visible).toBe(false);

        // Require the active area to apply both state selections.
        const view = tree.filterArea(area("active"));
        expect(view.projects).toEqual([]);
        expect(view.programs.map((program) => program.id)).toEqual(["active-program"]);
        expect(view.programs[0]?.projects).toEqual([]);
    });

    it("hides only explicitly inactive areas", () => {
        // Hide explicit inactive areas.
        const tree = model();
        tree.setHideInactiveAreas(true);

        expect(tree.filterArea(area("active")).visible).toBe(true);
        expect(tree.filterArea(area("empty")).visible).toBe(true);
        expect(tree.filterArea(area("inactive")).visible).toBe(false);
    });

    it("applies program state selection without changing areas", () => {
        // Select only active programs.
        const tree = model();
        tree.setProgramStates(new Set<ProjectState>(["active"]));
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(true);
        expect(view.projects).toEqual(["done-direct"]);
        expect(view.programs.map((program) => program.id)).toEqual(["active-program"]);
        expect(view.programs[0]?.projects).toEqual(["done-coordinated"]);
    });

    it("hides recognized programs when no program state is selected", () => {
        // Select zero program states.
        const tree = model();
        tree.setProgramStates(new Set<ProjectState>());
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(true);
        expect(view.projects).toEqual(["done-direct"]);
        expect(view.programs).toEqual([]);
        expect(view.total).toBe(1);
    });

    it("keeps a program without a state under a program state filter", () => {
        // Add one implicit program with no recognized state and one coordinated project.
        const source: GraphArea = area("active");
        const projectStates: Map<string, ProjectState> = new Map<string, ProjectState>(
            source.projectStates,
        );
        projectStates.set("unknown-project", "active");
        const withUnknown: GraphArea = {
            ...source,
            programs: [
                ...source.programs,
                { id: "unknown-program", state: null, projects: ["unknown-project"] },
            ],
            projectStates,
        };

        // Select only active programs.
        const tree = new TreeModel(
            [withUnknown],
            "count",
            CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
        );
        tree.setProgramStates(new Set<ProjectState>(["active"]));
        const view = tree.filterArea(withUnknown);

        // Require the unknown program and its project to remain visible.
        expect(view.visible).toBe(true);
        expect(view.programs.map((program) => program.id)).toEqual([
            "active-program",
            "unknown-program",
        ]);
        expect(view.programs[1]?.projects).toEqual(["unknown-project"]);
        expect(view.total).toBe(3);
    });

    it("keeps structural rows when no project state is selected", () => {
        // Select zero project states.
        const tree = model();
        tree.setStates(new Set<ProjectState>());
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(true);
        expect(view.total).toBe(0);
        expect(view.projects).toEqual([]);
        expect(view.programs.map((program) => program.projects.length)).toEqual([0, 0]);
    });

    it("does not reveal a state-hidden project through the query", () => {
        // Select active projects and query a completed project.
        const tree = model();
        tree.setStates(new Set<ProjectState>(["active"]));
        tree.setQuery("done-direct");
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(false);
        expect(view.total).toBe(0);
    });

    it("keeps a matching area with no selected projects under a state filter", () => {
        // Select active projects and query the empty area.
        const tree = model();
        tree.setStates(new Set<ProjectState>(["active"]));
        tree.setQuery("empty");
        const view = tree.filterArea(area("empty"));

        expect(view.visible).toBe(true);
        expect(view.total).toBe(0);
    });

    it("keeps a matching program with no selected projects under a state filter", () => {
        // Select active projects and query the active program with completed work.
        const tree = model();
        tree.setStates(new Set<ProjectState>(["active"]));
        tree.setQuery("active-program");
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(true);
        expect(view.programs.map((program) => program.id)).toEqual(["active-program"]);
        expect(view.programs[0]?.projects).toEqual([]);
    });

    it("does not reveal a hidden program through the query", () => {
        // Select active programs and query the completed program.
        const tree = model();
        tree.setProgramStates(new Set<ProjectState>(["active"]));
        tree.setQuery("done-program");
        const view = tree.filterArea(area("active"));

        expect(view.visible).toBe(false);
        expect(view.programs).toEqual([]);
    });

    it("uses all six states as the unchecked constraint", () => {
        // Check every state through the model setters.
        const tree = model();
        tree.setStates(new Set<ProjectState>(PROJECT_STATES));
        tree.setProgramStates(new Set<ProjectState>(PROJECT_STATES));

        expect(tree.isFiltering()).toBe(false);
        expect(tree.filterArea(area("active")).total).toBe(3);
    });
});
