import { describe, expect, it } from "vitest";
import { Diagnostics, type Diagnostic } from "../../src/diagnostics/diagnostics";
import { GraphBuilder, type GraphBuild as GraphReadModel } from "../../src/graph/builder";
import type { ProjectState } from "../../src/graph/project-state";
import type { CanonicalInput, GraphArea, GraphProgram } from "../../src/graph/types";


/** One test build with diagnostics collected from its graph read model. */
interface TestGraphBuild extends GraphReadModel {
    /** Findings collected from the normalized data. */
    readonly diagnostics: readonly Diagnostic[];
}


/** Build one graph and collect diagnostics from its read model. */
function buildGraph(inputs: readonly CanonicalInput[], diagnostics: Diagnostics = new Diagnostics()): TestGraphBuild {
    // Build the graph read model first.
    const build: GraphReadModel = new GraphBuilder(inputs).build();

    // Collect findings from the normalized data.
    return { ...build, diagnostics: diagnostics.collect(build.normalized, build.programs) };
}


/** One program in a parsed direct projection. */
interface ParsedProgram {
    /** Sorted coordinated project identifiers. */
    readonly projects: readonly string[];
}


/** One area in a parsed direct projection. */
interface ParsedArea {
    /** Sorted direct project identifiers. */
    readonly projects: readonly string[];

    /** Programs keyed by identifier. */
    readonly programs: Record<string, ParsedProgram>;
}


function input(path: string, entries: ReadonlyArray<readonly [string, unknown]>): CanonicalInput {
    return { path, frontmatter: new Map<string, unknown>(entries) };
}


const area = (path: string, id: string): CanonicalInput =>
    input(path, [["type", "area"], ["id", id], ["active", true]]);


const program = (path: string, id: string, areaId: string): CanonicalInput =>
    input(path, [["type", "program"], ["id", id], ["area", areaId], ["state", "active"]]);


const project = (path: string, id: string, areaId: string = "work", programId?: string | null, state: unknown = "active"): CanonicalInput => {
    const entries: Array<readonly [string, unknown]> = [
        ["type", "project"],
        ["id", id],
        ["area", areaId],
        ["state", state],
    ];
    if (programId !== undefined) {
        entries.push(["program", programId]);
    }
    return input(path, entries);
};


/** One duplicate representation regression case. */
interface DuplicateCase {
    /** Test title describing the scenario. */
    readonly name: string;

    /** Canonical inputs for the scenario. */
    readonly inputs: readonly CanonicalInput[];

    /** Expected failure message, or null when construction must succeed. */
    readonly failure: RegExp | null;

    /** Expected area snapshots for a successful construction. */
    readonly areas?: readonly GraphArea[];
}


/** Duplicate representation cases in code-unit and concept-level order. */
const DUPLICATE_CASES: readonly DuplicateCase[] = [
    {
        name: "rejects duplicate area containers with every path",
        inputs: [
            area("b/area.md", "shared"),
            area("a/area.md", "shared"),
        ],
        failure: /Duplicate area `shared` at `a\/area\.md`, `b\/area\.md`\./,
    },
    {
        name: "rejects duplicate program containers with every path",
        inputs: [
            program("b/program.md", "shared", "work"),
            program("a/program.md", "shared", "work"),
        ],
        failure: /Duplicate program `shared` at `a\/program\.md`, `b\/program\.md`\./,
    },
    {
        name: "selects the lexicographically first duplicated identifier",
        inputs: [
            area("z/two.md", "zeta"),
            area("a/two.md", "shared"),
            area("z/one.md", "zeta"),
            area("a/one.md", "shared"),
        ],
        failure: /Duplicate area `shared` at `a\/one\.md`, `a\/two\.md`\./,
    },
    {
        name: "reports area duplicates before program and project duplicates",
        inputs: [
            project("a/two.md", "aardvark"),
            project("a/one.md", "aardvark"),
            program("b/two.md", "zeta", "work"),
            program("b/one.md", "zeta", "work"),
            area("z/two.md", "zulu"),
            area("z/one.md", "zulu"),
        ],
        failure: /Duplicate area `zulu` at `z\/one\.md`, `z\/two\.md`\./,
    },
    {
        name: "reports program duplicates before project duplicates",
        inputs: [
            project("a/two.md", "aardvark"),
            project("a/one.md", "aardvark"),
            program("z/two.md", "zeta", "work"),
            program("z/one.md", "zeta", "work"),
        ],
        failure: /Duplicate program `zeta` at `z\/one\.md`, `z\/two\.md`\./,
    },
    {
        name: "keeps the same identifier at different concept levels distinct",
        inputs: [
            area("areas/shared.md", "shared"),
            program("programs/shared.md", "shared", "shared"),
            project("projects/shared.md", "shared", "shared"),
        ],
        failure: null,
        areas: [
            {
                id: "shared",
                active: true,
                projects: ["shared"],
                programs: [{ id: "shared", state: "active", projects: [] }],
                projectStates: new Map<string, ProjectState>([["shared", "active"]]),
            },
        ],
    },
    {
        name: "allows the same source path to repeat without a duplicate failure",
        inputs: [
            project("projects/repeat.md", "repeat", "work"),
            project("projects/repeat.md", "repeat", "work"),
        ],
        failure: null,
        areas: [
            {
                id: "work",
                active: null,
                projects: ["repeat", "repeat"],
                programs: [],
                projectStates: new Map<string, ProjectState>([["repeat", "active"]]),
            },
        ],
    },
    {
        name: "reports a later missing field before an earlier duplicate",
        inputs: [
            area("a/one.md", "shared"),
            area("b/one.md", "shared"),
            input("z/missing.md", [["type", "project"], ["area", "work"]]),
        ],
        failure: /Project `z\/missing\.md` is missing `id`\./,
    },
];

describe("commitment graph", () => {
    it("derives containerless areas and programs", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
            project("projects/gamma.md", "gamma", "work"),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                active: null,
                projects: ["gamma"],
                programs: [{ id: "phd", state: null, projects: ["alpha", "beta"] }],
                projectStates: new Map<string, ProjectState>([
                    ["alpha", "active"],
                    ["beta", "active"],
                    ["gamma", "active"],
                ]),
            },
        ]);
        expect(result.graph.toJson()).toBe(
            '{\n    "work": {\n        "projects": [\n            "gamma"\n        ],\n        "programs": {\n            "phd": {\n                "projects": [\n                    "alpha",\n                    "beta"\n                ]\n            }\n        }\n    }\n}\n',
        );
    });

    it("keeps container-only areas and programs", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            area("areas/empty.md", "empty"),
            program("programs/phd.md", "phd", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas().map((entry) => entry.id)).toEqual(["empty", "work"]);
    });

    it("keeps findings independent when reusing diagnostics", () => {
        // Reuse one diagnostics collector across different graph builds.
        const diagnostics: Diagnostics = new Diagnostics();
        const unresolved: TestGraphBuild = buildGraph([
            input("notes/unanchored.md", [["type", "note"]]),
        ], diagnostics);
        const underfilled: TestGraphBuild = buildGraph([
            program("programs/phd.md", "phd", "work"),
        ], diagnostics);
        const healthy: TestGraphBuild = buildGraph([], diagnostics);

        // Require earlier snapshots to retain only their own findings.
        expect(unresolved.diagnostics).toEqual([
            {
                group: "Unresolved anchors",
                message: "Support container has no valid `level` or `anchor`. Omitted from graph.",
                paths: ["notes/unanchored.md"],
            },
        ]);
        expect(underfilled.diagnostics).toEqual([
            {
                group: "Underfilled programs",
                message: "Program `phd` in area `work` has 0 projects. 2 or more expected.",
                paths: ["programs/phd.md"],
            },
        ]);
        expect(healthy.diagnostics).toEqual([]);
    });

    it("reports invalid program states while keeping programs", () => {
        // Derive one graph with explicit, missing, and invalid program states.
        const result: TestGraphBuild = buildGraph([
            input("programs/active.md", [
                ["type", "program"],
                ["id", "active-program"],
                ["area", "work"],
                ["state", "active"],
            ]),
            input("programs/done.md", [
                ["type", "program"],
                ["id", "done-program"],
                ["area", "work"],
                ["state", "done"],
            ]),
            input("programs/missing.md", [
                ["type", "program"],
                ["id", "missing-program"],
                ["area", "work"],
            ]),
            input("programs/invalid.md", [
                ["type", "program"],
                ["id", "invalid-program"],
                ["area", "work"],
                ["state", "Active"],
            ]),
        ]);

        // Require exact recognized states and null for malformed values.
        const programs: readonly GraphProgram[] = result.graph.getAreas()[0]?.programs ?? [];
        expect(programs.map((program) => [program.id, program.state])).toEqual([
            ["active-program", "active"],
            ["done-program", "done"],
            ["invalid-program", null],
            ["missing-program", null],
        ]);

        // Require one finding for the present invalid state only.
        expect(
            result.diagnostics.filter(
                (entry) => entry.group === "Invalid states",
            ),
        ).toEqual([
            {
                group: "Invalid states",
                message: "Program `invalid-program` in area `work` has invalid `state`. Expected one recognized state.",
                paths: ["programs/invalid.md"],
            },
        ]);
    });

    it("indexes explicit container paths and leaves implicit ones absent", () => {
        // Derive a graph with explicit area and project containers.
        const result: TestGraphBuild = buildGraph([
            area("areas/work.md", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
            project("projects/gamma.md", "gamma", "work"),
        ]);

        // Require the explicit source paths.
        expect(result.graph.getContainerPath("area", "work")).toBe("areas/work.md");
        expect(result.graph.getContainerPath("project", "alpha")).toBe("projects/alpha.md");
        expect(result.graph.getContainerPath("project", "gamma")).toBe("projects/gamma.md");

        // Require no path for an implicit program or an unknown identifier.
        expect(result.graph.getContainerPath("program", "phd")).toBeNull();
        expect(result.graph.getContainerPath("program", "missing")).toBeNull();
        expect(result.graph.getContainerPath("project", "missing")).toBeNull();
    });

    it("establishes an area from an area-level support anchor", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            input("meetings/standup.md", [
                ["type", "meeting"],
                ["level", "area"],
                ["anchor", "work-tiu"],
                ["scheduled", "2026-02-26"],
            ]),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas()).toEqual([
            {
                id: "work-tiu",
                active: null,
                projects: [],
                programs: [],
                projectStates: new Map<string, ProjectState>(),
            },
        ]);
    });

    it("treats missing and null project programs as direct", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/missing.md", "missing"),
            input("projects/null.md", [
                ["type", "project"],
                ["id", "null-program"],
                ["area", "work"],
                ["state", "active"],
                ["program", null],
            ]),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                active: null,
                projects: ["missing", "null-program"],
                programs: [],
                projectStates: new Map<string, ProjectState>([
                    ["missing", "active"],
                    ["null-program", "active"],
                ]),
            },
        ]);
    });

    it.each<unknown>(["", "  ", " padded", "padded ", 3, true, []])(
        "rejects an invalid explicit project program %j",
        (value: unknown) => {
            // Build a project whose program field carries the invalid value.
            const invalid: CanonicalInput = input("projects/alpha.md", [
                ["type", "project"],
                ["id", "alpha"],
                ["area", "work"],
                ["state", "active"],
                ["program", value],
            ]);

            // Require the invalid relationship to block construction.
            expect(() => buildGraph([invalid])).toThrowError(
                /has invalid `program`/,
            );
        },
    );

    it.each<DuplicateCase>(DUPLICATE_CASES)("$name", (testCase: DuplicateCase) => {
        // Require the documented failure for a duplicate representation.
        if (testCase.failure !== null) {
            expect(() => buildGraph(testCase.inputs)).toThrowError(testCase.failure);
            return;
        }

        // Require successful construction with the expected area snapshots.
        const result: TestGraphBuild = buildGraph(testCase.inputs);
        expect(result.graph.getAreas()).toEqual(testCase.areas);
    });

    it("rejects duplicate typed representations with every path", () => {
        // Require the typed duplicate to block construction.
        expect(() =>
            buildGraph([
                project("b/project.md", "shared"),
                project("a/project.md", "shared"),
            ]),
        ).toThrowError(
            /Duplicate project `shared` at `a\/project\.md`, `b\/project\.md`\./,
        );
    });

    it("lists every source path for three duplicate containers", () => {
        // Require the typed duplicate to name all three source paths in code-unit order.
        expect(() =>
            buildGraph([
                project("c/project.md", "shared"),
                project("a/project.md", "shared"),
                project("b/project.md", "shared"),
            ]),
        ).toThrowError(
            /Duplicate project `shared` at `a\/project\.md`, `b\/project\.md`, `c\/project\.md`\./,
        );
    });

    it("keeps the same text at different concept levels distinct", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            area("areas/shared.md", "shared"),
            project("projects/shared.md", "shared", "shared"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "shared",
                active: true,
                projects: ["shared"],
                programs: [],
                projectStates: new Map<string, ProjectState>([["shared", "active"]]),
            },
        ]);
    });

    it("rejects contradictory program areas", () => {
        // Require the documented failure.
        expect(() =>
            buildGraph([
                project("projects/alpha.md", "alpha", "work", "phd"),
                project("projects/beta.md", "beta", "personal", "phd"),
            ]),
        ).toThrowError(/Program `phd` has conflicting areas `personal`, `work`/);
    });

    it("warns for underfilled programs and keeps them", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "work", "phd"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                active: null,
                projects: [],
                programs: [{ id: "phd", state: null, projects: ["alpha"] }],
                projectStates: new Map<string, ProjectState>([["alpha", "active"]]),
            },
        ]);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]).toMatchObject({
            group: "Underfilled programs",
            message: "Program `phd` in area `work` has 1 project. 2 or more expected.",
            paths: ["projects/alpha.md"],
        });
    });

    it("warns for an empty program container", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([program("programs/phd.md", "phd", "work")]);

        expect(result.diagnostics[0]).toMatchObject({
            group: "Underfilled programs",
            message: "Program `phd` in area `work` has 0 projects. 2 or more expected.",
        });
    });

    it("omits unresolved support anchors with diagnostics", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha"),
            input("meetings/missing.md", [
                ["type", "meeting"],
                ["level", "project"],
                ["anchor", "missing"],
                ["scheduled", "2026-02-26"],
            ]),
            input("notes/unanchored.md", [["type", "note"]]),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                active: null,
                projects: ["alpha"],
                programs: [],
                projectStates: new Map<string, ProjectState>([["alpha", "active"]]),
            },
        ]);
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                group: "Unresolved anchors",
                message: "Support container anchors to unknown project `missing`. Omitted from graph.",
                paths: ["meetings/missing.md"],
            }),
            expect.objectContaining({
                group: "Unresolved anchors",
                message: "Support container has no valid `level` or `anchor`. Omitted from graph.",
                paths: ["notes/unanchored.md"],
            }),
        ]);

        // Require the rendered message and the path line to avoid repeating the path.
        for (const diagnostic of result.diagnostics) {
            for (const path of diagnostic.paths) {
                expect(diagnostic.message).not.toContain(path);
            }
        }
    });

    it("resolves supports to known areas, programs, and projects", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
            input("meetings/area.md", [["type", "meeting"], ["level", "area"], ["anchor", "work"]]),
            input("notes/program.md", [["type", "note"], ["level", "program"], ["anchor", "phd"]]),
            input("tasks/project.md", [["type", "task"], ["level", "project"], ["anchor", "alpha"]]),
        ]);

        expect(result.diagnostics).toEqual([]);
    });

    it("ignores non-canonical documents", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            input("reference/project.md", [
                ["context", "Course"],
                ["key", "CourseIS"],
                ["type", "recipe"],
                ["id", "alpha"],
                ["area", "work"],
            ]),
            input("notes/meeting.md", [["title", "Note"]]),
        ]);

        expect(result.graph.getAreas()).toEqual([]);
        expect(result.graph.toJson()).toBe("{}\n");
        expect(result.diagnostics).toEqual([]);
    });

    it("indexes every recognized project state by project identifier", () => {
        // Define one project per exact state.
        const states: ReadonlyArray<readonly [string, ProjectState]> = [
            ["triage", "triage"],
            ["planned", "planned"],
            ["active", "active"],
            ["paused", "paused"],
            ["done", "done"],
            ["dropped", "dropped"],
        ];

        // Derive the graph from one area and six state projects.
        const result: TestGraphBuild = buildGraph([
            area("areas/work.md", "work"),
            ...states.map(([id, state]) =>
                project(`projects/${id}.md`, id, "work", undefined, state),
            ),
        ]);

        // Require the exact state index and no findings.
        expect(result.graph.getAreas()[0]?.projectStates).toEqual(new Map(states));
        expect(result.diagnostics).toEqual([]);
    });

    it("reports invalid project states while keeping projects", () => {
        // Check every rejected present state against an otherwise valid project.
        for (const value of ["Active", "in-progress", "", null]) {
            // Derive the graph from the invalid state.
            const result: TestGraphBuild = buildGraph([
                project("projects/alpha.md", "alpha", "work", undefined, value),
            ]);

            // Require the project to remain visible without a state entry.
            expect(result.graph.getAreas()[0]?.projects).toEqual(["alpha"]);
            expect(result.graph.getAreas()[0]?.projectStates.size).toBe(0);

            // Require one nonblocking state finding for the container.
            expect(result.diagnostics).toEqual([
                {
                    group: "Invalid states",
                    message: "Project `alpha` in area `work` has invalid `state`. Expected one recognized state.",
                    paths: ["projects/alpha.md"],
                },
            ]);
        }

        // Derive the graph from a project with no state field.
        const missing: TestGraphBuild = buildGraph([
            input("projects/missing.md", [
                ["type", "project"],
                ["id", "missing"],
                ["area", "work"],
            ]),
        ]);

        // Require the absent state to stay absent and produce no finding.
        expect(missing.graph.getAreas()[0]?.projectStates.size).toBe(0);
        expect(missing.diagnostics).toEqual([]);
    });

    it("reports invalid task states while keeping missing states silent", () => {
        // Derive a graph with one invalid task and one task without a state.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "work", null, "active"),
            input("tasks/invalid.md", [
                ["type", "task"],
                ["level", "project"],
                ["anchor", "alpha"],
                ["state", "Active"],
            ]),
            input("tasks/missing.md", [
                ["type", "task"],
                ["level", "project"],
                ["anchor", "alpha"],
            ]),
        ]);

        // Require one finding for the present invalid state only.
        expect(
            result.diagnostics.filter(
                (entry) => entry.group === "Invalid states",
            ),
        ).toEqual([
            {
                group: "Invalid states",
                message: "Task container has invalid `state`. Expected one recognized state.",
                paths: ["tasks/invalid.md"],
            },
        ]);
    });

    it("reports one state finding for repeated source paths", () => {
        // Repeat invalid program and project inputs for the same source paths.
        const invalidProgram: CanonicalInput = input("programs/phd.md", [
            ["type", "program"],
            ["id", "phd"],
            ["area", "work"],
            ["state", ""],
        ]);
        const invalidProject: CanonicalInput = input("projects/alpha.md", [
            ["type", "project"],
            ["id", "alpha"],
            ["area", "work"],
            ["state", "Active"],
        ]);
        const result: TestGraphBuild = buildGraph([
            invalidProject,
            invalidProject,
            invalidProgram,
            invalidProgram,
        ]);

        // Require one state finding per distinct source path.
        expect(
            result.diagnostics.filter(
                (entry) => entry.group === "Invalid states",
            ),
        ).toEqual([
            {
                group: "Invalid states",
                message: "Program `phd` in area `work` has invalid `state`. Expected one recognized state.",
                paths: ["programs/phd.md"],
            },
            {
                group: "Invalid states",
                message: "Project `alpha` in area `work` has invalid `state`. Expected one recognized state.",
                paths: ["projects/alpha.md"],
            },
        ]);
    });

    it("keeps coordinated project states in the area index", () => {
        // Derive the graph from two projects coordinated by one program.
        const result: TestGraphBuild = buildGraph([
            area("areas/work.md", "work"),
            project("projects/alpha.md", "alpha", "work", "phd", "done"),
            project("projects/beta.md", "beta", "work", "phd", "planned"),
        ]);

        // Require both coordinated states in the same area index.
        expect(result.graph.getAreas()[0]?.projectStates).toEqual(
            new Map<string, ProjectState>([
                ["alpha", "done"],
                ["beta", "planned"],
            ]),
        );
        expect(result.diagnostics).toEqual([]);
    });

    it("reports invalid area active values while reading only booleans", () => {
        // Check every accepted or rejected relevance value.
        const values: ReadonlyArray<readonly [unknown, boolean | null, boolean]> = [
            [false, false, false],
            [true, true, false],
            ["false", null, true],
            [null, null, true],
            [1, null, true],
        ];
        for (const [value, expected, invalid] of values) {
            // Derive the graph from an explicit area with the test value.
            const result: TestGraphBuild = buildGraph([
                input("areas/work.md", [
                    ["type", "area"],
                    ["id", "work"],
                    ["active", value],
                ]),
                project("projects/alpha.md", "alpha", "work", null, "planned"),
            ]);

            // Require only a real boolean to survive.
            expect(result.graph.getAreas()[0]?.active).toBe(expected);

            // Require a finding only for a present invalid value.
            expect(result.diagnostics).toEqual(
                invalid
                    ? [
                        {
                            group: "Invalid area activity",
                            message: "Area `work` has invalid `active`. Expected `true` or `false`.",
                            paths: ["areas/work.md"],
                        },
                    ]
                    : [],
            );
        }

        // Derive the graph from an area container with no active field.
        const missing: TestGraphBuild = buildGraph([
            input("areas/work.md", [["type", "area"], ["id", "work"]]),
            project("projects/alpha.md", "alpha", "work", null, "planned"),
        ]);

        // Require an absent relevance value to stay null and silent.
        expect(missing.graph.getAreas()[0]?.active).toBeNull();
        expect(missing.diagnostics).toEqual([]);
    });

    it("reports inactive areas that contain active projects", () => {
        // Derive a graph with active direct and coordinated projects under an inactive area.
        const result: TestGraphBuild = buildGraph([
            input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
            project("projects/alpha.md", "alpha", "work", null, "active"),
            project("projects/beta.md", "beta", "work", null, "done"),
            project("projects/gamma.md", "gamma", "work", "phd", "active"),
            project("projects/delta.md", "delta", "work", "phd", "planned"),
        ]);

        // Require one finding with both active projects and their source paths.
        expect(result.diagnostics).toEqual([
            {
                group: "Inactive areas with active projects",
                message: "Inactive area `work` contains 2 active projects `alpha`, `gamma`.",
                paths: ["areas/work.md", "projects/alpha.md", "projects/gamma.md"],
            },
        ]);
    });

    it("reports inactive areas that contain active programs", () => {
        // Derive an inactive area with an active program and no active projects.
        const result: TestGraphBuild = buildGraph([
            input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
            program("programs/phd.md", "phd", "work"),
            project("projects/alpha.md", "alpha", "work", "phd", "done"),
            project("projects/beta.md", "beta", "work", "phd", "planned"),
        ]);

        // Require the active program and its container path.
        expect(result.diagnostics).toEqual([
            {
                group: "Inactive areas with active programs",
                message: "Inactive area `work` contains 1 active program `phd`.",
                paths: ["areas/work.md", "programs/phd.md"],
            },
        ]);
    });

    it("reports inactive areas that contain active tasks", () => {
        // Derive an inactive area with tasks anchored to the area, a derived program, and a project.
        const result: TestGraphBuild = buildGraph([
            input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
            project("projects/alpha.md", "alpha", "work", "phd", "planned"),
            project("projects/beta.md", "beta", "work", "phd", "planned"),
            input("tasks/area.md", [
                ["type", "task"],
                ["level", "area"],
                ["anchor", "work"],
                ["state", "active"],
            ]),
            input("tasks/program.md", [
                ["type", "task"],
                ["level", "program"],
                ["anchor", "phd"],
                ["state", "active"],
            ]),
            input("tasks/project.md", [
                ["type", "task"],
                ["level", "project"],
                ["anchor", "alpha"],
                ["state", "active"],
            ]),
        ]);

        // Require all active tasks under the inactive area.
        expect(result.diagnostics).toEqual([
            {
                group: "Inactive areas with active tasks",
                message: "Inactive area `work` contains 3 active tasks.",
                paths: [
                    "areas/work.md",
                    "tasks/area.md",
                    "tasks/program.md",
                    "tasks/project.md",
                ],
            },
        ]);
    });

    it("counts one active task for repeated source paths", () => {
        // Repeat one active task input for the same source path.
        const task: CanonicalInput = input("tasks/review.md", [
            ["type", "task"],
            ["level", "area"],
            ["anchor", "work"],
            ["state", "active"],
        ]);
        const result: TestGraphBuild = buildGraph([
            input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
            task,
            task,
        ]);

        // Require one task count and one task path.
        expect(result.diagnostics).toEqual([
            {
                group: "Inactive areas with active tasks",
                message: "Inactive area `work` contains 1 active task.",
                paths: ["areas/work.md", "tasks/review.md"],
            },
        ]);
    });

    it("reports finished programs that contain active projects", () => {
        // Check both finished program states.
        for (const state of ["done", "dropped"] as const) {
            // Derive a finished program with one active and one planned project.
            const result: TestGraphBuild = buildGraph([
                input("areas/work.md", [["type", "area"], ["id", "work"], ["active", true]]),
                input("programs/phd.md", [
                    ["type", "program"],
                    ["id", "phd"],
                    ["area", "work"],
                    ["state", state],
                ]),
                project("projects/alpha.md", "alpha", "work", "phd", "active"),
                project("projects/beta.md", "beta", "work", "phd", "planned"),
            ]);

            // Require the finished program and its active project.
            expect(result.diagnostics).toEqual([
                {
                    group: "Finished programs with active projects",
                    message: `Program \`phd\` is ${state} but coordinates 1 active project \`alpha\`.`,
                    paths: ["programs/phd.md", "projects/alpha.md"],
                },
            ]);
        }
    });

    it("orders inactive-area findings by area identifier", () => {
        // Derive two inactive areas whose identifiers differ from their paths.
        const result: TestGraphBuild = buildGraph([
            input("z/areas/zeta.md", [["type", "area"], ["id", "zeta"], ["active", false]]),
            project("z/projects/zeta-project.md", "zeta-project", "zeta", null, "active"),
            input("a/areas/alpha.md", [["type", "area"], ["id", "alpha"], ["active", false]]),
            project("a/projects/alpha-project.md", "alpha-project", "alpha", null, "active"),
        ]);

        // Require findings in area identifier order.
        expect(result.diagnostics.map((entry) => entry.message)).toEqual([
            "Inactive area `alpha` contains 1 active project `alpha-project`.",
            "Inactive area `zeta` contains 1 active project `zeta-project`.",
        ]);
    });

    it("omits inactive-area findings outside exact inactive and active values", () => {
        // Check every case that cannot prove the contradiction.
        const cases: ReadonlyArray<readonly [string, readonly CanonicalInput[]]> = [
            [
                "implicit area",
                [project("projects/alpha.md", "alpha", "work", null, "active")],
            ],
            [
                "explicit active area",
                [area("areas/work.md", "work"), project("projects/alpha.md", "alpha", "work", null, "active")],
            ],
            [
                "malformed active value",
                [
                    input("areas/work.md", [["type", "area"], ["id", "work"], ["active", "false"]]),
                    project("projects/alpha.md", "alpha", "work", null, "active"),
                ],
            ],
            [
                "inactive area without projects",
                [input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]])],
            ],
            [
                "inactive area with non-active projects",
                [
                    input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
                    project("projects/alpha.md", "alpha", "work", null, "planned"),
                    project("projects/beta.md", "beta", "work", null, "done"),
                ],
            ],
            [
                "inactive area with missing and invalid project states",
                [
                    input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
                    project("projects/alpha.md", "alpha", "work", null, null),
                    project("projects/beta.md", "beta", "work", null, "Active"),
                ],
            ],
        ];
        for (const [name, inputs] of cases) {
            // Derive the graph for the non-triggering case.
            const result: TestGraphBuild = buildGraph(inputs);

            // Require no inactive-area cross-field finding.
            expect(
                result.diagnostics.filter(
                    (entry) => entry.group === "Inactive areas with active projects",
                ),
                name,
            ).toEqual([]);
        }
    });

    it("rejects missing area and project structures", () => {
        // Require the documented failure.
        expect(() =>
            buildGraph([
                input("projects/missing.md", [["type", "project"], ["area", "work"]]),
            ]),
        ).toThrowError(/missing `id`/);
        expect(() =>
            buildGraph([
                input("projects/no-area.md", [["type", "project"], ["id", "alpha"]]),
            ]),
        ).toThrowError(/missing `area`/);
        expect(() =>
            buildGraph([
                input("areas/no-id.md", [["type", "area"], ["active", true]]),
            ]),
        ).toThrowError(/missing `id`/);
    });

    it("rejects padded and whitespace-only identifiers", () => {
        // Check every rejected value.
        for (const identifier of [" padded", "padded ", "   ", ""]) {
            expect(() =>
                buildGraph([project("projects/bad.md", identifier)]),
            ).toThrowError(/has invalid `id`/);
        }
    });

    it("accepts a zero-width no-break space inside an identifier", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/bom.md", "a\uFEFFb"),
        ]);

        expect(result.graph.getAreas()[0]?.projects).toEqual(["a\uFEFFb"]);
    });

    it("sorts areas, programs, and projects by code unit", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/two.md", "10"),
            project("projects/one.md", "9"),
            project("projects/p.md", "\u{1F600}", "work", "10"),
            project("projects/q.md", "b", "work", "9"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                active: null,
                projects: ["10", "9"],
                programs: [
                    { id: "10", state: null, projects: ["\u{1F600}"] },
                    { id: "9", state: null, projects: ["b"] },
                ],
                projectStates: new Map<string, ProjectState>([
                    ["10", "active"],
                    ["9", "active"],
                    ["\u{1F600}", "active"],
                    ["b", "active"],
                ]),
            },
        ]);
    });

    it("orders supplementary-character areas and programs by code unit", () => {
        // Derive the graph from the canonical inputs.
        const result: TestGraphBuild = buildGraph([
            project("projects/emoji.md", "p", "\u{1F600}", "\u{1F600}"),
            project("projects/replacement.md", "q", "\uFFFD", "\uFFFD"),
            project("projects/emoji-second.md", "r", "\u{1F600}", "\u{1F600}"),
        ]);

        expect(result.graph.getAreas().map((entry) => entry.id)).toEqual([
            "\u{1F600}",
            "\uFFFD",
        ]);
        expect(result.graph.getAreas()[0]?.programs.map((entry) => entry.id)).toEqual([
            "\u{1F600}",
        ]);
    });

    it("emits diagnostics in display order", () => {
        // Derive findings across several checks.
        const result: TestGraphBuild = buildGraph([
            // Add a support container with no valid anchor, handled by the unresolved rule.
            input("z/no-anchor.md", [["type", "meeting"]]),
            // Mark the area inactive while it still contains an active project.
            input("areas/work.md", [["type", "area"], ["id", "work"], ["active", false]]),
            // Add a program that coordinates one project, which is underfilled.
            program("programs/phd.md", "phd", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            // Anchor to an absent project, also handled by the unresolved rule.
            input("a/unanchored.md", [["type", "note"], ["level", "project"], ["anchor", "ghost"]]),
        ]);

        // Require unresolved findings before inactive-area and program findings.
        expect(result.diagnostics.map((entry) => entry.group)).toEqual([
            "Unresolved anchors",
            "Unresolved anchors",
            "Inactive areas with active projects",
            "Inactive areas with active programs",
            "Underfilled programs",
        ]);

        // Require each diagnostic to carry its own primary source path.
        expect(result.diagnostics.map((entry) => entry.paths[0])).toEqual([
            "a/unanchored.md",
            "z/no-anchor.md",
            "areas/work.md",
            "areas/work.md",
            "programs/phd.md",
        ]);

        // Require concise messages that leave path rendering to the paths field.
        for (const diagnostic of result.diagnostics) {
            expect(diagnostic.message).not.toContain("Canonical");
            expect(diagnostic.message).not.toMatch(/[;:']/);
            for (const path of diagnostic.paths) {
                expect(diagnostic.message).not.toContain(path);
            }
        }
    });

    it("emits every diagnostic group in display order", () => {
        // Derive one finding for every diagnostic group.
        const result: TestGraphBuild = buildGraph([
            input("a/unanchored.md", [["type", "note"]]),
            input("areas/invalid.md", [
                ["type", "area"],
                ["id", "invalid"],
                ["active", "false"],
            ]),
            input("areas/inactive.md", [
                ["type", "area"],
                ["id", "inactive"],
                ["active", false],
            ]),
            input("programs/active.md", [
                ["type", "program"],
                ["id", "active-program"],
                ["area", "inactive"],
                ["state", "active"],
            ]),
            project("projects/active-one.md", "active-one", "inactive", "active-program", "done"),
            project("projects/active-two.md", "active-two", "inactive", "active-program", "planned"),
            project("projects/active-project.md", "active-project", "inactive", null, "active"),
            input("tasks/active.md", [
                ["type", "task"],
                ["level", "area"],
                ["anchor", "inactive"],
                ["state", "active"],
            ]),
            input("programs/under.md", [
                ["type", "program"],
                ["id", "under"],
                ["area", "work"],
                ["state", "active"],
            ]),
            project("projects/under-one.md", "under-one", "work", "under", "planned"),
            input("programs/done.md", [
                ["type", "program"],
                ["id", "done-program"],
                ["area", "work"],
                ["state", "done"],
            ]),
            project("projects/done-one.md", "done-one", "work", "done-program", "active"),
            project("projects/done-two.md", "done-two", "work", "done-program", "planned"),
            input("projects/invalid-state.md", [
                ["type", "project"],
                ["id", "bad"],
                ["area", "work"],
                ["state", "Bad"],
            ]),
        ]);

        // Require the exact Doctor group order.
        expect(result.diagnostics.map((entry) => entry.group)).toEqual([
            "Unresolved anchors",
            "Invalid states",
            "Invalid area activity",
            "Inactive areas with active projects",
            "Inactive areas with active programs",
            "Inactive areas with active tasks",
            "Underfilled programs",
            "Finished programs with active projects",
        ]);
    });

    it("emits scan findings in group and source path order", () => {
        // Derive two invalid state findings and one unresolved anchor.
        const result: TestGraphBuild = buildGraph([
            input("z/project.md", [
                ["type", "project"],
                ["id", "zeta"],
                ["area", "work"],
                ["state", "Unknown"],
            ]),
            input("a/project.md", [
                ["type", "project"],
                ["id", "alpha"],
                ["area", "work"],
                ["state", "Active"],
            ]),
            input("m/unanchored.md", [["type", "note"]]),
        ]);

        // Require unresolved findings before invalid state findings.
        expect(
            result.diagnostics.map(
                (entry) => [entry.group, entry.paths[0]],
            ),
        ).toEqual([
            ["Unresolved anchors", "m/unanchored.md"],
            ["Invalid states", "a/project.md"],
            ["Invalid states", "z/project.md"],
        ]);
    });

    it("orders every input phase by code-unit source path", () => {
        // Derive diagnostics from inputs whose paths sort differently by locale.
        const result: TestGraphBuild = buildGraph([
            input("z/unanchored.md", [["type", "note"]]),
            input("A/unanchored.md", [["type", "note"]]),
            input("ä/unanchored.md", [["type", "note"]]),
        ]);

        // Require the code-unit order used for stable output.
        expect(result.diagnostics.map((entry) => entry.paths[0])).toEqual([
            "A/unanchored.md",
            "z/unanchored.md",
            "ä/unanchored.md",
        ]);
    });

    it("serializes multiple areas with fixed field and key order", () => {
        // Derive a graph with two areas, one program, and several projects.
        const result: TestGraphBuild = buildGraph([
            area("areas/home.md", "home"),
            area("areas/work.md", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
            project("projects/chores.md", "chores", "home"),
            project("projects/gamma.md", "gamma", "work"),
        ]);

        // Require the exact generated JSON text.
        expect(result.graph.toJson()).toBe(
            '{\n    "home": {\n        "projects": [\n            "chores"\n        ],\n        "programs": {}\n    },\n    "work": {\n        "projects": [\n            "gamma"\n        ],\n        "programs": {\n            "phd": {\n                "projects": [\n                    "alpha",\n                    "beta"\n                ]\n            }\n        }\n    }\n}\n',
        );
    });

    it("keeps a __proto__ area key in the direct JSON projection", () => {
        // Derive a graph whose area identifier is the prototype key.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "__proto__"),
        ]);

        // Parse the generated text into the documented projection shape.
        const parsed: Record<string, ParsedArea> = JSON.parse(result.graph.toJson());

        // Require the area key to be an own projection entry.
        expect(Object.keys(parsed)).toEqual(["__proto__"]);

        // Require the area's direct project and empty program map.
        expect(parsed["__proto__"]).toEqual({
            projects: ["alpha"],
            programs: {},
        });
    });

    it("keeps a __proto__ program key in the direct JSON projection", () => {
        // Derive a graph whose program identifier is the prototype key.
        const result: TestGraphBuild = buildGraph([
            project("projects/alpha.md", "alpha", "work", "__proto__"),
            project("projects/beta.md", "beta", "work", "__proto__"),
        ]);

        // Parse the generated text into the documented projection shape.
        const parsed: Record<string, ParsedArea> = JSON.parse(result.graph.toJson());

        // Require the area key to be an own projection entry.
        expect(Object.keys(parsed)).toEqual(["work"]);

        // Read the area's program record from the parsed projection.
        const programs: Record<string, ParsedProgram> | undefined = parsed["work"]?.programs;

        // Require the program key to be an own projection entry.
        expect(Object.keys(programs ?? {})).toEqual(["__proto__"]);

        // Require the program's coordinated projects.
        expect(programs?.["__proto__"]).toEqual({
            projects: ["alpha", "beta"],
        });
    });
});
