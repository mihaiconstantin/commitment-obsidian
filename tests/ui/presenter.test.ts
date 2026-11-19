import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("../stubs/obsidian"));

import { App, Modal, Notice } from "obsidian";
import { CommitmentGraph } from "../../src/graph/commitment-graph";
import type { GraphResult } from "../../src/graph/commitment-graph";
import { DEFAULT_SETTINGS } from "../../src/settings/settings";
import { ModalGraphPresenter } from "../../src/ui/modal-presenter";
import type { CanonicalInput } from "../../src/graph/types";
import { FakeVault } from "../support/fake-vault";


function input(
    path: string,
    entries: ReadonlyArray<readonly [string, unknown]>,
): CanonicalInput {
    return { path, frontmatter: new Map<string, unknown>(entries) };
}


const project = (path: string, id: string): CanonicalInput =>
    input(path, [
        ["type", "project"],
        ["id", id],
        ["area", "work"],
        ["state", "active"],
    ]);

beforeEach(() => {
    // Reset the modal and notice registries and the document body.
    Modal.instances = [];
    Notice.instances = [];
    document.body.replaceChildren();
});

describe("text graph presenter", () => {
    it("renders the graph text and warnings with paths", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the graph from the canonical inputs.
        const result: GraphResult = CommitmentGraph.build([
            project("projects/alpha.md", "alpha"),
            input("meetings/missing.md", [
                ["type", "meeting"],
                ["level", "project"],
                ["anchor", "missing"],
                ["scheduled", "2026-02-26"],
            ]),
        ]);

        presenter.show(result, "json");

        const block: Element | null = document.querySelector("pre.commitment-graph__json");
        expect(block?.textContent).toBe(
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        );
        expect(block?.textContent).toContain('"alpha"');
        const warnings: Element | null = document.querySelector(
            "ul.commitment-graph__warnings",
        );
        expect(warnings?.children).toHaveLength(1);
        expect(warnings?.textContent).toContain("meetings/missing.md");
        expect(document.querySelector(".commitment-graph__paths")?.textContent).toBe(
            "meetings/missing.md",
        );
    });

    it("omits the warnings section when the graph has no diagnostics", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the graph from the canonical inputs.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "json");

        expect(document.querySelector(".commitment-graph__warnings")).toBeNull();
        expect(document.body.textContent).not.toContain("Warnings");
    });

    it("opens a titled standard modal and never injects HTML", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        Modal.instances = [];
        // Derive the graph from the canonical inputs.
        const result: GraphResult = CommitmentGraph.build([
            input("projects/x.md", [
                ["type", "project"],
                ["id", "<b>bold</b>"],
                ["area", "work"],
                ["state", "active"],
            ]),
        ]);

        presenter.show(result, "json");

        expect(Modal.instances).toHaveLength(1);
        expect(Modal.instances[0]?.titleEl.textContent).toBe("Commitment graph");
        expect(Modal.instances[0]?.opened).toBe(true);
        expect(document.querySelector("b")).toBeNull();
        expect(document.querySelector(".commitment-graph__json")?.textContent).toContain(
            "<b>bold</b>",
        );
    });

    it("renders areas, programs, and projects as a tree in tree mode", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with a program and a direct project.
        const result: GraphResult = CommitmentGraph.build([
            project("projects/alpha.md", "alpha"),
            input("projects/beta.md", [
                ["type", "project"],
                ["id", "beta"],
                ["area", "work"],
                ["program", "phd"],
                ["state", "active"],
            ]),
            input("projects/gamma.md", [
                ["type", "project"],
                ["id", "gamma"],
                ["area", "work"],
                ["program", "phd"],
                ["state", "active"],
            ]),
            input("programs/phd.md", [
                ["type", "program"],
                ["id", "phd"],
                ["area", "work"],
            ]),
        ]);

        presenter.show(result, "html");

        expect(document.querySelector(".commitment-graph__tree-host")).not.toBeNull();
        // Areas, programs, and projects all render in the tree.
        expect(document.querySelector(".cg-node .cg-nm")?.textContent).toBe("work");
        expect(document.querySelector(".cg-node--program .cg-nm")?.textContent).toBe("phd");
        const leaves: readonly string[] = Array.from(
            document.querySelectorAll(".cg-leaf .cg-nm"),
            (node: Element): string => node.textContent ?? "",
        );
        expect(leaves).toContain("alpha");
        expect(leaves).toContain("beta");
        expect(leaves).toContain("gamma");
        expect(document.querySelector(".commitment-graph__json")).toBeNull();
    });

    it("renders no markup from identifiers in tree mode", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with an identifier that looks like markup.
        const result: GraphResult = CommitmentGraph.build([
            input("projects/x.md", [
                ["type", "project"],
                ["id", "<img src=x>"],
                ["area", "<b>work</b>"],
                ["state", "active"],
            ]),
        ]);

        presenter.show(result, "html");

        expect(document.querySelector("img")).toBeNull();
        expect(document.querySelector("b")).toBeNull();
        expect(document.body.textContent).toContain("<b>work</b>");
        expect(document.body.textContent).toContain("<img src=x>");
    });

    it("reports an empty tree instead of an empty list", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the empty graph.
        const result: GraphResult = CommitmentGraph.build([]);

        presenter.show(result, "html");

        expect(document.querySelector(".cg-empty")?.textContent).toContain("No area");
        expect(document.querySelector(".cg-node")).toBeNull();
    });

    it("shows warnings in tree mode too", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with an unresolved support anchor.
        const result: GraphResult = CommitmentGraph.build([
            project("projects/alpha.md", "alpha"),
            input("meetings/missing.md", [
                ["type", "meeting"],
                ["level", "project"],
                ["anchor", "missing"],
            ]),
        ]);

        presenter.show(result, "html");

        expect(document.querySelector(".commitment-graph__tree-host")).not.toBeNull();
        expect(document.querySelector("ul.commitment-graph__warnings")?.textContent).toContain(
            "meetings/missing.md",
        );
    });

    it("keeps the tree scrollable and its rows foldable through the stylesheet", () => {
        // Read the shipped stylesheet.
        const styles: string = readFileSync("assets/styles.css", "utf8");
        // The list scrolls inside the modal instead of the page.
        expect(styles).toMatch(/\.cg-list\s*{[^}]*overflow-y:\s*auto;/s);
        // Long identifiers truncate with an ellipsis rather than overflow.
        expect(styles).toMatch(/\.cg-nm\s*{[^}]*text-overflow:\s*ellipsis;/s);
        // The modal content stays full height so the list can scroll.
        expect(styles).toMatch(/commitment-graph-modal \.modal-content\s*{[^}]*overflow:\s*hidden;/s);
        // The desktop tree modal pins its height so filtering cannot shrink it.
        expect(styles).toMatch(
            /body:not\(\.is-mobile\) \.modal\.commitment-graph-modal\s*{[^}]*height:\s*88vh;/s,
        );
    });

    it("binds the slash shortcut through the modal scope", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "html");

        // Require the keymap registration.
        const modal: Modal = Modal.instances[0] as Modal;
        expect(modal.scope.handlers.map((handler) => handler.key)).toContain("/");

        // Require the shortcut to focus the search field and suppress the slash.
        const first: unknown = modal.scope.handlers[0]?.func();
        expect(first).toBe(false);
        expect(document.activeElement).toBe(
            modal.contentEl.querySelector(".cg-search input"),
        );

        // Require a repeat press to leave the typed slash alone.
        const second: unknown = modal.scope.handlers[0]?.func();
        expect(second).toBe(true);
    });

    it("clears the search on Escape before Obsidian closes the modal", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "html");
        const modal: Modal = Modal.instances[0] as Modal;
        const input: HTMLInputElement = modal.contentEl.querySelector(".cg-search input") as HTMLInputElement;
        const escape: (() => unknown) | undefined = modal.scope.handlers
            .find((handler) => handler.key === "Escape")?.func;
        expect(escape).toBeDefined();

        // Type a query and press Escape from the search field.
        input.value = "alpha";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        const cleared: unknown = escape?.();

        // Require the query to clear and the modal to stay open.
        expect(cleared).toBe(false);
        expect(input.value).toBe("");
        expect(modal.closed).toBe(false);
        expect(document.querySelector(".cg-stats")?.textContent).toBe("1 areas · 1 projects · 0 programs");

        // Leave Escape alone when the search field does not have focus.
        input.blur();
        expect(escape?.()).toBe(true);

        // Release the tree listeners and the pending filter timer.
        modal.close();
    });

    it("releases the tree listeners when the modal closes", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "html");
        const modal: Modal = Modal.instances[0] as Modal;
        const input: HTMLInputElement = modal.contentEl.querySelector(".cg-search input") as HTMLInputElement;

        // Type a query, close the modal, then press Escape.
        input.value = "alpha";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        modal.close();
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        // Require the closed tree to ignore the shortcut.
        expect(input.value).toBe("alpha");
    });

    it("releases the rendered tree when the modal closes", () => {
        // Create the stub app and present one tree.
        const app: App = new App();
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);
        presenter.show(result, "html");
        const modal: Modal = Modal.instances[0] as Modal;
        expect(modal.contentEl.querySelector(".cg-list")).not.toBeNull();

        // Close the modal and require the rendered rows to be released.
        modal.close();
        expect(modal.contentEl.querySelector(".cg-list")).toBeNull();
        expect(modal.contentEl.children).toHaveLength(0);
    });

    it("closes the previous modal when shown again", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        // Present the graph twice in a row.
        presenter.show(result, "html");
        const first: Modal = Modal.instances[0] as Modal;
        presenter.show(result, "html");
        const second: Modal = Modal.instances[1] as Modal;

        // Require the older modal to close and the newer one to stay open.
        expect(first.closed).toBe(true);
        expect(second.closed).toBe(false);

        // Require the newer tree to keep its shortcuts.
        const input: HTMLInputElement = second.contentEl.querySelector(".cg-search input") as HTMLInputElement;
        input.value = "alpha";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        const escape: (() => unknown) | undefined = second.scope.handlers
            .find((handler) => handler.key === "Escape")?.func;
        expect(escape?.()).toBe(false);
        expect(input.value).toBe("");

        // Close the newer modal after the assertions.
        second.close();
    });

    it("renders pencils for explicit containers and pluses for implicit ones", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive a graph with an explicit area and an implicit program.
        const result: GraphResult = CommitmentGraph.build([
            input("areas/work.md", [
                ["type", "area"],
                ["id", "work"],
            ]),
            input("projects/alpha.md", [
                ["type", "project"],
                ["id", "alpha"],
                ["area", "work"],
                ["program", "phd"],
                ["state", "active"],
            ]),
            input("projects/beta.md", [
                ["type", "project"],
                ["id", "beta"],
                ["area", "work"],
                ["program", "phd"],
                ["state", "active"],
            ]),
        ]);

        presenter.show(result, "html");

        // Require one icon per area, program, and project row.
        const labels: readonly string[] = Array.from(
            document.querySelectorAll(".cg-file"),
            (node: Element): string => node.getAttribute("aria-label") ?? "",
        );
        expect(labels).toEqual(["Open work", "Create phd", "Open alpha", "Open beta"]);
        expect(document.querySelectorAll(".cg-file--open")).toHaveLength(3);
        expect(document.querySelectorAll(".cg-file--create")).toHaveLength(1);
    });

    it("opens an existing container file and closes the modal", async () => {
        // Create an in-memory vault with the indexed project file.
        const vault: FakeVault = new FakeVault({ "projects/alpha.md": "# Alpha\n" });
        const app: App = new App(vault);
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "html");
        const modal: Modal = Modal.instances[0] as Modal;

        // Click the project pencil.
        (modal.contentEl.querySelector(".cg-leaf + .cg-file") as HTMLElement).click();
        await vi.waitFor(() => {
            // Require the modal to close after the open call settles.
            expect(modal.closed).toBe(true);
        });

        // Require the indexed path to open and no failure notice.
        expect(app.workspace.opened.map((file) => file.path)).toEqual(["projects/alpha.md"]);
        expect(Notice.instances).toEqual([]);
    });

    it("reports one collision notice and keeps the modal open", async () => {
        // Occupy the derived area path with an unrelated document.
        const vault: FakeVault = new FakeVault({
            "projects/alpha.md": "# Alpha\n",
            "Area - work.md": "# Existing\n",
        });
        const app: App = new App(vault);
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project under an implicit area.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "html");
        const modal: Modal = Modal.instances[0] as Modal;

        // Click the implicit area plus.
        (modal.contentEl.querySelector(".cg-file--create") as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();

        // Require exactly one path-specific notice and no write.
        expect(Notice.instances.map((notice) => notice.message)).toHaveLength(1);
        expect(Notice.instances[0]?.message).toContain("Area - work.md");
        expect(modal.closed).toBe(false);
        expect(vault.calls.creates).toEqual([]);
    });

    it("renders no file icons in JSON mode", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result, "json");

        expect(document.querySelector(".cg-file")).toBeNull();
    });

    it("keeps the JSON block selectable and scrollable through the stylesheet", () => {
        // Read the shipped stylesheet.
        const styles: string = readFileSync("assets/styles.css", "utf8");
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*overflow:\s*auto;/s);
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*user-select:\s*text;/s);
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*white-space:\s*pre;/s);
    });
});
