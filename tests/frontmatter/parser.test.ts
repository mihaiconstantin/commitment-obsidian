import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/frontmatter/parser";

describe("frontmatter parser", () => {
    it("returns an empty mapping without frontmatter", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "Body text.\n");
        expect(parsed.size).toBe(0);
    });

    it("parses an empty frontmatter block as an empty mapping", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\n---\nBody.\n");
        expect(parsed.size).toBe(0);
    });

    it("keeps nested values and null distinctions", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "note.md",
            "---\ntitle: Example\nnested:\n  count: 2\nempty:\nvalue: null\n---\n",
        );
        expect(parsed.get("title")).toBe("Example");
        expect(parsed.get("nested")).toEqual(new Map([["count", 2]]));
        expect(parsed.has("empty")).toBe(true);
        expect(parsed.get("empty")).toBeNull();
        expect(parsed.get("value")).toBeNull();
    });

    it("rejects an unterminated frontmatter block", () => {
        // Require the documented failure.
        expect(() => parseFrontmatter("bad.md", "---\ntitle: Missing\n")).toThrowError(
            /Could not parse frontmatter in 'bad.md': unterminated frontmatter block/,
        );
    });

    it("rejects malformed YAML with its source path", () => {
        // Require the documented failure.
        expect(() => parseFrontmatter("bad.md", "---\nkey: [\n---\n")).toThrowError(
            /Could not parse frontmatter in 'bad\.md'/,
        );
    });

    it("rejects duplicate canonical keys", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter("bad.md", "---\ntype: project\ntype: area\n---\n"),
        ).toThrowError(/Could not parse frontmatter in 'bad\.md'/);
    });

    it("rejects a non-mapping root", () => {
        // Require the documented failure.
        expect(() => parseFrontmatter("bad.md", "---\n- item\n---\n")).toThrowError(
            /frontmatter must be a mapping/,
        );
    });

    it("keeps date-like values as text", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\ndate: 2026-01-01\n---\n");
        expect(parsed.get("date")).toBe("2026-01-01");
    });

    it("keeps quoted binary digits as text", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\nid: \"0b10\"\n---\n");
        expect(parsed.get("id")).toBe("0b10");
    });

    it("reads unquoted binary digits as text under the default schema", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\nid: 0b10\n---\n");
        expect(parsed.get("id")).toBe("0b10");
    });

    it("applies merge precedence with explicit keys winning", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "note.md",
            "---\ndefaults: &defaults\n  type: project\n  area: work\n<<: *defaults\nid: alpha\narea: personal\n---\n",
        );
        expect(parsed.get("type")).toBe("project");
        expect(parsed.get("area")).toBe("personal");
        expect(parsed.get("id")).toBe("alpha");
    });

    it("keeps prototype-like keys as ordinary data", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "note.md",
            "---\n__proto__: alpha\nconstructor: beta\n---\n",
        );
        expect(parsed.get("__proto__")).toBe("alpha");
        expect(parsed.get("constructor")).toBe("beta");
    });

    it("keeps text fields when other keys are not strings", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "mixed-keys.md",
            "---\n1: x\ntrue: y\n? [a, b]\n: z\ntype: project\nid: alpha\n---\n",
        );
        expect(parsed.get("type")).toBe("project");
        expect(parsed.get("id")).toBe("alpha");
        expect([...parsed.keys()].sort()).toEqual(["id", "type"]);
    });

    it("reports an unresolved alias with its source path", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter("alias.md", "---\nbase: *missing\n---\n"),
        ).toThrowError(/Could not parse frontmatter in 'alias\.md': Unresolved alias/);
    });

    it("allows a cyclic alias on an unrelated field", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "cyclic.md",
            "---\nloop: &loop [*loop]\ntype: project\nid: alpha\n---\n",
        );
        expect(parsed.get("type")).toBe("project");
        expect(parsed.get("id")).toBe("alpha");
    });
});
