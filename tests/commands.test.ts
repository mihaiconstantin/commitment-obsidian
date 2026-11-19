import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { App, Notice, Setting } from "obsidian";
import { DEFAULT_SETTINGS, readCommitmentSettings } from "../src/settings/settings";
import type { CommitmentSettings } from "../src/settings/settings";
import CommitmentPlugin from "../src/main";
import { GRAPH_PATH } from "../src/graph/store";
import { FakeVault } from "./support/fake-vault";


const project = (id: string, area: string = "work"): string =>
    `---\ntype: project\nid: ${id}\narea: ${area}\nstate: active\n---\n\nBody.\n`;


async function createPlugin(
    files: Record<string, string> = { "projects/alpha.md": project("alpha") },
    storedData: unknown = null,
): Promise<{ plugin: CommitmentPlugin; app: App; vault: FakeVault }> {
    // Create the in-memory vault.
    const vault: FakeVault = new FakeVault(files);

    // Create the stub app over the vault.
    const app: App = new App(vault);

    // Compose the plugin over the stub app.
    const plugin: CommitmentPlugin = new CommitmentPlugin(app, {
        id: "commitment-graph",
        name: "Commitment",
        version: "0.1.0",
        minAppVersion: "1.5.7",
        description: "Test plugin",
        author: "Test",
        isDesktopOnly: false,
    });

    // Supply any stored plugin data before load.
    plugin.data = storedData;

    // Load the plugin to register its commands and settings.
    await plugin.onload();

    // Return the composed test boundaries.
    return { plugin, app, vault };
}


/** Return the rendered preformatted graph texts. */
function modalTexts(): string[] {
    // Read every rendered preformatted block.
    return Array.from(document.querySelectorAll("pre")).map(
        (element: Element): string => element.textContent ?? "",
    );
}

beforeEach(() => {
    // Reset the recorded notices, settings, and the document body.
    Notice.instances = [];
    Setting.instances = [];
    document.body.replaceChildren();
});

describe("commitment graph commands", () => {
    it("registers exactly the two requested command names", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();
        expect(plugin.commands.map((command) => command.name)).toEqual([
            "View graph",
            "Update graph",
        ]);
        expect(plugin.commands.map((command) => command.id)).toEqual([
            "view-graph",
            "update-graph",
        ]);
    });

    it("reports the readiness message before the layout is ready", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, vault } = await createPlugin();
        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();
        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Vault is still loading; try again",
        ]);
        expect(vault.calls.reads).toEqual([]);
    });

    it("shows the derived graph without writing", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual([
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        ]);
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.processes).toEqual([]);
        expect(vault.files.has(GRAPH_PATH)).toBe(false);
        expect(document.body.textContent).toContain("Graph from saved files");
    });

    it("shows warnings separately from the JSON", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin({
            "projects/alpha.md": project("alpha"),
            "projects/beta.md": project("beta"),
            "meetings/missing.md":
                "---\ntype: meeting\nlevel: project\nanchor: missing\nscheduled: 2026-02-26\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()[0]).not.toContain("missing");
        expect(document.body.textContent).toContain("Warnings");
        expect(document.body.textContent).toContain("meetings/missing.md");
    });

    it("registers the presentation settings tab", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();
        expect(plugin.settingTabs).toHaveLength(1);
    });

    it("presents JSON by default", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toHaveLength(1);
        expect(document.querySelector(".commitment-graph__tree-host")).toBeNull();
    });

    it("presents the tree when the stored setting selects HTML", async () => {
        // Compose the plugin over stored HTML settings.
        const { plugin, app } = await createPlugin(undefined, { mode: "html" });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(document.querySelector(".commitment-graph__tree-host")).not.toBeNull();
        expect(modalTexts()).toEqual([]);
    });

    it("shows the stored presentation in the settings tab", async () => {
        // Compose the plugin over stored tree settings.
        const { plugin } = await createPlugin(undefined, { mode: "html" });
        // Render the registered settings tab.
        plugin.settingTabs[0]?.display();

        // Read the rendered setting and its selected value.
        const container: HTMLElement = plugin.settingTabs[0]?.containerEl as HTMLElement;
        expect(container.textContent).toContain("Graph view");
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        expect(controls[0]?.value).toBe("html");

        // Drive the dropdown handler the way the settings UI does.
        controls[0]?.change?.("json");
        await Promise.resolve();
        expect(plugin.data).toEqual(DEFAULT_SETTINGS);
    });

    it("renders grouped creation fields and persists one without losing the others", async () => {
        // Compose the plugin over nested creation settings.
        const { plugin } = await createPlugin(undefined, {
            presentation: { mode: "html" },
            creation: {
                project: { templatePath: "Templates/project.md", folderPath: "Projects" },
            },
        });
        // Render the registered settings tab.
        plugin.settingTabs[0]?.display();

        // Require the General, Area, Program, and Project group headings.
        expect(
            Setting.instances.filter((setting) => setting.heading).map((setting) => setting.nameEl.textContent),
        ).toEqual(["General", "Area", "Program", "Project"]);

        // Require the style choice, then template, folder, and pattern per kind.
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        expect(controls.map((setting) => setting.value)).toEqual([
            "html",
            "none",
            "",
            "",
            "Area - {{id}}",
            "",
            "",
            "Program - {{id}}",
            "Templates/project.md",
            "Projects",
            "Project - {{id}}",
        ]);

        // Change the project folder through its text control.
        controls[9]?.change?.("Commitments/Projects");
        await Promise.resolve();

        // Require the complete normalized settings shape with the edited folder.
        expect(plugin.data).toEqual({
            presentation: { mode: "html" },
            creation: {
                idStyle: "none",
                area: { templatePath: "", folderPath: "", pattern: "Area - {{id}}" },
                program: { templatePath: "", folderPath: "", pattern: "Program - {{id}}" },
                project: {
                    templatePath: "Templates/project.md",
                    folderPath: "Commitments/Projects",
                    pattern: "Project - {{id}}",
                },
            },
        });
    });

    it("persists a presentation change for later commands", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();

        // Persist the tree presentation through the plugin surface.
        await plugin.saveSettings({ ...DEFAULT_SETTINGS, presentation: { mode: "html" } });
        expect(plugin.data).toEqual({ ...DEFAULT_SETTINGS, presentation: { mode: "html" } });

        // Persist JSON again and confirm the last write wins.
        await plugin.saveSettings(DEFAULT_SETTINGS);
        expect(plugin.data).toEqual(DEFAULT_SETTINGS);
    });

    it("normalizes settings through saveData and keeps existing data compatible", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();

        // Persist unsafe and padded creation values.
        const next: CommitmentSettings = {
            presentation: { mode: "html" },
            creation: {
                idStyle: "none",
                area: {
                    templatePath: " Templates/area.md ",
                    folderPath: "/absolute",
                    pattern: "Area - {{id}}",
                },
                program: {
                    templatePath: "../escape.md",
                    folderPath: "Programs",
                    pattern: "Program - {{id}}",
                },
                project: { templatePath: "", folderPath: "", pattern: "Project - {{id}}" },
            },
        };
        await plugin.saveSettings(next);

        // Require the normalized shape, with the default patterns filled in.
        expect(plugin.data).toEqual({
            presentation: { mode: "html" },
            creation: {
                idStyle: "none",
                area: { templatePath: "Templates/area.md", folderPath: "", pattern: "Area - {{id}}" },
                program: { templatePath: "", folderPath: "Programs", pattern: "Program - {{id}}" },
                project: { templatePath: "", folderPath: "", pattern: "Project - {{id}}" },
            },
        });

        // Require the saved data to read back as the same settings.
        expect(readCommitmentSettings(plugin.data)).toEqual(plugin.settings);
    });

    it("upgrades a legacy mode and round-trips the shipped shape through saveData", async () => {
        // Compose the plugin over legacy tree settings.
        const { plugin } = await createPlugin(undefined, { mode: "html" });
        expect(plugin.settings.presentation.mode).toBe("html");

        // Persist the upgraded value.
        await plugin.saveSettings(plugin.settings);

        // Require the shipped nested shape with the legacy mode preserved.
        expect(plugin.data).toEqual({
            ...DEFAULT_SETTINGS,
            presentation: { mode: "html" },
        });
        expect(readCommitmentSettings(plugin.data)).toEqual(plugin.settings);
    });

    it("writes identical graph bytes in tree mode", async () => {
        // Compose the plugin over stored tree settings.
        const { plugin, app, vault } = await createPlugin(undefined, { mode: "html" });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the update command.
        await plugin.commands[1]?.callback?.();

        // Require the same projection the JSON presentation shows.
        const written: unknown = vault.files.get(GRAPH_PATH);
        const text: string = typeof written === "string"
            ? written
            : new TextDecoder().decode(written as Uint8Array);
        expect(text).toBe(
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        );
    });

    it("shows a path-specific error and no modal for a blocking graph error", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin({
            "projects/alpha.md": "---\ntype: project\narea: work\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual([]);
        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Canonical project container 'projects/alpha.md' is missing required field 'id'.",
        ]);
    });

    it("shows the empty graph as {} plus a newline", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin({});
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual(["{}\n"]);
    });

    it("creates the graph and reports written on update", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Commitment graph written",
        ]);
        expect(vault.calls.creates).toEqual([GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(GRAPH_PATH))).toContain('"alpha"');
    });

    it("reports unchanged without writing identical output", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin({
            "projects/alpha.md": project("alpha"),
            [GRAPH_PATH]:
                '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Commitment graph unchanged",
        ]);
        expect(vault.calls.processes).toEqual([]);
    });

    it("writes no graph when a source changes during the build", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();
        // Capture the original vault method.
        const original = vault.read.bind(vault);
        let count: number = 0;
        vi.spyOn(vault, "read").mockImplementation(async (file) => {
            count += 1;
            const text: string = await original(file);
            if (count === 1) {
                // Change the saved vault state.
                vault.put("projects/late.md", project("late"));
            }
            return text;
        });

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances[0]?.message).toMatch(/Saved source 'projects\/late\.md' changed/);
        expect(vault.calls.creates).toEqual([]);
    });

    it("rejects an overlapping command with one busy notice", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();
        // Block vault reads until released.
        let release: () => void = () => undefined;
        const blocked: Promise<void> = new Promise<void>((resolve) => {
            release = resolve;
        });
        // Capture the original vault method.
        const original = vault.read.bind(vault);
        vi.spyOn(vault, "read").mockImplementation(async (file) => {
            await blocked;
            return original(file);
        });

        const first: unknown = plugin.commands[0]?.callback?.();
        const second: unknown = plugin.commands[0]?.callback?.();
        release();
        await Promise.all([first, second]);

        expect(Notice.instances.map((notice) => notice.message)).toContain(
            "A commitment graph command is already running",
        );
    });

    it("presents update warnings in the modal", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin({
            "projects/alpha.md": project("alpha", "work"),
            "programs/phd.md":
                "---\ntype: program\nid: phd\narea: work\nstate: active\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toContain(
            "Commitment graph written",
        );
        expect(document.body.textContent).toContain("Warnings");
        expect(document.body.textContent).toContain("Program identifier 'phd'");
    });

    it("does not write markdown during update", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();
        // Capture the saved Markdown text.
        const before: string = new TextDecoder().decode(vault.files.get("projects/alpha.md"));

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(new TextDecoder().decode(vault.files.get("projects/alpha.md"))).toBe(before);
        expect(vault.calls.processes).toEqual([]);
    });

    it("shows a recomputed graph while leaving an existing export unread", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin({
            "projects/alpha.md": project("alpha"),
            [GRAPH_PATH]: '{"stale": true}\n',
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual([
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        ]);
        expect(vault.calls.reads).not.toContain(GRAPH_PATH);
        expect(new TextDecoder().decode(vault.files.get(GRAPH_PATH))).toBe('{"stale": true}\n');
        expect(vault.calls.processes).toEqual([]);
    });

    it("reports an unreadable source and writes no graph", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();
        // Capture the original vault method.
        const original = vault.read.bind(vault);
        vi.spyOn(vault, "read").mockImplementation(async (file) => {
            if (file.path === "projects/alpha.md") {
                throw new Error("permission denied");
            }
            return original(file);
        });

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Could not read 'projects/alpha.md': permission denied",
        ]);
        expect(vault.calls.creates).toEqual([]);
    });
});
