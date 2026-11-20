import { describe, expect, it } from "vitest";

import { containerFileName, containerPath, sanitizeFileName } from "../../src/containers/container-path";
import { DEFAULT_PATTERNS, ID_STYLES, isIdStyle } from "../../src/containers/file-name";
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

    it("defaults each kind to its own pattern", () => {
        // Require the shipped pattern per kind.
        expect(containerFileName(project("alpha"))).toBe("Project - alpha.md");
        expect(containerFileName({ kind: "area", id: "alpha", area: "alpha", program: null })).toBe(
            "Area - alpha.md",
        );
        expect(containerFileName({ kind: "program", id: "phd", area: "work", program: null })).toBe(
            "Program - phd.md",
        );

        // Require the default patterns to be the rendered defaults.
        expect(DEFAULT_PATTERNS.project).toBe("Project - {{id}}");
    });

    it("substitutes the identifier into a custom pattern", () => {
        // Require the pattern to control the whole basename.
        expect(containerFileName(project("alpha"), "{{id}}", "none")).toBe("alpha.md");
        expect(containerFileName(project("alpha"), "P: {{id}}", "none")).toBe("P- alpha.md");
        expect(containerPath(project("alpha"), "P", "{{id}}", "none")).toBe("P/alpha.md");
    });

    it("capitalizes the identifier for the title case style", () => {
        // Require title-case semantics without lowercasing the rest of a word.
        expect(ID_STYLES.titleCase.format("some-long-id")).toBe("Some Long Id");
        expect(ID_STYLES.titleCase.format("research")).toBe("Research");
        expect(ID_STYLES.titleCase.format("paper-bothering")).toBe("Paper Bothering");
        expect(ID_STYLES.titleCase.format("PhD-thing")).toBe("PhD Thing");
        expect(ID_STYLES.titleCase.format("über-cool")).toBe("Über Cool");

        // Require the exact identifier for the none style.
        expect(ID_STYLES.none.format("some-long-id")).toBe("some-long-id");

        // Require the pattern to render the styled identifier.
        expect(containerFileName(project("some-long-id"), "P - {{id}}", "titleCase")).toBe(
            "P - Some Long Id.md",
        );
    });

    it("sanitizes the rendered pattern", () => {
        // Require separators from the identifier and the pattern to be replaced.
        expect(containerFileName(project("work:home/alpha"), "{{id}}", "none")).toBe(
            "work-home-alpha.md",
        );
        expect(containerFileName(project("alpha"), "{{id}}/sub", "none")).toBe("alpha-sub.md");

        // Require a pattern without the placeholder to stay a single basename.
        expect(containerFileName(project("alpha"), "Every project", "none")).toBe("Every project.md");

        // Require an identifier containing a replacement pattern to stay literal.
        expect(containerFileName(project("a$&b"), "P - {{id}}", "none")).toBe("P - a$&b.md");
        expect(containerFileName(project("a$`b"), "P - {{id}}", "none")).toBe("P - a$`b.md");
    });

    it("falls back to the default pattern when the stored one is blank", () => {
        // Require blank patterns to render the default name.
        expect(containerFileName(project("alpha"), "", "none")).toBe("Project - alpha.md");
        expect(containerFileName(project("alpha"), "   ", "none")).toBe("Project - alpha.md");
    });

    it("rejects a pattern that renders no usable name", () => {
        // Require the existing error when the rendered basename is empty.
        expect(() => containerFileName(project("alpha"), "...", "none")).toThrowError(
            /no usable file name/,
        );
    });

    it("rejects an unknown style at the reader and accepts known ones", () => {
        // Require the reader to gate the persisted value.
        expect(isIdStyle("none")).toBe(true);
        expect(isIdStyle("titleCase")).toBe(true);
        expect(isIdStyle("shouty")).toBe(false);
        expect(isIdStyle(4)).toBe(false);
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
