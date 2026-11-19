import { describe, expect, it } from "vitest";
import { parseDocument, type Document } from "yaml";
import { createScalarTags, type YamlVersion } from "../../src/frontmatter/scalar-tags";


function parseValue(source: string, version: YamlVersion): unknown {
    const body: string = source.includes("\n") ? source : `x: ${source}\n`;
    const document: Document = parseDocument(body, {
        version,
        strict: true,
        uniqueKeys: true,
        stringKeys: false,
        merge: true,
        logLevel: "silent",
        customTags: createScalarTags(version),
    });
    return document.toJS({ mapAsMap: true, maxAliasCount: -1 }).get("x");
}

describe("YAML scalar tags", () => {
    it("reads binary, octal, decimal and hexadecimal integers", () => {
        // Check the parsed scalar values.
        expect(parseValue("0b10", "1.2")).toBe(2n);
        expect(parseValue("012", "1.2")).toBe(12n);
        expect(parseValue("0o10", "1.2")).toBe(8n);
        expect(parseValue("0x1F", "1.2")).toBe(31n);
        expect(parseValue("09", "1.2")).toBe(9n);
        expect(parseValue("1_0", "1.2")).toBe(10n);
    });

    it("keeps unquoted hexadecimal and binary identifiers numeric", () => {
        // Check the parsed scalar values.
        expect(typeof parseValue("0b10", "1.2")).toBe("bigint");
        expect(typeof parseValue("0x10", "1.2")).toBe("bigint");
    });

    it("reads decimal, exponent and dotted floats", () => {
        // Check the parsed scalar values.
        expect(parseValue("1.5", "1.2")).toBe(1.5);
        expect(parseValue("1e3", "1.2")).toBe(1000);
        expect(parseValue(".5", "1.2")).toBe(0.5);
        expect(parseValue("-.5", "1.2")).toBe(-0.5);
    });

    it("keeps date-like and timestamp values as text", () => {
        // Check the parsed scalar values.
        expect(parseValue("2026-01-01", "1.2")).toBe("2026-01-01");
        expect(parseValue("2026-01-01T10:20:30Z", "1.2")).toBe("2026-01-01T10:20:30Z");
    });

    it("follows YAML 1.1 resolver differences", () => {
        // Check the parsed scalar values.
        expect(parseValue("yes", "1.1")).toBe(true);
        expect(parseValue("012", "1.1")).toBe(10n);
        expect(parseValue("1:20", "1.1")).toBe(80n);
        expect(parseValue("yes", "1.2")).toBe("yes");
    });

    it("preserves quoted values as strings", () => {
        // Check the parsed scalar values.
        expect(parseValue('"0b10"', "1.2")).toBe("0b10");
        expect(parseValue("'012'", "1.1")).toBe("012");
    });
});
