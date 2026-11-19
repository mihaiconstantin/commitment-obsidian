import { describe, expect, it } from "vitest";

import { containerFileName, containerPath, sanitizeFileName } from "../../src/containers/container-path";
import type { ContainerIdentity } from "../../src/graph/types";


/** Build one project identity for path tests. */
function project(id: string): ContainerIdentity {
    return { kind: "project", id, area: "work", program: null };
}


describe("container path", () => {
    it("prefixes each container kind", () => {
        // Require the three readable prefixes.
        expect(containerFileName({ kind: "area", id: "work", area: "work", program: null })).toBe(
            "Area - work.md",
        );
        expect(containerFileName({ kind: "program", id: "phd", area: "work", program: null })).toBe(
            "Program - phd.md",
        );
        expect(containerFileName({ kind: "project", id: "alpha", area: "work", program: null })).toBe(
            "Project - alpha.md",
        );
    });

    it("sanitizes separators, illegal characters, and spaces", () => {
        // Replace each unsafe character and keep interior spaces.
        expect(sanitizeFileName("work:home/alpha")).toBe("work-home-alpha");
        expect(sanitizeFileName("a b")).toBe("a b");
        expect(sanitizeFileName("a<>:\"/\\|?*b")).toBe("a-b");
        expect(containerFileName(project("work:home/alpha"))).toBe("Project - work-home-alpha.md");
    });

    it("collapses replacement runs and trims trailing dots and spaces", () => {
        // Collapse adjacent replacement dashes and trailing dots.
        expect(sanitizeFileName("a///b")).toBe("a-b");
        expect(sanitizeFileName("alpha... ")).toBe("alpha");
        expect(sanitizeFileName("alpha...")).toBe("alpha");
    });

    it("joins a nested folder and uses the root for an empty folder", () => {
        // Require nested paths and the root default.
        expect(containerPath(project("alpha"), "Commitments/Projects")).toBe(
            "Commitments/Projects/Project - alpha.md",
        );
        expect(containerPath(project("alpha"), "")).toBe("Project - alpha.md");
        expect(containerPath(project("alpha"), "  ")).toBe("Project - alpha.md");
        expect(containerPath(project("alpha"), "Commitments//Projects/")).toBe(
            "Commitments/Projects/Project - alpha.md",
        );
    });

    it("aborts when the sanitized identifier is empty", () => {
        // Require the empty sanitized name.
        expect(sanitizeFileName("...")).toBe("");
        expect(sanitizeFileName("   ")).toBe("");

        // Require the path derivation to reject the empty name.
        expect(() => containerFileName(project("..."))).toThrowError(/no usable file name/);
        expect(() => containerPath(project("..."), "Projects")).toThrowError(/no usable file name/);
    });
});
