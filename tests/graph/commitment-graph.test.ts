import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../../src/graph/builder";
import type { GraphResult } from "../../src/graph/commitment-graph";
import type { CanonicalInput, GraphArea } from "../../src/graph/types";


/** Build one graph and its diagnostics from canonical inputs. */
function buildGraph(inputs: readonly CanonicalInput[]): GraphResult {
    return new GraphBuilder(inputs).build();
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


const project = (
    path: string,
    id: string,
    areaId: string = "work",
    programId?: string | null,
): CanonicalInput => {
    const entries: Array<readonly [string, unknown]> = [
        ["type", "project"],
        ["id", id],
        ["area", areaId],
        ["state", "active"],
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
        failure: /Multiple area containers represent area identifier 'shared': 'a\/area\.md', 'b\/area\.md'\./,
    },
    {
        name: "rejects duplicate program containers with every path",
        inputs: [
            program("b/program.md", "shared", "work"),
            program("a/program.md", "shared", "work"),
        ],
        failure: /Multiple program containers represent program identifier 'shared': 'a\/program\.md', 'b\/program\.md'\./,
    },
    {
        name: "selects the lexicographically first duplicated identifier",
        inputs: [
            area("z/two.md", "zeta"),
            area("a/two.md", "shared"),
            area("z/one.md", "zeta"),
            area("a/one.md", "shared"),
        ],
        failure: /Multiple area containers represent area identifier 'shared': 'a\/one\.md', 'a\/two\.md'\./,
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
        failure: /Multiple area containers represent area identifier 'zulu': 'z\/one\.md', 'z\/two\.md'\./,
    },
    {
        name: "reports program duplicates before project duplicates",
        inputs: [
            project("a/two.md", "aardvark"),
            project("a/one.md", "aardvark"),
            program("z/two.md", "zeta", "work"),
            program("z/one.md", "zeta", "work"),
        ],
        failure: /Multiple program containers represent program identifier 'zeta': 'z\/one\.md', 'z\/two\.md'\./,
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
                projects: ["shared"],
                programs: [{ id: "shared", projects: [] }],
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
                projects: ["repeat", "repeat"],
                programs: [],
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
        failure: /Canonical project container 'z\/missing\.md' is missing required field 'id'\./,
    },
];

describe("commitment graph", () => {
    it("derives containerless areas and programs", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
            project("projects/gamma.md", "gamma", "work"),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                projects: ["gamma"],
                programs: [{ id: "phd", projects: ["alpha", "beta"] }],
            },
        ]);
        expect(result.graph.toJson()).toBe(
            '{\n    "work": {\n        "projects": [\n            "gamma"\n        ],\n        "programs": {\n            "phd": {\n                "projects": [\n                    "alpha",\n                    "beta"\n                ]\n            }\n        }\n    }\n}\n',
        );
    });

    it("keeps container-only areas and programs", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            area("areas/empty.md", "empty"),
            program("programs/phd.md", "phd", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            project("projects/beta.md", "beta", "work", "phd"),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas().map((entry) => entry.id)).toEqual(["empty", "work"]);
    });

    it("indexes explicit container paths and leaves implicit ones absent", () => {
        // Derive a graph with explicit area and project containers.
        const result: GraphResult = buildGraph([
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
        const result: GraphResult = buildGraph([
            input("meetings/standup.md", [
                ["type", "meeting"],
                ["level", "area"],
                ["anchor", "work-tiu"],
                ["scheduled", "2026-02-26"],
            ]),
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.graph.getAreas()).toEqual([{ id: "work-tiu", projects: [], programs: [] }]);
    });

    it("treats missing and null project programs as direct", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
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
            { id: "work", projects: ["missing", "null-program"], programs: [] },
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
                /invalid 'program' value/,
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
        const result: GraphResult = buildGraph(testCase.inputs);
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
            /Multiple project containers represent project identifier 'shared': 'a\/project\.md', 'b\/project.md'\./,
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
            /Multiple project containers represent project identifier 'shared': 'a\/project\.md', 'b\/project\.md', 'c\/project\.md'\./,
        );
    });

    it("keeps the same text at different concept levels distinct", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            area("areas/shared.md", "shared"),
            project("projects/shared.md", "shared", "shared"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            { id: "shared", projects: ["shared"], programs: [] },
        ]);
    });

    it("rejects contradictory program areas", () => {
        // Require the documented failure.
        expect(() =>
            buildGraph([
                project("projects/alpha.md", "alpha", "work", "phd"),
                project("projects/beta.md", "beta", "personal", "phd"),
            ]),
        ).toThrowError(/conflicting area declarations: 'personal', 'work'/);
    });

    it("warns for underfilled programs and keeps them", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            project("projects/alpha.md", "alpha", "work", "phd"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                projects: [],
                programs: [{ id: "phd", projects: ["alpha"] }],
            },
        ]);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]).toMatchObject({
            code: "underfilled_program",
            paths: ["projects/alpha.md"],
            actual: 1,
            required: 2,
        });
    });

    it("warns for an empty program container", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([program("programs/phd.md", "phd", "work")]);

        expect(result.diagnostics[0]).toMatchObject({
            code: "underfilled_program",
            actual: 0,
            required: 2,
        });
    });

    it("omits unresolved support anchors with diagnostics", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
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
            { id: "work", projects: ["alpha"], programs: [] },
        ]);
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                code: "unresolved_anchor",
                paths: ["notes/unanchored.md"],
            }),
            expect.objectContaining({
                code: "unresolved_anchor",
                paths: ["meetings/missing.md"],
            }),
        ]);
    });

    it("resolves supports to known areas, programs, and projects", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
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
        const result: GraphResult = buildGraph([
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

    it("does not filter by state values", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            input("projects/done.md", [
                ["type", "project"],
                ["id", "done"],
                ["area", "work"],
                ["state", "done"],
            ]),
        ]);

        expect(result.graph.getAreas()).toEqual([
            { id: "work", projects: ["done"], programs: [] },
        ]);
    });

    it("rejects missing area and project structures", () => {
        // Require the documented failure.
        expect(() =>
            buildGraph([
                input("projects/missing.md", [["type", "project"], ["area", "work"]]),
            ]),
        ).toThrowError(/missing required field 'id'/);
        expect(() =>
            buildGraph([
                input("projects/no-area.md", [["type", "project"], ["id", "alpha"]]),
            ]),
        ).toThrowError(/missing required field 'area'/);
        expect(() =>
            buildGraph([
                input("areas/no-id.md", [["type", "area"], ["active", true]]),
            ]),
        ).toThrowError(/missing required field 'id'/);
    });

    it("rejects padded and whitespace-only identifiers", () => {
        // Check every rejected value.
        for (const identifier of [" padded", "padded ", "   ", ""]) {
            expect(() =>
                buildGraph([project("projects/bad.md", identifier)]),
            ).toThrowError(/invalid 'id' value/);
        }
    });

    it("accepts a zero-width no-break space inside an identifier", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            project("projects/bom.md", "a\uFEFFb"),
        ]);

        expect(result.graph.getAreas()[0]?.projects).toEqual(["a\uFEFFb"]);
    });

    it("sorts areas, programs, and projects by code unit", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
            project("projects/two.md", "10"),
            project("projects/one.md", "9"),
            project("projects/p.md", "\u{1F600}", "work", "10"),
            project("projects/q.md", "b", "work", "9"),
        ]);

        expect(result.graph.getAreas()).toEqual([
            {
                id: "work",
                projects: ["10", "9"],
                programs: [
                    { id: "10", projects: ["\u{1F600}"] },
                    { id: "9", projects: ["b"] },
                ],
            },
        ]);
    });

    it("orders supplementary-character areas and programs by code unit", () => {
        // Derive the graph from the canonical inputs.
        const result: GraphResult = buildGraph([
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

    it("emits classification, program, then support diagnostics in that order", () => {
        // Derive a graph whose inputs produce one warning in every phase.
        const result: GraphResult = buildGraph([
            // Add a support container with no usable anchor, classified in the read phase.
            input("z/no-anchor.md", [["type", "meeting"]]),
            // Add a program that coordinates one project, which is underfilled.
            program("programs/phd.md", "phd", "work"),
            project("projects/alpha.md", "alpha", "work", "phd"),
            // Anchor to an absent project, resolved only after the graph exists.
            input("a/unanchored.md", [["type", "note"], ["level", "project"], ["anchor", "ghost"]]),
        ]);

        // Require the phase order: classification, program, then pending support.
        expect(result.diagnostics.map((entry) => entry.code)).toEqual([
            "unresolved_anchor",
            "underfilled_program",
            "unresolved_anchor",
        ]);

        // Require each diagnostic to name its own source path.
        expect(result.diagnostics.map((entry) => entry.paths[0])).toEqual([
            "z/no-anchor.md",
            "programs/phd.md",
            "a/unanchored.md",
        ]);
    });

    it("orders every input phase by code-unit source path", () => {
        // Derive diagnostics from inputs whose paths sort differently by locale.
        const result: GraphResult = buildGraph([
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
        const result: GraphResult = buildGraph([
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
        const result: GraphResult = buildGraph([
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
        const result: GraphResult = buildGraph([
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
