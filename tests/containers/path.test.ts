import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/constants";
import { ContainerPathBuilder } from "../../src/containers/container-path";
import { IdStyleCatalog, type IdStyle } from "../../src/containers/file-name";
import type { ContainerIdentity } from "../../src/graph/types";


/** Supported styles used by the reader-gate cases. */
const styles: IdStyleCatalog = new IdStyleCatalog();


/** Build one project identity for path tests. */
function project(id: string): ContainerIdentity {
    return { kind: "project", id, area: "work", program: null };
}


/** Return the default file name for one identity. */
function fileName(identity: ContainerIdentity): string {
    return new ContainerPathBuilder().fileName(identity);
}


/** Return a file name for one identity, pattern, and style. */
function fileNameWith(identity: ContainerIdentity, pattern: string, style: IdStyle = CONFIG.DEFAULT_ID_STYLE): string {
    return new ContainerPathBuilder("", pattern, style).fileName(identity);
}


/** Return the sanitized segment for one identifier. */
function sanitize(id: string): string {
    return new ContainerPathBuilder().sanitize(id);
}


/** Return the vault path for one identity, folder, pattern, and style. */
function pathWith(identity: ContainerIdentity, folder: string, pattern: string = "", style: IdStyle = CONFIG.DEFAULT_ID_STYLE): string {
    return new ContainerPathBuilder(folder, pattern, style).path(identity);
}


describe("container path", () => {
    it("prefixes each container kind", () => {
        // Require the three readable prefixes.
        expect(fileName({ kind: "area", id: "work", area: "work", program: null })).toBe(
            "Area - work.md",
        );
        expect(fileName({ kind: "program", id: "phd", area: "work", program: null })).toBe(
            "Program - phd.md",
        );
        expect(fileName({ kind: "project", id: "alpha", area: "work", program: null })).toBe(
            "Project - alpha.md",
        );
    });

    it("sanitizes separators, illegal characters, and spaces", () => {
        // Replace each unsafe character and keep interior spaces.
        expect(sanitize("work:home/alpha")).toBe("work-home-alpha");
        expect(sanitize("a b")).toBe("a b");
        expect(sanitize("a<>:\"/\\|?*b")).toBe("a-b");
        expect(fileName(project("work:home/alpha"))).toBe("Project - work-home-alpha.md");
    });

    it("collapses replacement runs and trims trailing dots and spaces", () => {
        // Collapse adjacent replacement dashes and trailing dots.
        expect(sanitize("a///b")).toBe("a-b");
        expect(sanitize("alpha... ")).toBe("alpha");
        expect(sanitize("alpha...")).toBe("alpha");
    });

    it("joins a nested folder and uses the root for an empty folder", () => {
        // Require nested paths and the root default.
        expect(pathWith(project("alpha"), "Commitments/Projects")).toBe(
            "Commitments/Projects/Project - alpha.md",
        );
        expect(pathWith(project("alpha"), "")).toBe("Project - alpha.md");
        expect(pathWith(project("alpha"), "  ")).toBe("Project - alpha.md");
        expect(pathWith(project("alpha"), "Commitments//Projects/")).toBe(
            "Commitments/Projects/Project - alpha.md",
        );
    });

    it("defaults each kind to its own pattern", () => {
        // Require the shipped pattern per kind.
        expect(fileName(project("alpha"))).toBe("Project - alpha.md");
        expect(fileName({ kind: "area", id: "alpha", area: "alpha", program: null })).toBe(
            "Area - alpha.md",
        );
        expect(fileName({ kind: "program", id: "phd", area: "work", program: null })).toBe(
            "Program - phd.md",
        );

        // Require the default patterns to be the rendered defaults.
        expect(CONFIG.DEFAULT_PATTERNS.project).toBe("Project - {{id}}");
    });

    it("substitutes the identifier into a custom pattern", () => {
        // Require the pattern to control the whole basename.
        expect(fileNameWith(project("alpha"), "{{id}}", "none")).toBe("alpha.md");
        expect(fileNameWith(project("alpha"), "P: {{id}}", "none")).toBe("P- alpha.md");
        expect(pathWith(project("alpha"), "P", "{{id}}", "none")).toBe("P/alpha.md");
    });

    it("capitalizes the identifier for the title case style", () => {
        // Require title-case semantics without lowercasing the rest of a word.
        expect(styles.format("titleCase", "some-long-id")).toBe("Some Long Id");
        expect(styles.format("titleCase", "research")).toBe("Research");
        expect(styles.format("titleCase", "paper-bothering")).toBe("Paper Bothering");
        expect(styles.format("titleCase", "PhD-thing")).toBe("PhD Thing");
        expect(styles.format("titleCase", "über-cool")).toBe("Über Cool");

        // Require the exact identifier for the none style.
        expect(styles.format("none", "some-long-id")).toBe("some-long-id");

        // Require the pattern to render the styled identifier.
        expect(fileNameWith(project("some-long-id"), "P - {{id}}", "titleCase")).toBe(
            "P - Some Long Id.md",
        );
    });

    it("sanitizes the rendered pattern", () => {
        // Require separators from the identifier and the pattern to be replaced.
        expect(fileNameWith(project("work:home/alpha"), "{{id}}", "none")).toBe(
            "work-home-alpha.md",
        );
        expect(fileNameWith(project("alpha"), "{{id}}/sub", "none")).toBe("alpha-sub.md");

        // Require a pattern without the placeholder to stay a single basename.
        expect(fileNameWith(project("alpha"), "Every project", "none")).toBe("Every project.md");

        // Require an identifier containing a replacement pattern to stay literal.
        expect(fileNameWith(project("a$&b"), "P - {{id}}", "none")).toBe("P - a$&b.md");
        expect(fileNameWith(project("a$`b"), "P - {{id}}", "none")).toBe("P - a$`b.md");
    });

    it("falls back to the default pattern when the stored one is blank", () => {
        // Require blank patterns to render the default name.
        expect(fileNameWith(project("alpha"), "", "none")).toBe("Project - alpha.md");
        expect(fileNameWith(project("alpha"), "   ", "none")).toBe("Project - alpha.md");
    });

    it("rejects a pattern that cannot produce a file name", () => {
        // Require the existing error when the rendered basename is empty.
        expect(() => fileNameWith(project("alpha"), "...", "none")).toThrowError(
            /cannot produce a file name/,
        );
    });

    it("rejects an unknown style at the reader and accepts known ones", () => {
        // Require the reader to gate the persisted value.
        expect(styles.isStyle("none")).toBe(true);
        expect(styles.isStyle("titleCase")).toBe(true);
        expect(styles.isStyle("shouty")).toBe(false);
        expect(styles.isStyle(4)).toBe(false);
    });

    it("aborts when the sanitized identifier is empty", () => {
        // Require the empty sanitized name.
        expect(sanitize("...")).toBe("");
        expect(sanitize("   ")).toBe("");

        // Require the path derivation to reject the empty name.
        expect(() => fileName(project("..."))).toThrowError(/cannot produce a file name/);
        expect(() => pathWith(project("..."), "Projects")).toThrowError(/cannot produce a file name/);
    });
});
