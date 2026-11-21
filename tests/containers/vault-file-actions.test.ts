import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("../stubs/obsidian"));

import { App } from "obsidian";
import { CONFIG } from "../../src/constants";
import { GraphBuilder, type GraphBuild } from "../../src/graph/builder";
import type { CommitmentGraph } from "../../src/graph/commitment-graph";
import type { ContainerCreationSettings } from "../../src/settings/settings";
import type { CanonicalInput, ContainerIdentity } from "../../src/graph/types";
import { VaultContainerFileActions } from "../../src/containers/vault-file-actions";
import { FakeVault } from "../support/fake-vault";


/** Build one canonical input from frontmatter entries. */
function input(
    path: string,
    entries: ReadonlyArray<readonly [string, unknown]>,
): CanonicalInput {
    return { path, frontmatter: new Map<string, unknown>(entries) };
}


/** Build the project input used by the adapter tests. */
const project = (path: string, id: string): CanonicalInput =>
    input(path, [
        ["type", "project"],
        ["id", id],
        ["area", "work"],
        ["state", "active"],
    ]);


/** Build one graph and its diagnostics from canonical inputs. */
function buildGraph(inputs: readonly CanonicalInput[]): GraphBuild {
    return new GraphBuilder(inputs).build();
}


/** Return creation settings with the shipped pattern defaults. */
function creation(
    templatePath: string = "",
    folderPath: string = "",
    pattern: string = CONFIG.DEFAULT_PATTERNS.project,
): ContainerCreationSettings {
    return { templatePath, folderPath, pattern };
}


/** Return an empty creation settings value. */
const EMPTY: ContainerCreationSettings = creation();


/** Return the failure message from one rejected action. */
async function failureOf(action: Promise<void>): Promise<string> {
    try {
        // Run the action and fail the test when it resolves.
        await action;
        throw new Error("expected the action to reject");
    } catch (error) {
        // Return the readable failure message.
        return error instanceof Error ? error.message : String(error);
    }
}


/** Build a project identity. */
function identity(id: string, program: string | null = null): ContainerIdentity {
    return { kind: "project", id, area: "work", program };
}

beforeEach(() => {
    // Reset the body between tests.
    document.body.replaceChildren();
});


describe("vault container file actions", () => {
    it("reports open for indexed containers and create for implicit ones", () => {
        // Build a graph with explicit area, program, and project containers.
        const graph: CommitmentGraph = buildGraph([
            input("areas/work.md", [
                ["type", "area"],
                ["id", "work"],
            ]),
            input("programs/phd.md", [
                ["type", "program"],
                ["id", "phd"],
                ["area", "work"],
            ]),
            input("projects/alpha.md", [
                ["type", "project"],
                ["id", "alpha"],
                ["area", "work"],
                ["program", "phd"],
            ]),
            input("projects/beta.md", [
                ["type", "project"],
                ["id", "beta"],
                ["area", "work"],
                ["program", "phd"],
            ]),
        ]).graph;
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            new App(new FakeVault()),
            graph,
            () => EMPTY,
        );

        // Require every explicit row to open.
        expect(adapter.actionFor({ kind: "area", id: "work", area: "work", program: null })).toBe("open");
        expect(adapter.actionFor({ kind: "program", id: "phd", area: "work", program: null })).toBe("open");
        expect(adapter.actionFor(identity("alpha", "phd"))).toBe("open");

        // Require an implicit row to create.
        expect(adapter.actionFor({ kind: "area", id: "home", area: "home", program: null })).toBe("create");
    });

    it("opens an existing container file", async () => {
        // Build a vault and graph with one indexed project.
        const vault: FakeVault = new FakeVault({ "projects/alpha.md": "# Alpha\n" });
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([project("projects/alpha.md", "alpha")]).graph;
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(app, graph, () => EMPTY);

        await adapter.activate(identity("alpha"));

        // Require the indexed file to open without a write.
        expect(app.workspace.opened.map((file) => file.path)).toEqual(["projects/alpha.md"]);
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
    });

    it("creates an implicit project with its folder chain, merged text, and opening", async () => {
        // Build a template with comments, extra keys, and placeholders.
        const template: string =
            "---\ntype: note\nstatus: planning # keep\n---\n# {{title}}\nCreated {{date}} at {{time}}.\n";
        const vault: FakeVault = new FakeVault({ "Templates/project.md": template });
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([]).graph;
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            graph,
            () => creation("Templates/project.md", "Commitments/Projects"),
        );

        await adapter.activate(identity("ghost"));

        // Require the missing folder chain.
        expect(vault.calls.createFolders).toEqual(["Commitments", "Commitments/Projects"]);

        // Require the composed identity, template content, and placeholders.
        const target: string = "Commitments/Projects/Project - ghost.md";
        expect(vault.calls.creates).toEqual([target]);
        const written: Uint8Array | undefined = vault.files.get(target);
        const text: string = new TextDecoder().decode(written as Uint8Array);
        expect(text).toContain("type: project");
        expect(text).toContain("id: ghost");
        expect(text).toContain("area: work");
        expect(text).toContain("state: active");
        expect(text).toContain("status: planning # keep");
        expect(text).toContain("# ghost");
        expect(text).toContain("Created 2026-01-02 at 03:04.");

        // Require the created file to open.
        expect(app.workspace.opened.map((file) => file.path)).toEqual([target]);
    });

    it("creates the file at the configured pattern and style", async () => {
        // Compose the adapter over a custom pattern and title case.
        const vault: FakeVault = new FakeVault({});
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([]).graph;
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            graph,
            () => creation("", "Projects", "{{id}}"),
            () => "titleCase",
        );

        await adapter.activate(identity("some-long-id"));

        // Require the styled basename and the opened file.
        const target: string = "Projects/Some Long Id.md";
        expect(vault.calls.creates).toEqual([target]);
        expect(app.workspace.opened.map((file) => file.path)).toEqual([target]);

        // Require the exact identifier in frontmatter, not the styled text.
        const text: string = new TextDecoder().decode(vault.files.get(target) as Uint8Array);
        expect(text).toContain("id: some-long-id");
    });

    it("aborts on an existing target with zero writes", async () => {
        // Occupy the derived target path.
        const vault: FakeVault = new FakeVault({ "Project - ghost.md": "# Existing\n" });
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([]).graph;
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(app, graph, () => EMPTY);

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require one path-specific failure and no write.
        expect(message).toContain("Project - ghost.md");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
        expect(app.workspace.opened).toEqual([]);
    });

    it("aborts when the configured template is missing", async () => {
        // Build an empty vault with a configured missing template.
        const vault: FakeVault = new FakeVault();
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("Templates/missing.md", "Projects"),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the template path and no folder or file write.
        expect(message).toContain("Templates/missing.md");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
    });

    it("aborts when the configured template cannot be read", async () => {
        // Build a vault with an unreadable template.
        const vault: FakeVault = new FakeVault({ "Templates/project.md": "# Template\n" });
        vi.spyOn(vault, "read").mockRejectedValueOnce(new Error("denied"));
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("Templates/project.md", "Projects"),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the template path and reason, with no write.
        expect(message).toContain("Templates/project.md");
        expect(message).toContain("denied");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
    });

    it("aborts when a file occupies the folder path", async () => {
        // Occupy the parent folder path with a file.
        const vault: FakeVault = new FakeVault({ Commitments: "not a folder" });
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("", "Commitments"),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the occupied parent path and no write.
        expect(message).toContain("Commitments");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
    });

    it("aborts when the indexed container file vanished", async () => {
        // Build a graph and vault with one indexed project.
        const vault: FakeVault = new FakeVault({ "projects/alpha.md": "# Alpha\n" });
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([project("projects/alpha.md", "alpha")]).graph;

        // Remove the file between the build and the action.
        vault.remove("projects/alpha.md");
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(app, graph, () => EMPTY);

        const message: string = await failureOf(adapter.activate(identity("alpha")));

        // Require the vanished path and no write.
        expect(message).toContain("projects/alpha.md");
        expect(message).toContain("is missing");
        expect(vault.calls.creates).toEqual([]);
        expect(app.workspace.opened).toEqual([]);
    });

    it("aborts when the indexed path is now a folder", async () => {
        // Build a graph and vault with one indexed project.
        const vault: FakeVault = new FakeVault({ "projects/alpha.md": "# Alpha\n" });
        const app: App = new App(vault);
        const graph: CommitmentGraph = buildGraph([project("projects/alpha.md", "alpha")]).graph;

        // Replace the file with a folder between the build and the action.
        vault.remove("projects/alpha.md");
        await vault.createFolder("projects/alpha.md");
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(app, graph, () => EMPTY);

        const message: string = await failureOf(adapter.activate(identity("alpha")));

        // Require the indexed path and no write.
        expect(message).toContain("projects/alpha.md");
        expect(message).toContain("not a file");
        expect(vault.calls.creates).toEqual([]);
        expect(app.workspace.opened).toEqual([]);
    });

    it("aborts when the configured template path is a folder", async () => {
        // Create a folder at the configured template path.
        const vault: FakeVault = new FakeVault();
        await vault.createFolder("Templates/folder.md");
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("Templates/folder.md", "Projects"),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the template path and no folder or file write.
        expect(message).toContain("Templates/folder.md");
        expect(message).toContain("not a file");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual(["Templates/folder.md"]);
    });

    it("aborts when folder creation fails", async () => {
        // Reject every folder creation attempt.
        const vault: FakeVault = new FakeVault();
        vi.spyOn(vault, "createFolder").mockRejectedValue(new Error("denied"));
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("", "Created/Projects"),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the folder path and no file write.
        expect(message).toContain("Created");
        expect(message).toContain("denied");
        expect(vault.calls.creates).toEqual([]);
    });

    it("aborts when the target file creation fails", async () => {
        // Reject the file creation attempt with one occupied path.
        const vault: FakeVault = new FakeVault();
        vi.spyOn(vault, "create").mockRejectedValue(new Error("permission denied"));
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => creation("", ""),
        );

        const message: string = await failureOf(adapter.activate(identity("ghost")));

        // Require the target path and reason without an open call.
        expect(message).toContain("Project - ghost.md");
        expect(message).toContain("permission denied");
        expect(vault.files.has("Project - ghost.md")).toBe(false);
        expect(app.workspace.opened).toEqual([]);
    });

    it("aborts before writing when the composed identity is not canonical", async () => {
        // Use an identifier that canonical validation cannot represent.
        const vault: FakeVault = new FakeVault();
        const app: App = new App(vault);
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            app,
            buildGraph([]).graph,
            () => EMPTY,
        );

        const message: string = await failureOf(
            adapter.activate({ kind: "project", id: "alpha ", area: "work", program: null }),
        );

        // Require the composed target and the invalid identity reason.
        expect(message).toContain("Project - alpha.md");
        expect(message).toContain("for `id`");
        expect(vault.calls.creates).toEqual([]);
        expect(vault.calls.createFolders).toEqual([]);
    });

    it("aborts when the identifier sanitizes to an empty file name", async () => {
        // Build an empty adapter.
        const vault: FakeVault = new FakeVault();
        const adapter: VaultContainerFileActions = new VaultContainerFileActions(
            new App(vault),
            buildGraph([]).graph,
            () => EMPTY,
        );

        const message: string = await failureOf(
            adapter.activate({ kind: "project", id: "...", area: "work", program: null }),
        );

        // Require the path-naming failure without a write.
        expect(message).toContain("cannot produce a file name");
        expect(vault.calls.creates).toEqual([]);
    });
});
