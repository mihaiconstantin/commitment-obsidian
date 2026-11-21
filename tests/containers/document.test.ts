import { describe, expect, it } from "vitest";

import { ContainerDocumentComposer } from "../../src/containers/container-document";
import type { MomentFormatter } from "../../src/containers/container-document";
import type { ContainerIdentity } from "../../src/graph/types";


/** Return a readable marker for every requested moment pattern. */
const format: MomentFormatter = (pattern: string): string => `[${pattern}]`;


/** Compose documents through the one test instance. */
const composer: ContainerDocumentComposer = new ContainerDocumentComposer();


/** Build one identity for composition tests. */
function identity(
    kind: "area" | "program" | "project",
    id: string,
    area: string = "work",
    program: string | null = null,
): ContainerIdentity {
    return { kind, id, area, program };
}


describe("container document", () => {
    it("overrides the identity and keeps other keys and comments", () => {
        // Compose from a template with conflicting identity fields and comments.
        const text: string = composer.compose(
            "---\n# top\ntype: note # keep\nid: old\narea: old\nstatus: planning\n# below\n---\nBody.\n",
            identity("project", "alpha"),
            format,
        );

        // Require the plugin-owned identity.
        expect(text).toContain("type: project # keep");
        expect(text).toContain("id: alpha");
        expect(text).toContain("area: work");
        expect(text).not.toContain("type: note");
        expect(text).not.toContain("id: old");

        // Require unrelated keys and comments to survive.
        expect(text).toContain("# top");
        expect(text).toContain("# below");
        expect(text).toContain("status: planning");
        expect(text).toContain("state: active");
        expect(text).toContain("Body.\n");
    });

    it("omits the program for a direct project and deletes a stale template value", () => {
        // Compose a direct project from a template with a stale program.
        const text: string = composer.compose(
            "---\ntype: project\nid: old\narea: old\nprogram: stale\n---\n",
            identity("project", "alpha"),
            format,
        );

        // Require no program field.
        expect(text).not.toMatch(/^program:/m);
        expect(text).toContain("state: active");
    });

    it("sets the enclosing program for a coordinated project", () => {
        // Compose a coordinated project.
        const text: string = composer.compose(
            "---\ntype: project\nid: old\narea: old\nprogram: stale\n---\n",
            identity("project", "alpha", "work", "phd"),
            format,
        );

        // Require the current program value.
        expect(text).toContain("program: phd");
        expect(text).not.toContain("program: stale");
    });

    it("deletes a stale area and program from an area template", () => {
        // Compose an area from a template that carries stale relationship fields.
        const text: string = composer.compose(
            "---\ntype: project\nid: old\narea: old\nprogram: stale\n---\n",
            identity("area", "work"),
            format,
        );

        // Require the area identity and no owning area or program field.
        expect(text).toContain("type: area");
        expect(text).toContain("id: work");
        expect(text).not.toMatch(/^area:/m);
        expect(text).not.toMatch(/^program:/m);
    });

    it("preserves an explicit state", () => {
        // Compose from a template with a paused state.
        const text: string = composer.compose(
            "---\ntype: project\nid: old\narea: old\nstate: paused\n---\n",
            identity("project", "alpha"),
            format,
        );

        // Require the template state and no default.
        expect(text).toContain("state: paused");
        expect(text).not.toContain("state: active");
    });

    it("defaults an empty state value and a null state value", () => {
        // Compose from the shipped program template spelling.
        const empty: string = composer.compose(
            "---\ntype: program\nid:\narea:\nstate:\n---\n",
            identity("program", "phd"),
            format,
        );
        expect(empty).toContain("state: active");
        expect(empty).not.toMatch(/^state:\s*$/m);

        // Compose from an explicit null state.
        const nullState: string = composer.compose(
            "---\ntype: project\nid:\narea:\nstate: null\n---\n",
            identity("project", "alpha"),
            format,
        );
        expect(nullState).toContain("state: active");
    });

    it("never writes an owning area field into an area document", () => {
        // Compose an area from the shipped template spelling, which has no area field.
        const shipped: string = composer.compose(
            "---\ntype: area\nid:\nactive:\ngroup:\n---\n\n## Scope and Standard\n",
            identity("area", "teaching"),
            format,
        );
        expect(shipped).toContain("type: area");
        expect(shipped).toContain("id: teaching");
        expect(shipped).toContain("active: true");
        expect(shipped).not.toMatch(/^area:/m);

        // Compose an area without any template.
        const bare: string = composer.compose("", identity("area", "teaching"), format);
        expect(bare).toContain("type: area");
        expect(bare).toContain("id: teaching");
        expect(bare).not.toMatch(/^area:/m);

        // Require both relationship fields on the kinds that own them.
        const program: string = composer.compose(
            "---\ntype: program\nid:\narea:\nstate:\n---\n",
            identity("program", "phd"),
            format,
        );
        expect(program).toContain("area: work");

        // Require the coordinate area on a project.
        const project: string = composer.compose(
            "---\ntype: project\nid:\narea:\nprogram:\nstate:\n---\n",
            identity("project", "thesis", "work", "phd"),
            format,
        );
        expect(project).toContain("area: work");
        expect(project).toContain("program: phd");
    });

    it("defaults the area active flag only when it has no value", () => {
        // Compose an area from a template without active.
        const absent: string = composer.compose(
            "---\ntype: area\nid:\ngroup:\n---\n",
            identity("area", "work"),
            format,
        );
        expect(absent).toContain("active: true");
        expect(absent).not.toMatch(/^state:/m);

        // Compose an area from the shipped empty active spelling.
        const empty: string = composer.compose(
            "---\ntype: area\nid:\nactive:\n---\n",
            identity("area", "work"),
            format,
        );
        expect(empty).toContain("active: true");
        expect(empty).not.toMatch(/^state:/m);

        // Keep an explicit false flag untouched.
        const explicit: string = composer.compose(
            "---\ntype: area\nid:\nactive: false\n---\n",
            identity("area", "work"),
            format,
        );
        expect(explicit).toContain("active: false");
        expect(explicit).not.toContain("active: true");
    });

    it("does not add the area active flag to programs or projects", () => {
        // Compose a program and a project from templates without active.
        const program: string = composer.compose(
            "---\ntype: program\nid:\narea:\nstate:\n---\n",
            identity("program", "phd"),
            format,
        );
        const project: string = composer.compose(
            "---\ntype: project\nid:\narea:\nstate:\n---\n",
            identity("project", "alpha"),
            format,
        );

        // Require no active key on either kind.
        expect(program).not.toMatch(/^active:/m);
        expect(project).not.toMatch(/^active:/m);

        // Require the state default on both kinds.
        expect(program).toContain("state: active");
        expect(project).toContain("state: active");
    });

    it("substitutes a date placeholder inside frontmatter", () => {
        // Return a fixed date only for the default date pattern.
        const dateFormat: MomentFormatter = (pattern: string): string =>
            pattern === "YYYY-MM-DD" ? "2026-01-02" : `[${pattern}]`;

        // Compose a template with the date placeholder in frontmatter.
        const text: string = composer.compose(
            "---\ntype: project\nstart: {{date}}\n---\nBody.\n",
            identity("project", "alpha"),
            dateFormat,
        );

        // Require the substituted frontmatter value.
        expect(text).toContain("start: 2026-01-02");
    });

    it("substitutes every supported placeholder and leaves unknown braces literal", () => {
        // Compose a body-only template with every placeholder form.
        const text: string = composer.compose(
            "# {{title}}\n{{date}} {{time}} {{date:YYYY/MM}} {{time:HH:mm:ss}} {{unknown}}",
            identity("project", "alpha"),
            format,
        );

        // Require the identifier and the formatter results.
        expect(text).toContain("# alpha");
        expect(text).toContain("[YYYY-MM-DD] [HH:mm] [YYYY/MM] [HH:mm:ss] {{unknown}}");
    });

    it("emits a canonical block and blank line for a template without frontmatter", () => {
        // Compose a body-only template.
        const text: string = composer.compose("Body {{title}}\n", identity("project", "alpha"), format);

        // Require the canonical document.
        expect(text).toBe(
            "---\ntype: project\nid: alpha\narea: work\nstate: active\n---\n\nBody alpha\n",
        );
    });

    it("normalizes CRLF input without a trailing newline", () => {
        // Compose a CRLF template whose body has no final newline.
        const text: string = composer.compose(
            "---\r\ntype: note\r\nid: old\r\n---\r\n\r\nBody",
            identity("project", "alpha"),
            format,
        );

        // Require LF-only output and the preserved body text.
        expect(text).not.toContain("\r");
        expect(text.endsWith("Body")).toBe(true);
        expect(text).toContain("type: project");
    });

    it("emits only the canonical block for an empty template", () => {
        // Compose the empty template.
        const text: string = composer.compose("", identity("project", "alpha"), format);

        // Require the frontmatter block with no body separator.
        expect(text).toBe("---\ntype: project\nid: alpha\narea: work\nstate: active\n---\n");
    });

    it("rejects an invalid identifier, area, type, or program before parsing", () => {
        // Require a padded identifier to abort before template parsing.
        expect(() =>
            composer.compose("---\n- one\n- two\n---\n", identity("project", "alpha "), format),
        ).toThrowError(/invalid 'id'/);

        // Require a padded owning area to abort.
        expect(() => composer.compose("", identity("project", "alpha", "work "), format))
            .toThrowError(/invalid 'area'/);

        // Require an unsupported kind to abort.
        // @ts-expect-error The runtime guard rejects a kind outside the container types.
        expect(() => composer.compose("", identity("note", "alpha"), format))
            .toThrowError(/invalid 'type'/);

        // Require a padded project program to abort.
        expect(() =>
            composer.compose("", identity("project", "alpha", "work", "phd "), format),
        ).toThrowError(/invalid 'program'/);
    });

    it("rejects a program injected through a merge key", () => {
        // Compose a template whose merge key would write an empty program.
        expect(() =>
            composer.compose(
                "---\nbase: &base\n  program: \"\"\n<<: *base\n---\n",
                identity("project", "alpha"),
                format,
            ),
        ).toThrowError(/invalid 'program'/);
    });

    it("rejects an unresolvable merge source for any container kind", () => {
        // Require an area template with a non-map merge source to abort.
        expect(() =>
            composer.compose("---\n<<: 5\n---\n", identity("area", "work", "work"), format),
        ).toThrowError(/Merge sources/);
    });

    it("rejects invalid, non-mapping, and unterminated frontmatter", () => {
        // Require duplicate keys to abort.
        expect(() =>
            composer.compose(
                "---\ntype: project\ntype: area\n---\n",
                identity("project", "alpha"),
                format,
            ),
        ).toThrowError();

        // Require a non-mapping root to abort.
        expect(() =>
            composer.compose("---\n- one\n- two\n---\n", identity("project", "alpha"), format),
        ).toThrowError(/mapping/);

        // Require an unterminated block to abort.
        expect(() =>
            composer.compose("---\ntype: note\n", identity("project", "alpha"), format),
        ).toThrowError(/unterminated/);
    });
});
