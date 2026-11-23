import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/constants";
import { SettingsReader } from "../../src/settings/settings";
import type { CommitmentSettings } from "../../src/settings/settings";


/** One settings reader shared by every case in this file. */
const reader: SettingsReader = new SettingsReader();


describe("commitment settings", () => {
    it("defaults to JSON and empty creation settings without stored data", () => {
        // Require the complete default shape.
        expect(reader.read(null)).toEqual(CONFIG.DEFAULT_SETTINGS);
        expect(reader.read(undefined)).toEqual(CONFIG.DEFAULT_SETTINGS);
        expect(reader.read("tree")).toEqual(CONFIG.DEFAULT_SETTINGS);
    });

    it("loads the nested presentation and creation shape", () => {
        // Read a complete nested value.
        const settings: CommitmentSettings = reader.read({
            presentation: { mode: "tree", sort: "count" },
            creation: {
                idStyle: "none",
                area: {
                    templatePath: "Templates/area.md",
                    folderPath: "Commitments/Areas",
                    pattern: "Area - {{id}}",
                },
                program: {
                    templatePath: "Templates/program.md",
                    folderPath: "Commitments/Programs",
                    pattern: "Program - {{id}}",
                },
                project: {
                    templatePath: "Templates/project.md",
                    folderPath: "Commitments/Projects",
                    pattern: "Project - {{id}}",
                },
            },
        });

        // Require the nested values unchanged.
        expect(settings).toEqual({
            presentation: {
                mode: "tree",
                sort: "count",
                treeDefaults: CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            },
            appearance: CONFIG.DEFAULT_SETTINGS.appearance,
            creation: {
                idStyle: "none",
                area: {
                    templatePath: "Templates/area.md",
                    folderPath: "Commitments/Areas",
                    pattern: "Area - {{id}}",
                },
                program: {
                    templatePath: "Templates/program.md",
                    folderPath: "Commitments/Programs",
                    pattern: "Program - {{id}}",
                },
                project: {
                    templatePath: "Templates/project.md",
                    folderPath: "Commitments/Projects",
                    pattern: "Project - {{id}}",
                },
            },
        });
    });

    it("defaults the pattern and style for stored data that lacks them", () => {
        // Read a pre-feature object with no pattern or style.
        const settings: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "", folderPath: "" },
                project: { templatePath: "", folderPath: "" },
            },
        });

        // Require the shipped defaults per kind and the exact-id style.
        expect(settings.creation.idStyle).toBe("none");
        expect(settings.creation.area.pattern).toBe("Area - {{id}}");
        expect(settings.creation.project.pattern).toBe("Project - {{id}}");
        expect(settings.creation.program.pattern).toBe("Program - {{id}}");
    });

    it("keeps stored patterns and styles and rejects malformed ones", () => {
        // Read a stored custom pattern with an unknown style and a blank pattern.
        const settings: CommitmentSettings = reader.read({
            creation: {
                idStyle: "titleCase",
                area: { templatePath: "", folderPath: "", pattern: "Area: {{id}}" },
                program: { templatePath: "", folderPath: "", pattern: "   " },
            },
        });

        // Require the stored pattern to survive unchanged.
        expect(settings.creation.area.pattern).toBe("Area: {{id}}");
        expect(settings.creation.idStyle).toBe("titleCase");

        // Require a blank pattern to fall back to the kind's default.
        expect(settings.creation.program.pattern).toBe("Program - {{id}}");

        // Require an unknown style to fall back to the default.
        expect(reader.read({
            creation: { idStyle: "shouty" },
        }).creation.idStyle).toBe("none");

        // Require a non-text pattern to fall back to the kind's default.
        expect(reader.read({
            creation: { project: { pattern: 4 } },
        }).creation.project.pattern).toBe("Project - {{id}}");
    });

    it("ignores unknown kind keys and malformed creation values", () => {
        // Read a shape with an unknown kind and non-object values.
        const settings: CommitmentSettings = reader.read({
            creation: {
                meeting: { templatePath: "Templates/meeting.md", folderPath: "Meetings" },
                area: "not-an-object",
                program: { templatePath: 4, folderPath: [] },
            },
        });

        // Require only the known kinds with normalized values.
        expect(settings.creation).toEqual(CONFIG.DEFAULT_SETTINGS.creation);
    });

    it("treats empty and whitespace-only values as unset", () => {
        // Read padded empty strings.
        const settings: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "   ", folderPath: "\t" },
                project: { templatePath: "", folderPath: "" },
            },
        });

        expect(settings.creation.area).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Area - {{id}}",
        });
        expect(settings.creation.project).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Project - {{id}}",
        });
    });

    it("trims and normalizes nested vault paths", () => {
        // Read padded paths with repeated separators.
        const settings: CommitmentSettings = reader.read({
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
            pattern: "Area - {{id}}",
        });
    });

    it("drops traversal and absolute template and folder paths", () => {
        // Read every unsafe path shape.
        const settings: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "../escape.md", folderPath: "../escape" },
                program: { templatePath: "/absolute.md", folderPath: "/absolute" },
                project: { templatePath: "\\absolute.md", folderPath: "\\absolute" },
            },
        });

        // Require every unsafe value to become unset.
        expect(settings.creation).toEqual(CONFIG.DEFAULT_SETTINGS.creation);

        // Drop drive-letter and UNC paths as well.
        const windows: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "C:\\vault\\area.md", folderPath: "D:/Areas" },
                program: { templatePath: "\\\\server\\share\\program.md", folderPath: "//server/share" },
            },
        });
        expect(windows.creation.area).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Area - {{id}}",
        });
        expect(windows.creation.program).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Program - {{id}}",
        });

        // Drop an embedded traversal segment.
        const embedded: CommitmentSettings = reader.read({
            creation: {
                project: { templatePath: "Templates/../project.md", folderPath: "Commitments/../Projects" },
            },
        });
        expect(embedded.creation.project).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Project - {{id}}",
        });
    });

    it("normalizes current-directory segments before rejecting rooted paths", () => {
        // Require a dot-prefixed drive path to be dropped.
        const drive: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "./C:/vault/area.md", folderPath: "./C:/vault" },
            },
        });
        expect(drive.creation.area).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Area - {{id}}",
        });

        // Require a dot-prefixed UNC path to be dropped.
        const unc: CommitmentSettings = reader.read({
            creation: {
                area: { templatePath: "./\\server\\share\\area.md", folderPath: "./\\server\\share" },
            },
        });
        expect(unc.creation.area).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Area - {{id}}",
        });

        // Require an interior dot segment to be removed.
        const interior: CommitmentSettings = reader.read({
            creation: {
                program: { templatePath: "Templates/./program.md", folderPath: "a/./b" },
            },
        });
        expect(interior.creation.program).toEqual({
            templatePath: "Templates/program.md",
            folderPath: "a/b",
            pattern: "Program - {{id}}",
        });

        // Require a path made only of a dot segment to be unset.
        const dot: CommitmentSettings = reader.read({
            creation: {
                project: { templatePath: ".", folderPath: "./" },
            },
        });
        expect(dot.creation.project).toEqual({
            templatePath: "",
            folderPath: "",
            pattern: "Project - {{id}}",
        });
    });

    it("loads appearance colors and falls back for malformed values", () => {
        // Read one normalized override and unsupported values.
        const settings: CommitmentSettings = reader.read({
            appearance: {
                area: " #Aa00Ff ",
                program: "amber",
                project: 4,
                meeting: "#ffffff",
            },
        });

        // Require the valid color and the program default.
        expect(settings.appearance).toEqual({
            area: "#aa00ff",
            program: CONFIG.DEFAULT_SETTINGS.appearance.program,
        });
    });

    it("loads tree defaults and normalizes each state selection", () => {
        // Read the shipped defaults when the field is absent.
        const defaults = CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults;
        expect(reader.read(null).presentation.treeDefaults).toEqual(defaults);
        expect(reader.read({
            presentation: { mode: "tree", sort: "name" },
        }).presentation.treeDefaults).toEqual(defaults);

        // Keep a valid subset in canonical order and an explicit empty selection.
        const custom: CommitmentSettings = reader.read({
            presentation: {
                treeDefaults: {
                    projectStates: ["done", "active", "done", "unknown"],
                    programStates: [],
                    hideInactiveAreas: true,
                },
            },
        });
        expect(custom.presentation.treeDefaults).toEqual({
            projectStates: ["active", "done"],
            programStates: [],
            hideInactiveAreas: true,
        });

        // Normalize each malformed field independently.
        const malformed: CommitmentSettings = reader.read({
            presentation: {
                treeDefaults: {
                    projectStates: ["bogus"],
                    programStates: "active",
                    hideInactiveAreas: "yes",
                },
            },
        });
        expect(malformed.presentation.treeDefaults).toEqual(defaults);

        // Keep one valid field when another field is missing.
        const partial: CommitmentSettings = reader.read({
            presentation: {
                treeDefaults: { projectStates: ["paused"] },
            },
        });
        expect(partial.presentation.treeDefaults).toEqual({
            projectStates: ["paused"],
            programStates: defaults.programStates,
            hideInactiveAreas: false,
        });
    });

    it("ignores unsupported nested presentation values", () => {
        // Require the supported mode and order to load unchanged.
        const stored: CommitmentSettings = reader.read({
            presentation: { mode: "tree", sort: "count" },
        });
        expect(stored.presentation).toEqual({
            mode: "tree",
            sort: "count",
            treeDefaults: CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
        });

        // Require unknown and malformed nested modes to fall back to JSON.
        expect(reader.read({ presentation: { mode: "xml" } }).presentation.mode).toBe("json");
        expect(reader.read({ presentation: { mode: 1 } }).presentation.mode).toBe("json");
        expect(reader.read({ presentation: { mode: null } }).presentation.mode).toBe("json");

        // Require unknown and malformed sorts to fall back to name order.
        expect(reader.read({ presentation: { sort: "largest" } }).presentation.sort).toBe("name");
        expect(reader.read({ presentation: { sort: 1 } }).presentation.sort).toBe("name");
        expect(reader.read({ presentation: { sort: null } }).presentation.sort).toBe("name");
    });
});
