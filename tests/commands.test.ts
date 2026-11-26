import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { App, Modal, Notice, Setting } from "obsidian";
import { CONFIG } from "../src/constants";
import { Diagnostics } from "../src/diagnostics/diagnostics";
import { SettingsReader } from "../src/settings/settings";
import type { CommitmentSettings } from "../src/settings/settings";
import CommitmentPlugin from "../src/main";
import { FakeVault } from "./support/fake-vault";


/** Shipped tree defaults used by settings expectations. */
const TREE_DEFAULTS = CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults;


const project = (id: string, area: string = "work"): string =>
    `---\ntype: project\nid: ${id}\narea: ${area}\nstate: active\n---\n\nBody.\n`;


/** Composed plugin boundaries used by command tests. */
interface PluginSetup {
    /** Loaded plugin under test. */
    readonly plugin: CommitmentPlugin;

    /** Stub app over the in-memory vault. */
    readonly app: App;

    /** In-memory vault records. */
    readonly vault: FakeVault;
}


async function createPlugin(files: Record<string, string> = { "projects/alpha.md": project("alpha") }, storedData: unknown = null): Promise<PluginSetup> {
    // Create the in-memory vault.
    const vault: FakeVault = new FakeVault(files);

    // Create the stub app over the vault.
    const app: App = new App(vault);

    // Compose the plugin over the stub app.
    const plugin: CommitmentPlugin = new CommitmentPlugin(app, {
        id: "commitment",
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
    // Reset the recorded modals, notices, settings, and the document body.
    Modal.instances = [];
    Notice.instances = [];
    Setting.instances = [];
    document.body.replaceChildren();
});

describe("commitment graph commands", () => {
    it("registers exactly the three requested command names", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = await createPlugin();
        expect(plugin.commands.map((command) => command.name)).toEqual([
            "View graph",
            "Update graph",
            "Doctor",
        ]);
        expect(plugin.commands.map((command) => command.id)).toEqual([
            "view-graph",
            "update-graph",
            "doctor",
        ]);
    });

    it("reports the readiness message before the layout is ready", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, vault } = await createPlugin();
        for (const command of plugin.commands) {
            // Invoke every registered command before the layout is ready.
            await command.callback?.();
        }
        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            CONFIG.NOT_READY_MESSAGE,
            CONFIG.NOT_READY_MESSAGE,
            CONFIG.NOT_READY_MESSAGE,
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

    it("does not show diagnostics in the graph modal", async () => {
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
        expect(document.body.textContent).not.toContain("Warnings");
        expect(document.body.textContent).not.toContain("meetings/missing.md");
    });

    it("collects diagnostics only for update and Doctor", async () => {
        // Compose the plugin over a graph with one nonblocking finding.
        const setup: PluginSetup = await createPlugin({
            "projects/alpha.md": project("alpha"),
            "meetings/missing.md":
                "---\ntype: meeting\nlevel: project\nanchor: missing\nscheduled: 2026-02-26\n---\n",
        });

        // Read the composed test boundaries.
        const plugin: CommitmentPlugin = setup.plugin;
        const app: App = setup.app;

        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Observe every diagnostics collection.
        const collect: MockInstance = vi.spyOn(Diagnostics.prototype, "collect");

        try {
            // Build the graph without collecting findings for View.
            await plugin.commands[0]?.callback?.();
            expect(collect).not.toHaveBeenCalled();

            // Collect once for the Update issue count.
            await plugin.commands[1]?.callback?.();
            expect(collect).toHaveBeenCalledTimes(1);

            // Collect once for the Doctor modal.
            await plugin.commands[2]?.callback?.();
            expect(collect).toHaveBeenCalledTimes(2);
        } finally {
            // Restore the prototype spy after the command sequence.
            collect.mockRestore();
        }
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

        // Read the rendered settings, their selected values, and their options.
        const container: HTMLElement = plugin.settingTabs[0]?.containerEl as HTMLElement;
        expect(container.textContent).toContain("Graph view");
        expect(container.textContent).toContain("Graph order");
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        const byName = (name: string): Setting | undefined =>
            controls.find((setting) => setting.nameEl.textContent === name);
        expect(byName("Graph view")?.value).toBe("tree");
        expect(byName("Graph order")?.value).toBe("count");
        expect(byName("Graph view")?.options).toEqual(["json", "tree"]);
        expect(byName("Graph order")?.options).toEqual(["name", "count"]);

        // Change the mode and require the stored order to survive.
        byName("Graph view")?.change?.("json");
        await Promise.resolve();
        expect(plugin.data).toEqual({
            ...CONFIG.DEFAULT_SETTINGS,
            presentation: { mode: "json", sort: "count", treeDefaults: TREE_DEFAULTS },
        });

        // Change the order and require the stored mode to survive.
        byName("Graph order")?.change?.("name");
        await Promise.resolve();
        expect(plugin.data).toEqual(CONFIG.DEFAULT_SETTINGS);
    });

    it("persists tree defaults with consecutive changes", async () => {
        // Compose the plugin and render its settings tab.
        const { plugin } = await createPlugin();
        plugin.settingTabs[0]?.display();

        // Read the controls by their visible names.
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        const byName = (name: string): Setting | undefined =>
            controls.find((setting) => setting.nameEl.textContent === name);

        // Hide active programs and require only that selection to change.
        byName("Active programs")?.toggle?.change?.(false);
        await Promise.resolve();
        expect((plugin.data as CommitmentSettings).presentation.treeDefaults).toEqual({
            ...TREE_DEFAULTS,
            programStates: TREE_DEFAULTS.programStates.filter(
                (state): boolean => state !== "active",
            ),
        });

        // Hide done projects without re-rendering and require both changes.
        byName("Done projects")?.toggle?.change?.(false);
        await Promise.resolve();
        expect((plugin.data as CommitmentSettings).presentation.treeDefaults).toEqual({
            ...TREE_DEFAULTS,
            programStates: TREE_DEFAULTS.programStates.filter(
                (state): boolean => state !== "active",
            ),
            projectStates: TREE_DEFAULTS.projectStates.filter(
                (state): boolean => state !== "done",
            ),
        });

        // Check the area default and require every earlier change to survive.
        byName("Hide inactive areas by default")?.toggle?.change?.(true);
        await Promise.resolve();
        expect((plugin.data as CommitmentSettings).presentation.treeDefaults).toEqual({
            ...TREE_DEFAULTS,
            programStates: TREE_DEFAULTS.programStates.filter(
                (state): boolean => state !== "active",
            ),
            projectStates: TREE_DEFAULTS.projectStates.filter(
                (state): boolean => state !== "done",
            ),
            hideInactiveAreas: true,
        });
    });

    it("reapplies tree defaults without persisting tree changes", async () => {
        // Compose the plugin over restrictive tree defaults.
        const treeDefaults = {
            ...TREE_DEFAULTS,
            projectStates: ["active"] as const,
            programStates: ["active"] as const,
            hideInactiveAreas: true,
        };
        const { plugin, app } = await createPlugin(undefined, {
            presentation: { mode: "tree", sort: "name", treeDefaults },
        });
        app.workspace.triggerLayoutReady();

        // Open the tree and require the configured defaults.
        await plugin.commands[0]?.callback?.();
        const first: HTMLElement = document.querySelector(
            ".commitment-graph__tree-host",
        ) as HTMLElement;
        const firstArea: HTMLInputElement = first.querySelector(
            "input[data-cg-scope='area']",
        ) as HTMLInputElement;
        expect(firstArea.checked).toBe(true);
        expect(first.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 1/6");
        expect(first.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 1/6");

        // Change a tree control and require the stored settings to stay intact.
        firstArea.checked = false;
        firstArea.dispatchEvent(new Event("change", { bubbles: true }));
        expect((plugin.data as CommitmentSettings).presentation.treeDefaults).toEqual(treeDefaults);

        // Reopen the tree and require the configured defaults again.
        await plugin.commands[0]?.callback?.();
        const second: HTMLElement = document.querySelector(
            ".commitment-graph__tree-host",
        ) as HTMLElement;
        expect((second.querySelector("input[data-cg-scope='area']") as HTMLInputElement).checked).toBe(
            true,
        );
        expect(second.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 1/6");
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

        // Require the accent colors, then the defaults, style, and creation fields.
        const controls: Setting[] = Setting.instances.filter((setting) => !setting.heading);
        expect(controls.map((setting) => setting.value)).toEqual([
            "tree",
            "name",
            "none",
            CONFIG.DEFAULT_SETTINGS.appearance.area,
            CONFIG.DEFAULT_SETTINGS.appearance.program,
            "false",
            "",
            "",
            "Area - {{id}}",
            "",
            "true",
            "true",
            "true",
            "true",
            "true",
            "true",
            "",
            "",
            "Program - {{id}}",
            "",
            "true",
            "true",
            "true",
            "true",
            "true",
            "true",
            "Templates/project.md",
            "Projects",
            "Project - {{id}}",
        ]);

        // Change the project folder through its text control.
        controls.find((setting) => setting.nameEl.textContent === "Project folder")?.change?.(
            "Commitments/Projects",
        );
        await Promise.resolve();

        // Require the complete normalized settings shape with the edited folder.
        expect(plugin.data).toEqual({
            presentation: { mode: "tree", sort: "name", treeDefaults: TREE_DEFAULTS },
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
            presentation: { mode: "tree", sort: "count", treeDefaults: TREE_DEFAULTS },
        });
        expect(plugin.data).toEqual({
            ...CONFIG.DEFAULT_SETTINGS,
            presentation: { mode: "tree", sort: "count", treeDefaults: TREE_DEFAULTS },
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
            presentation: { mode: "tree", sort: "count", treeDefaults: TREE_DEFAULTS },
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
            presentation: { mode: "tree", sort: "count", treeDefaults: TREE_DEFAULTS },
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
            "Project `projects/alpha.md` is missing `id`.",
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
            "Graph written",
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
            "Graph unchanged",
        ]);
        expect(vault.calls.processes).toEqual([]);
    });

    it("rejects an overlapping Doctor command with one busy notice", async () => {
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
        const second: unknown = plugin.commands[2]?.callback?.();
        release();
        await Promise.all([first, second]);

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            CONFIG.BUSY_MESSAGE,
        ]);
        expect(vault.calls.reads).toEqual(["projects/alpha.md"]);
    });

    it("reports one issue after update without opening a modal", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = await createPlugin({
            "projects/alpha.md": project("alpha", "work"),
            "programs/phd.md":
                "---\ntype: program\nid: phd\narea: work\nstate: active\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Graph written. 1 issue. Run `Commitment: Doctor`.",
        ]);
        expect(Modal.instances).toHaveLength(0);
        expect(vault.files.has(CONFIG.GRAPH_PATH)).toBe(true);
    });

    it("reports multiple issues after an unchanged update", async () => {
        // Compose the plugin over two underfilled program containers.
        const { plugin, app } = await createPlugin({
            "programs/phd.md":
                "---\ntype: program\nid: phd\narea: work\nstate: active\n---\n",
            "programs/ml.md":
                "---\ntype: program\nid: ml\narea: work\nstate: active\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Write the first projection so the second update stays unchanged.
        await plugin.commands[1]?.callback?.();
        Notice.instances = [];

        // Invoke the update command again.
        await plugin.commands[1]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Graph unchanged. 2 issues. Run `Commitment: Doctor`.",
        ]);
        expect(Modal.instances).toHaveLength(0);
    });

    it("opens the Doctor with the current findings", async () => {
        // Compose the plugin over an in-memory vault with one underfilled program.
        const { plugin, app, vault } = await createPlugin({
            "projects/alpha.md": project("alpha", "work"),
            "programs/phd.md":
                "---\ntype: program\nid: phd\narea: work\nstate: active\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the Doctor command.
        await plugin.commands[2]?.callback?.();

        // Require the grouped issue and its source action.
        expect(Modal.instances).toHaveLength(1);
        expect(Modal.instances[0]?.titleEl.textContent).toBe(CONFIG.DOCTOR_TITLE);
        expect(document.body.textContent).toContain("Underfilled programs");
        expect(document.body.textContent).toContain("Program `phd`");
        expect(document.body.textContent).toContain("programs/phd.md");
        expect(document.querySelector(".cd-path")).not.toBeNull();

        // Require the Doctor to write nothing.
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.processes).toEqual([]);
    });

    it("opens the Doctor for an inactive area with active projects", async () => {
        // Compose the plugin over an inactive area and an active project.
        const { plugin, app } = await createPlugin({
            "areas/work.md": "---\ntype: area\nid: work\nactive: false\n---\n",
            "projects/alpha.md": project("alpha"),
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the Doctor command.
        await plugin.commands[2]?.callback?.();

        // Require the cross-field finding instead of the healthy state.
        expect(Modal.instances).toHaveLength(1);
        expect(document.body.textContent).toContain("Inactive areas with active projects");
        expect(document.body.textContent).toContain(
            "Inactive area `work` contains 1 active project `alpha`.",
        );
        expect(document.body.textContent).not.toContain("No issues found.");
    });

    it("opens the Doctor in the healthy state", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = await createPlugin();
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the Doctor command.
        await plugin.commands[2]?.callback?.();

        expect(Modal.instances).toHaveLength(1);
        expect(Modal.instances[0]?.titleEl.textContent).toBe(CONFIG.DOCTOR_TITLE);
        expect(document.body.textContent).toContain("No issues found.");
    });

    it("reports a blocking error from the Doctor without a modal", async () => {
        // Compose the plugin over an in-memory vault with a missing identifier.
        const { plugin, app } = await createPlugin({
            "projects/alpha.md": "---\ntype: project\narea: work\n---\n",
        });
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the Doctor command.
        await plugin.commands[2]?.callback?.();

        expect(Modal.instances).toHaveLength(0);
        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Project `projects/alpha.md` is missing `id`.",
        ]);
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
            "Cannot read `projects/alpha.md`, permission denied",
        ]);
        expect(vault.calls.creates).toEqual([]);
    });

    it("reports an unreadable source for Doctor without a modal", async () => {
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

        // Invoke the Doctor command.
        await plugin.commands[2]?.callback?.();

        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Cannot read `projects/alpha.md`, permission denied",
        ]);
        expect(Modal.instances).toHaveLength(0);
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.processes).toEqual([]);
    });
});
