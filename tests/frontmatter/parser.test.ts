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
        expect(parsed.get("nested")).toEqual(new Map([["count", 2n]]));
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

    it("rejects a YAML version directive inside bounded frontmatter", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter("note.md", "---\n%YAML 1.1\n---\nflag: yes\n---\n"),
        ).toThrowError(/YAML directives cannot appear inside frontmatter/);
    });

    it("keeps quoted binary digits as text", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\nid: \"0b10\"\n---\n");
        expect(parsed.get("id")).toBe("0b10");
    });

    it("reads unquoted binary digits as a number", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter("note.md", "---\nid: 0b10\n---\n");
        expect(parsed.get("id")).toBe(2n);
    });

    it("resolves more than 100 aliases", () => {
        const aliases: string = Array.from({ length: 150 }, () => "*base").join(", ");
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "note.md",
            `---\nbase: &base alpha\nvalues: [${aliases}]\n---\n`,
        );
        expect(parsed.get("values")).toEqual(new Array(150).fill("alpha"));
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

    it("rejects a tagged canonical field", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter("bad.md", "---\nid: !custom alpha\n---\n"),
        ).toThrowError(/Unresolved tag '!custom' on canonical field 'id'/);
    });

    it("allows a tagged unrelated field", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "note.md",
            "---\ntitle: !custom hello\nid: alpha\n---\n",
        );
        expect(parsed.get("id")).toBe("alpha");
    });

    it("rejects an unresolved tag on a canonical field key", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter(
                "tagged-key.md",
                "---\n!foo type: project\nid: alpha\narea: work\n---\n",
            ),
        ).toThrowError(/Unresolved tag on canonical field key 'type'/);
    });

    it("rejects a tagged canonical value supplied by a merge", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter(
                "merged.md",
                "---\nbase: &base {id: alpha}\n<<: {id: !foo beta}\n---\n",
            ),
        ).toThrowError(/Unresolved tag '!foo' on canonical field 'id'/);
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

    it("ignores an unresolvable explicit tag on unrelated metadata", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "unrelated-tag.md",
            "---\ntitle: !!int abc\ntype: project\nid: alpha\n---\n",
        );
        expect(parsed.get("type")).toBe("project");
        expect(parsed.get("id")).toBe("alpha");
    });

    it("rejects an unresolvable explicit tag on a canonical field", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter(
                "canonical-tag.md",
                "---\ntype: project\nid: !!int abc\narea: work\n---\n",
            ),
        ).toThrowError(/Invalid explicit tag value on canonical field 'id'/);
    });

    it("rejects a hexadecimal explicit float", () => {
        // Require the documented failure.
        expect(() =>
            parseFrontmatter(
                "float.md",
                "---\ntype: meeting\nlevel: project\nanchor: !!float 0x10\n---\n",
            ),
        ).toThrowError(/Invalid explicit tag value on canonical field 'anchor'/);
    });

    it("keeps explicit string values as strings", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "explicit-str.md",
            "---\nid: !!str 3\ntype: project\n---\n",
        );
        expect(parsed.get("id")).toBe("3");
    });

    it("resolves explicit booleans, nulls, and timestamps", () => {
        // Parse the saved frontmatter.
        const parsed: ReadonlyMap<string, unknown> = parseFrontmatter(
            "explicit.md",
            "---\na: !!bool yes\nb: !!null foo\nc: !!timestamp 2026-01-01\n---\n",
        );
        expect(parsed.get("a")).toBe(true);
        expect(parsed.get("b")).toBeNull();
        expect(parsed.get("c")).toBe("2026-01-01");
    });
});
