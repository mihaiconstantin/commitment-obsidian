import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { App, Notice, Setting } from "obsidian";
import { CONFIG } from "../src/constants";
import { SettingsReader } from "../src/settings/settings";
import type { CommitmentSettings } from "../src/settings/settings";
import CommitmentPlugin from "../src/main";
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
        expect(vault.files.has(CONFIG.GRAPH_PATH)).toBe(false);
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

    it("applies the stored order to the JSON presentation", async () => {
        // Compose the plugin over a graph whose name and count orders differ.
        const { plugin, app } = await createPlugin({
            "projects/alpha.md": project("alpha"),
            "projects/beta.md": project("beta"),
            "projects/chores.md": project("chores", "home"),
        }, {
            presentation: { mode: "json", sort: "count" },
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        // Require the larger work area before the home area.
        const text: string = modalTexts()[0] ?? "";
        expect(text.indexOf('"work"')).toBeLessThan(text.indexOf('"home"'));
    });

    it("presents the tree when the stored setting selects it", async () => {
        // Compose the plugin over stored tree settings.
        const { plugin, app } = await createPlugin(undefined, {
            presentation: { mode: "tree", sort: "name" },
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        // Require the tree and its applied accent defaults.
        const host: HTMLElement = document.querySelector(".commitment-graph__tree-host") as HTMLElement;
        expect(host).not.toBeNull();
        expect(host.style.getPropertyValue("--cg-area")).toBe(
            CONFIG.DEFAULT_SETTINGS.appearance.area,
        );
        expect(host.style.getPropertyValue("--cg-program")).toBe(
            CONFIG.DEFAULT_SETTINGS.appearance.program,
        );
        expect(modalTexts()).toEqual([]);
    });

    it("shows the stored presentation and order in the settings tab", async () => {
        // Compose the plugin over stored tree settings and count order.
        const { plugin } = await createPlugin(undefined, {
            presentation: { mode: "tree", sort: "count" },
        });
        // Render the registered settings tab.
        plugin.settingTabs[0]?.display();

        // Read the rendered settings and their selected values.
        const container: HTMLElement = plugin.settingTabs[0]?.containerEl as HTMLElement;
        expect(container.textContent).toContain("Graph view");
        expect(container.textContent).toContain("Graph order");
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        const byName = (name: string): Setting | undefined =>
            controls.find((setting) => setting.nameEl.textContent === name);
        expect(byName("Graph view")?.value).toBe("tree");
        expect(byName("Graph order")?.value).toBe("count");

        // Change the mode and require the stored order to survive.
        byName("Graph view")?.change?.("json");
        await Promise.resolve();
        expect(plugin.data).toEqual({
            ...CONFIG.DEFAULT_SETTINGS,
            presentation: { mode: "json", sort: "count" },
        });

        // Change the order and require the stored mode to survive.
        byName("Graph order")?.change?.("name");
        await Promise.resolve();
        expect(plugin.data).toEqual(CONFIG.DEFAULT_SETTINGS);
    });

    it("persists an accent color and resets it to the default", async () => {
        // Compose the plugin and render its settings tab.
        const { plugin } = await createPlugin();
        plugin.settingTabs[0]?.display();

        // Read the area and program accent controls.
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        const area: Setting | undefined = controls.find(
            (setting) => setting.nameEl.textContent === "Area accent",
        );
        const program: Setting | undefined = controls.find(
            (setting) => setting.nameEl.textContent === "Program accent",
        );

        // Require both pickers to start on the applied defaults.
        expect(area?.color?.value).toBe(CONFIG.DEFAULT_SETTINGS.appearance.area);
        expect(program?.color?.value).toBe(CONFIG.DEFAULT_SETTINGS.appearance.program);

        // Change the accent and require the complete normalized settings.
        area?.change?.("#112233");
        await Promise.resolve();
        expect(plugin.data).toEqual({
            ...CONFIG.DEFAULT_SETTINGS,
            appearance: {
                area: "#112233",
                program: CONFIG.DEFAULT_SETTINGS.appearance.program,
            },
        });

        // Reset the accent and require the same default in settings and picker.
        area?.reset?.();
        await Promise.resolve();
        expect(plugin.data).toEqual(CONFIG.DEFAULT_SETTINGS);
        expect(area?.color?.value).toBe(CONFIG.DEFAULT_SETTINGS.appearance.area);
    });

    it("renders grouped creation fields and persists one without losing the others", async () => {
        // Compose the plugin over nested creation settings.
        const { plugin } = await createPlugin(undefined, {
            presentation: { mode: "tree", sort: "name" },
            creation: {
                project: { templatePath: "Templates/project.md", folderPath: "Projects" },
            },
        });
        // Render the registered settings tab.
        plugin.settingTabs[0]?.display();

        // Require the General, Appearance, Area, Program, and Project group headings.
        expect(
            Setting.instances.filter((setting) => setting.heading).map((setting) => setting.nameEl.textContent),
        ).toEqual(["General", "Appearance", "Area", "Program", "Project"]);

        // Require the accent colors, then the style and creation fields.
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        expect(controls.map((setting) => setting.value)).toEqual([
            "tree",
            "name",
            "none",
            CONFIG.DEFAULT_SETTINGS.appearance.area,
            CONFIG.DEFAULT_SETTINGS.appearance.program,
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
        controls[12]?.change?.("Commitments/Projects");
        await Promise.resolve();

        // Require the complete normalized settings shape with the edited folder.
        expect(plugin.data).toEqual({
            presentation: { mode: "tree", sort: "name" },
            appearance: CONFIG.DEFAULT_SETTINGS.appearance,
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

        // Persist the tree presentation and count order through the plugin surface.
        await plugin.saveSettings({
            ...CONFIG.DEFAULT_SETTINGS,
            presentation: { mode: "tree", sort: "count" },
        });
        expect(plugin.data).toEqual({
            ...CONFIG.DEFAULT_SETTINGS,
            presentation: { mode: "tree", sort: "count" },
        });

        // Persist JSON again and confirm the last write wins.
        await plugin.saveSettings(CONFIG.DEFAULT_SETTINGS);
        expect(plugin.data).toEqual(CONFIG.DEFAULT_SETTINGS);
    });

    it("normalizes settings through saveData and reads them back", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();

        // Persist unsafe and padded creation values.
        const next: CommitmentSettings = {
            presentation: { mode: "tree", sort: "count" },
            appearance: CONFIG.DEFAULT_SETTINGS.appearance,
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
            presentation: { mode: "tree", sort: "count" },
            appearance: CONFIG.DEFAULT_SETTINGS.appearance,
            creation: {
                idStyle: "none",
                area: { templatePath: "Templates/area.md", folderPath: "", pattern: "Area - {{id}}" },
                program: { templatePath: "", folderPath: "Programs", pattern: "Program - {{id}}" },
                project: { templatePath: "", folderPath: "", pattern: "Project - {{id}}" },
            },
        });

        // Require the saved data to read back as the same settings.
        expect(new SettingsReader().read(plugin.data)).toEqual(plugin.settings);
    });

    it("writes canonical graph bytes regardless of the display order", async () => {
        // Compose the plugin over stored tree settings and count order.
        const { plugin, app, vault } = await createPlugin(undefined, {
            presentation: { mode: "tree", sort: "count" },
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the update command.
        await plugin.commands[1]?.callback?.();

        // Require the same projection the JSON presentation shows.
        const written: unknown = vault.files.get(CONFIG.GRAPH_PATH);
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
        expect(vault.calls.creates).toEqual([CONFIG.GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(CONFIG.GRAPH_PATH))).toContain('"alpha"');
    });

    it("reports unchanged without writing identical output", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin({
            "projects/alpha.md": project("alpha"),
            [CONFIG.GRAPH_PATH]:
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
            [CONFIG.GRAPH_PATH]: '{"stale": true}\n',
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual([
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        ]);
        expect(vault.calls.reads).not.toContain(CONFIG.GRAPH_PATH);
        expect(new TextDecoder().decode(vault.files.get(CONFIG.GRAPH_PATH))).toBe('{"stale": true}\n');
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
