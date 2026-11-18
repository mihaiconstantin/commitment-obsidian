import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { App, Notice } from "obsidian";
import CommitmentPlugin from "../src/main";
import { GRAPH_PATH } from "../src/vault-graph-store";
import { FakeVault } from "./support/fake-vault";


const project = (id: string, area: string = "work"): string =>
    `---\ntype: project\nid: ${id}\narea: ${area}\nstate: active\n---\n\nBody.\n`;


function createPlugin(
    files: Record<string, string> = { "projects/alpha.md": project("alpha") },
): { plugin: CommitmentPlugin; app: App; vault: FakeVault } {
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

    // Load the plugin to register its commands.
    plugin.onload();

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
    // Reset the recorded notices and the document body.
    Notice.instances = [];
    document.body.replaceChildren();
});

describe("commitment graph commands", () => {
    it("registers exactly the two requested command names", () => {
        // Compose the plugin over an in-memory vault.
        const { plugin } = createPlugin();
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
        const { plugin, vault } = createPlugin();
        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();
        expect(Notice.instances.map((notice) => notice.message)).toEqual([
            "Vault is still loading; try again",
        ]);
        expect(vault.calls.reads).toEqual([]);
    });

    it("shows the derived graph without writing", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = createPlugin();
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
        const { plugin, app } = createPlugin({
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

    it("shows a path-specific error and no modal for a blocking graph error", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app } = createPlugin({
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
        const { plugin, app } = createPlugin({});
        // Mark the workspace layout ready.
        app.workspace.triggerLayoutReady();

        // Invoke the registered command.
        await plugin.commands[0]?.callback?.();

        expect(modalTexts()).toEqual(["{}\n"]);
    });

    it("creates the graph and reports written on update", async () => {
        // Compose the plugin over an in-memory vault.
        const { plugin, app, vault } = createPlugin();
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
        const { plugin, app, vault } = createPlugin({
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
        const { plugin, app, vault } = createPlugin();
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
        const { plugin, app, vault } = createPlugin();
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
        const { plugin, app } = createPlugin({
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
        const { plugin, app, vault } = createPlugin();
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
        const { plugin, app, vault } = createPlugin({
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
        const { plugin, app, vault } = createPlugin();
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
