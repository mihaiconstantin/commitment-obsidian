import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { App, Modal } from "obsidian";
import { CommitmentGraph } from "../src/commitment-graph";
import type { GraphResult } from "../src/commitment-graph";
import { TextGraphPresenter } from "../src/text-graph-presenter";
import type { CanonicalInput } from "../src/graph-types";


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
    document.body.replaceChildren();
});

describe("text graph presenter", () => {
    it("renders the label, graph text, and warnings with paths", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: TextGraphPresenter = new TextGraphPresenter(app);
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

        presenter.show(result.graph, result.diagnostics);

        expect(document.body.textContent).toContain("Graph from saved files");
        const label: Element | null = document.querySelector(".commitment-graph__label");
        expect(label?.textContent).toBe("Graph from saved files");
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
        const presenter: TextGraphPresenter = new TextGraphPresenter(app);
        // Derive the graph from the canonical inputs.
        const result: GraphResult = CommitmentGraph.build([project("projects/alpha.md", "alpha")]);

        presenter.show(result.graph, result.diagnostics);

        expect(document.querySelector(".commitment-graph__warnings")).toBeNull();
        expect(document.body.textContent).not.toContain("Warnings");
    });

    it("opens a titled standard modal and never injects HTML", () => {
        // Create the stub app.
        const app: App = new App();
        // Compose the presenter over the app.
        const presenter: TextGraphPresenter = new TextGraphPresenter(app);
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

        presenter.show(result.graph, result.diagnostics);

        expect(Modal.instances).toHaveLength(1);
        expect(Modal.instances[0]?.titleEl.textContent).toBe("Commitment graph");
        expect(Modal.instances[0]?.opened).toBe(true);
        expect(document.querySelector("b")).toBeNull();
        expect(document.querySelector(".commitment-graph__json")?.textContent).toContain(
            "<b>bold</b>",
        );
    });

    it("keeps the graph block selectable and scrollable through the stylesheet", () => {
        // Read the shipped stylesheet.
        const styles: string = readFileSync("styles.css", "utf8");
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*overflow:\s*auto;/s);
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*user-select:\s*text;/s);
        expect(styles).toMatch(/\.commitment-graph__json\s*{[^}]*white-space:\s*pre;/s);
    });
});
