import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("../stubs/obsidian"));

import { App, Modal, Notice } from "obsidian";
import { GraphBuilder, type GraphBuild } from "../../src/graph/builder";
import { CONFIG } from "../../src/constants";
import { ModalGraphPresenter } from "../../src/ui/modal-presenter";
import type { CanonicalInput } from "../../src/graph/types";
import type { PresentationSettings } from "../../src/settings/settings";
import { FakeVault } from "../support/fake-vault";


const JSON_PRESENTATION: PresentationSettings = { mode: "json", sort: "name" };
const TREE_PRESENTATION: PresentationSettings = { mode: "tree", sort: "name" };


/** Build one graph and its diagnostics from canonical inputs. */
function buildGraph(inputs: readonly CanonicalInput[]): GraphBuild {
    return new GraphBuilder(inputs).build();
}


function input(
    path: string,
    entries: ReadonlyArray<readonly [string, unknown]>,
): CanonicalInput {
    return { path, frontmatter: new Map<string, unknown>(entries) };
}


const projectIn = (area: string, path: string, id: string): CanonicalInput =>
    input(path, [
        ["type", "project"],
        ["id", id],
        ["area", area],
        ["state", "active"],
    ]);


const project = (path: string, id: string): CanonicalInput => projectIn("work", path, id);


/** Return the rendered area names in document order. */
function areaNames(): readonly string[] {
    // Read every area summary label.
    return Array.from(
        document.querySelectorAll("details.cg-row[data-cg-key^='area:'] > summary .cg-node .cg-nm"),
        (node: Element): string => node.textContent ?? "",
    );
}

beforeEach(() => {
    // Reset the modal and notice registries and the document body.
    Modal.instances = [];
    Notice.instances = [];
    document.body.replaceChildren();
});

describe("text graph presenter", () => {
    it("renders the graph text", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive the graph from the canonical inputs.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, JSON_PRESENTATION);

        const block: Element | null = document.querySelector("pre.commitment-graph__json");
        expect(block?.textContent).toBe(
            '{\n    "work": {\n        "projects": [\n            "alpha"\n        ],\n        "programs": {}\n    }\n}\n',
        );
        expect(block?.textContent).toContain('"alpha"');
    });

    it("does not render diagnostics in the graph modal", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with an unresolved support anchor.
        const result: GraphBuild = buildGraph([
            project("projects/alpha.md", "alpha"),
            input("meetings/missing.md", [
                ["type", "meeting"],
                ["level", "project"],
                ["anchor", "missing"],
                ["scheduled", "2026-02-26"],
            ]),
        ]);

        // Require the JSON presentation to omit the finding.
        presenter.show(result.graph, JSON_PRESENTATION);
        expect(document.querySelector(".commitment-graph__warnings")).toBeNull();
        expect(document.body.textContent).not.toContain("Warnings");
        expect(document.body.textContent).not.toContain("meetings/missing.md");

        // Require the tree presentation to omit the finding too.
        presenter.show(result.graph, TREE_PRESENTATION);
        expect(document.querySelector(".commitment-graph__warnings")).toBeNull();
        expect(document.body.textContent).not.toContain("Warnings");
        expect(document.body.textContent).not.toContain("meetings/missing.md");
    });

    it("orders JSON and tree areas by the stored graph sort", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph whose name and count orders differ.
        const result: GraphBuild = buildGraph([
            project("projects/alpha.md", "alpha"),
            project("projects/beta.md", "beta"),
            project("projects/gamma.md", "gamma"),
            projectIn("home", "projects/chores.md", "chores"),
        ]);

        // Require name order in the JSON presentation.
        presenter.show(result.graph, { mode: "json", sort: "name" });
        const nameJson: string = document.querySelector("pre.commitment-graph__json")?.textContent ?? "";
        expect(nameJson.indexOf('"home"')).toBeLessThan(nameJson.indexOf('"work"'));

        // Require count order in the JSON presentation.
        presenter.show(result.graph, { mode: "json", sort: "count" });
        const countJson: string = document.querySelector("pre.commitment-graph__json")?.textContent ?? "";
        expect(countJson.indexOf('"work"')).toBeLessThan(countJson.indexOf('"home"'));

        // Require name order in the tree presentation.
        presenter.show(result.graph, { mode: "tree", sort: "name" });
        expect(areaNames()).toEqual(["home", "work"]);

        // Require count order in the tree presentation.
        presenter.show(result.graph, { mode: "tree", sort: "count" });
        expect(areaNames()).toEqual(["work", "home"]);
    });

    it("opens a titled standard modal and never injects HTML", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        Modal.instances = [];
        // Derive the graph from the canonical inputs.
        const result: GraphBuild = buildGraph([
            input("projects/x.md", [
                ["type", "project"],
                ["id", "<b>bold</b>"],
                ["area", "work"],
                ["state", "active"],
            ]),
        ]);

        presenter.show(result.graph, JSON_PRESENTATION);

        expect(Modal.instances).toHaveLength(1);
        expect(Modal.instances[0]?.titleEl.textContent).toBe("Commitment Graph");
        expect(Modal.instances[0]?.opened).toBe(true);
        expect(document.querySelector("b")).toBeNull();
        expect(document.querySelector(".commitment-graph__json")?.textContent).toContain(
            "<b>bold</b>",
        );
    });

    it("disables the modal's initial input focus", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        // Open the tree presentation.
        presenter.show(result.graph, TREE_PRESENTATION);

        // Require the modal to leave focus alone on open.
        const modal: Modal = Modal.instances[0] as Modal;
        expect(modal.hasInitialInputFocus).toBe(false);
    });

    it("renders areas, programs, and projects as a tree in tree mode", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with a program and a direct project.
        const result: GraphBuild = buildGraph([
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

        presenter.show(result.graph, TREE_PRESENTATION);

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

    it("applies supplied accent colors to the tree", () => {
        // Create the stub app and a presenter with appearance overrides.
        const app: App = new App();
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(
            app,
            () => CONFIG.DEFAULT_SETTINGS.creation,
            () => ({ area: "#112233", program: "#445566" }),
        );
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, TREE_PRESENTATION);

        // Require every supplied color on the mounted tree host.
        const host: HTMLElement = document.querySelector(".commitment-graph__tree-host") as HTMLElement;
        expect(host.style.getPropertyValue("--cg-area")).toBe("#112233");
        expect(host.style.getPropertyValue("--cg-program")).toBe("#445566");
    });

    it("renders no markup from identifiers in tree mode", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with an identifier that looks like markup.
        const result: GraphBuild = buildGraph([
            input("projects/x.md", [
                ["type", "project"],
                ["id", "<img src=x>"],
                ["area", "<b>work</b>"],
                ["state", "active"],
            ]),
        ]);

        presenter.show(result.graph, TREE_PRESENTATION);

        expect(document.querySelector("img")).toBeNull();
        expect(document.querySelector("b")).toBeNull();
        expect(document.body.textContent).toContain("<b>work</b>");
        expect(document.body.textContent).toContain("<img src=x>");
    });

    it("reports an empty tree instead of an empty list", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive the empty graph.
        const result: GraphBuild = buildGraph([]);

        presenter.show(result.graph, TREE_PRESENTATION);

        expect(document.querySelector(".cg-empty")?.textContent).toContain("No areas");
        expect(document.querySelector(".cg-node")).toBeNull();
    });

    it("keeps the tree scrollable and its rows foldable through the stylesheet", () => {
        // Read the shipped stylesheet.
        const styles: string = readFileSync("assets/styles.css", "utf8");
        // The list scrolls inside the modal instead of the page.
        expect(styles).toMatch(/\.cg-list\s*{[^}]*overflow-y:\s*auto;/s);
        // Long identifiers truncate with an ellipsis rather than overflow.
        expect(styles).toMatch(/\.cg-nm\s*{[^}]*text-overflow:\s*ellipsis;/s);
        // The modal content can shrink but must not clip the search focus ring.
        const contentRule: string = styles.match(
            /commitment-graph-modal \.modal-content\s*{([^}]*)}/s,
        )?.[1] ?? "";
        expect(contentRule).toContain("min-height: 0;");
        expect(contentRule).not.toContain("overflow: hidden;");
        // The desktop tree modal pins its height so filtering cannot shrink it.
        expect(styles).toMatch(
            /body:not\(\.is-mobile\) \.modal\.commitment-graph-modal\s*{[^}]*height:\s*88vh;/s,
        );
        // Filtered rows stay out of the flow even when a class sets a display.
        expect(styles).toMatch(
            /\.commitment-graph__tree-host \[hidden\]\s*{[^}]*display:\s*none\s*!important;/s,
        );
        // Native area and program summaries hide the user-agent marker.
        expect(styles).toMatch(
            /\.commitment-graph__tree-host \.cg-row > summary,\s*\.commitment-graph__tree-host \.cg-program > summary\s*{[^}]*list-style:\s*none;/s,
        );
        expect(styles).toMatch(
            /\.commitment-graph__tree-host \.cg-row > summary::-webkit-details-marker,\s*\.commitment-graph__tree-host \.cg-program > summary::-webkit-details-marker\s*{[^}]*display:\s*none;/s,
        );
    });

    it("binds the slash shortcut through the modal scope", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, TREE_PRESENTATION);

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

    it("releases the rendered tree when the modal closes", () => {
        // Create the stub app and present one tree.
        const app: App = new App();
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);
        presenter.show(result.graph, TREE_PRESENTATION);
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
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with one area.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        // Present the graph twice in a row.
        presenter.show(result.graph, TREE_PRESENTATION);
        const first: Modal = Modal.instances[0] as Modal;
        presenter.show(result.graph, TREE_PRESENTATION);
        const second: Modal = Modal.instances[1] as Modal;

        // Require the older modal to close and the newer one to stay open.
        expect(first.closed).toBe(true);
        expect(second.closed).toBe(false);

        // Close the newer modal after the assertions.
        second.close();
    });

    it("renders sticky-note icons for explicit containers and circle-plus icons for implicit ones", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive a graph with an explicit area and an implicit program.
        const result: GraphBuild = buildGraph([
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

        presenter.show(result.graph, TREE_PRESENTATION);

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
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, TREE_PRESENTATION);
        const modal: Modal = Modal.instances[0] as Modal;

        // Click the project sticky-note icon.
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
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project under an implicit area.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, TREE_PRESENTATION);
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
        const presenter: ModalGraphPresenter = new ModalGraphPresenter(app, () => CONFIG.DEFAULT_SETTINGS.creation);
        // Derive the graph with one explicit project.
        const result: GraphBuild = buildGraph([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, JSON_PRESENTATION);

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
