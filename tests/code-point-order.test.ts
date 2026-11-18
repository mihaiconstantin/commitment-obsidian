import { describe, expect, it } from "vitest";
import { compareCodePoints } from "../src/code-point-order";

describe("code point ordering", () => {
    it("orders supplementary characters by code point, not UTF-16 unit", () => {
        // U+1F600 has a high surrogate below U+FFFD, so UTF-16 order differs.
        expect("\u{1F600}" < "\uFFFD").toBe(true);
        expect(compareCodePoints("\u{1F600}", "\uFFFD")).toBeGreaterThan(0);
        expect(compareCodePoints("\uFFFD", "\u{1F600}")).toBeLessThan(0);
    });

    it("orders a prefix before its extension and equal text as zero", () => {
        // Compare the ordered results.
        expect(compareCodePoints("a", "ab")).toBeLessThan(0);
        expect(compareCodePoints("ab", "a")).toBeGreaterThan(0);
        expect(compareCodePoints("same", "same")).toBe(0);
    });
});
