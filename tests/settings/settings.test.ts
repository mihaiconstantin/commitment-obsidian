import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, readCommitmentSettings } from "../../src/settings/settings";
import type { CommitmentSettings } from "../../src/settings/settings";


describe("commitment settings", () => {
    it("defaults to JSON and empty creation settings without stored data", () => {
        // Require the complete default shape.
        expect(readCommitmentSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(readCommitmentSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(readCommitmentSettings("html")).toEqual(DEFAULT_SETTINGS);
    });

    it("loads the legacy top-level presentation mode", () => {
        // Read both supported legacy modes and keep creation defaults.
        expect(readCommitmentSettings({ mode: "html" })).toEqual({
            ...DEFAULT_SETTINGS,
            presentation: { mode: "html" },
        });
        expect(readCommitmentSettings({ mode: "json" })).toEqual(DEFAULT_SETTINGS);
    });

    it("loads the nested presentation and creation shape", () => {
        // Read a complete nested value.
        const settings: CommitmentSettings = readCommitmentSettings({
            presentation: { mode: "html" },
            creation: {
                area: { templatePath: "Templates/area.md", folderPath: "Commitments/Areas" },
                program: { templatePath: "Templates/program.md", folderPath: "Commitments/Programs" },
                project: { templatePath: "Templates/project.md", folderPath: "Commitments/Projects" },
            },
        });

        // Require the nested values unchanged.
        expect(settings).toEqual({
            presentation: { mode: "html" },
            creation: {
                area: { templatePath: "Templates/area.md", folderPath: "Commitments/Areas" },
                program: { templatePath: "Templates/program.md", folderPath: "Commitments/Programs" },
                project: { templatePath: "Templates/project.md", folderPath: "Commitments/Projects" },
            },
        });
    });

    it("prefers the nested mode over the legacy mode", () => {
        // Read both shapes with different values.
        const settings: CommitmentSettings = readCommitmentSettings({
            mode: "json",
            presentation: { mode: "html" },
        });

        // Require the nested presentation.
        expect(settings.presentation.mode).toBe("html");
    });

    it("ignores unknown kind keys and malformed creation values", () => {
        // Read a shape with an unknown kind and non-object values.
        const settings: CommitmentSettings = readCommitmentSettings({
            creation: {
                meeting: { templatePath: "Templates/meeting.md", folderPath: "Meetings" },
                area: "not-an-object",
                program: { templatePath: 4, folderPath: [] },
            },
        });

        // Require only the known kinds with normalized values.
        expect(settings.creation).toEqual(DEFAULT_SETTINGS.creation);
    });

    it("treats empty and whitespace-only values as unset", () => {
        // Read padded empty strings.
        const settings: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: { templatePath: "   ", folderPath: "\t" },
                project: { templatePath: "", folderPath: "" },
            },
        });

        expect(settings.creation.area).toEqual({ templatePath: "", folderPath: "" });
        expect(settings.creation.project).toEqual({ templatePath: "", folderPath: "" });
    });

    it("trims and normalizes nested vault paths", () => {
        // Read padded paths with repeated separators.
        const settings: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: {
                    templatePath: "  Templates//area.md  ",
                    folderPath: "Commitments\\Areas",
                },
            },
        });

        expect(settings.creation.area).toEqual({
            templatePath: "Templates/area.md",
            folderPath: "Commitments/Areas",
        });
    });

    it("drops traversal and absolute template and folder paths", () => {
        // Read every unsafe path shape.
        const settings: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: { templatePath: "../escape.md", folderPath: "../escape" },
                program: { templatePath: "/absolute.md", folderPath: "/absolute" },
                project: { templatePath: "\\absolute.md", folderPath: "\\absolute" },
            },
        });

        // Require every unsafe value to become unset.
        expect(settings.creation).toEqual(DEFAULT_SETTINGS.creation);

        // Drop drive-letter and UNC paths as well.
        const windows: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: { templatePath: "C:\\vault\\area.md", folderPath: "D:/Areas" },
                program: { templatePath: "\\\\server\\share\\program.md", folderPath: "//server/share" },
            },
        });
        expect(windows.creation.area).toEqual({ templatePath: "", folderPath: "" });
        expect(windows.creation.program).toEqual({ templatePath: "", folderPath: "" });

        // Drop an embedded traversal segment.
        const embedded: CommitmentSettings = readCommitmentSettings({
            creation: {
                project: { templatePath: "Templates/../project.md", folderPath: "Commitments/../Projects" },
            },
        });
        expect(embedded.creation.project).toEqual({ templatePath: "", folderPath: "" });
    });

    it("normalizes current-directory segments before rejecting rooted paths", () => {
        // Require a dot-prefixed drive path to be dropped.
        const drive: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: { templatePath: "./C:/vault/area.md", folderPath: "./C:/vault" },
            },
        });
        expect(drive.creation.area).toEqual({ templatePath: "", folderPath: "" });

        // Require a dot-prefixed UNC path to be dropped.
        const unc: CommitmentSettings = readCommitmentSettings({
            creation: {
                area: { templatePath: "./\\server\\share\\area.md", folderPath: "./\\server\\share" },
            },
        });
        expect(unc.creation.area).toEqual({ templatePath: "", folderPath: "" });

        // Require an interior dot segment to be removed.
        const interior: CommitmentSettings = readCommitmentSettings({
            creation: {
                program: { templatePath: "Templates/./program.md", folderPath: "a/./b" },
            },
        });
        expect(interior.creation.program).toEqual({
            templatePath: "Templates/program.md",
            folderPath: "a/b",
        });

        // Require a path made only of a dot segment to be unset.
        const dot: CommitmentSettings = readCommitmentSettings({
            creation: {
                project: { templatePath: ".", folderPath: "./" },
            },
        });
        expect(dot.creation.project).toEqual({ templatePath: "", folderPath: "" });
    });

    it("ignores an unsupported nested or legacy presentation mode", () => {
        // Read unsupported and malformed modes.
        expect(readCommitmentSettings({ presentation: { mode: "tree" } }).presentation.mode).toBe("json");
        expect(readCommitmentSettings({ presentation: { mode: 1 }, mode: "html" }).presentation.mode).toBe("html");
        expect(readCommitmentSettings({ presentation: { mode: "html" }, mode: "json" }).presentation.mode).toBe("html");
    });
});
