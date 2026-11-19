import { describe, expect, it } from "vitest";
import { serializeProjection } from "../../src/graph/projection-writer";
import type { GraphArea } from "../../src/graph/types";

describe("projection writer", () => {
    it("renders the empty graph with one newline", () => {
        // Compare the serialized JSON text.
        expect(serializeProjection([])).toBe("{}\n");
    });

    it("matches Python for direct projects and empty programs", () => {
        // Compose the area projection supplied to the writer.
        const areas: GraphArea[] = [
            { id: "work", projects: ["alpha", "beta"], programs: [] },
        ];
        expect(serializeProjection(areas)).toBe(
            '{\n    "work": {\n        "projects": [\n            "alpha",\n            "beta"\n        ],\n        "programs": {}\n    }\n}\n',
        );
    });

    it("matches Python for nested programs", () => {
        // Compose the sorted area projections supplied to the writer.
        const areas: GraphArea[] = [
            { id: "personal", projects: [], programs: [] },
            {
                id: "work",
                projects: ["gamma"],
                programs: [{ id: "phd", projects: ["alpha", "beta"] }],
            },
        ];
        expect(serializeProjection(areas)).toBe(
            '{\n    "personal": {\n        "projects": [],\n        "programs": {}\n    },\n    "work": {\n        "projects": [\n            "gamma"\n        ],\n        "programs": {\n            "phd": {\n                "projects": [\n                    "alpha",\n                    "beta"\n                ]\n            }\n        }\n    }\n}\n',
        );
    });

    it("keeps literal Unicode and escapes control characters", () => {
        // Compose the special-character identifiers supplied to the writer.
        const areas: GraphArea[] = [
            { id: "é", projects: ["a\u0001b"], programs: [] },
        ];
        expect(serializeProjection(areas)).toBe(
            '{\n    "é": {\n        "projects": [\n            "a\\u0001b"\n        ],\n        "programs": {}\n    }\n}\n',
        );
    });

    it("matches Python for prototype-safe keys and supplementary characters", () => {
        // Compose the representative projection supplied to the writer.
        const areas: GraphArea[] = [
            {
                id: "work",
                projects: ["__proto__", "gamma"],
                programs: [{ id: "phd", projects: ["alpha", "beta"] }],
            },
            { id: "\u00e9\u0001\u{1F600}", projects: [], programs: [] },
        ];
        // Python 3 reference: json.dumps(direct_projection(graph), ensure_ascii=False, indent=4) + "\n".
        expect(serializeProjection(areas)).toBe(
            '{\n    "work": {\n        "projects": [\n            "__proto__",\n            "gamma"\n        ],\n        "programs": {\n            "phd": {\n                "projects": [\n                    "alpha",\n                    "beta"\n                ]\n            }\n        }\n    },\n    "\u00e9\\u0001\u{1F600}": {\n        "projects": [],\n        "programs": {}\n    }\n}\n',
        );
    });

    it("keeps numeric-like keys in supplied code-point order", () => {
        // Compose numeric-looking area keys in code-point order.
        const areas: GraphArea[] = [
            { id: "10", projects: [], programs: [] },
            { id: "9", projects: [], programs: [] },
        ];
        expect(serializeProjection(areas)).toBe(
            '{\n    "10": {\n        "projects": [],\n        "programs": {}\n    },\n    "9": {\n        "projects": [],\n        "programs": {}\n    }\n}\n',
        );
    });

    it("serializes an unpaired surrogate as a JSON escape", () => {
        // Compose an identifier that Python cannot encode.
        const areas: GraphArea[] = [
            { id: "work", projects: ["a\ud800b"], programs: [] },
        ];
        // Python cannot encode this identifier; the JSON text keeps it escaped.
        expect(serializeProjection(areas)).toBe(
            '{\n    "work": {\n        "projects": [\n            "a\\ud800b"\n        ],\n        "programs": {}\n    }\n}\n',
        );
    });
});
