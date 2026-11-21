import { beforeEach, describe, expect, it, vi } from "vitest";

import { Notice } from "obsidian";

import { GraphTree } from "../../src/ui/graph-tree";
import type { ContainerFileActions } from "../../src/containers/container-file-actions";
import type { GraphArea } from "../../src/graph/types";
import type { GraphSort } from "../../src/settings/settings";


const AREAS: readonly GraphArea[] = [
    { id: "work", projects: ["alpha", "beta"], programs: [{ id: "phd", projects: ["gamma"] }] },
    { id: "home", projects: ["chores"], programs: [] },
];


/** Mount the tree into a fresh container. */
function mount(
    areas: readonly GraphArea[] = AREAS,
    actions: ContainerFileActions | null = null,
    sort: GraphSort = "count",
): { host: HTMLElement; tree: GraphTree } {
    // Create the host element.
    const host: HTMLElement = document.createElement("div");

    // Attach it so focus and native folding behave like the modal.
    document.body.append(host);

    // Mount the tree and return its boundary.
    return { host, tree: new GraphTree(host, areas, sort, actions) };
}


/** Return one area's native folding element. */
function areaDetails(host: HTMLElement, id: string = "work"): HTMLDetailsElement {
    // Read the built area element by its stable key.
    return host.querySelector(
        `details.cg-row[data-cg-key="area:${id}"]`,
    ) as HTMLDetailsElement;
}


/** Return one program's native folding element. */
function programDetails(
    host: HTMLElement,
    id: string = "phd",
    area: string = "work",
): HTMLDetailsElement {
    // Read the built program element by its stable key.
    return host.querySelector(
        `details.cg-program[data-cg-key="program:${area}/${id}"]`,
    ) as HTMLDetailsElement;
}


/** Return one project row by its visible identifier. */
function projectRow(host: HTMLElement, id: string): HTMLElement {
    // Find the leaf label that carries the identifier.
    const name: Element | undefined = Array.from(host.querySelectorAll(".cg-leaf .cg-nm")).find(
        (node: Element): boolean => node.textContent === id,
    );
    if (name === undefined) {
        // Report a missing test fixture.
        throw new Error(`Missing project row: ${id}`);
    }

    // Return the row that owns the leaf.
    return name.closest(".cg-row") as HTMLElement;
}


/** Return one native summary element. */
function summary(details: HTMLDetailsElement): HTMLElement {
    // Read the only summary in the details.
    return details.querySelector("summary") as HTMLElement;
}


/** Type a query and apply it synchronously. */
function search(host: HTMLElement, value: string): void {
    // Read the search field.
    const input: HTMLInputElement = host.querySelector(".cg-search input") as HTMLInputElement;

    // Type the query and dispatch the immediate input event.
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}


/** Return the rendered row texts in DOM order. */
function rowTexts(host: HTMLElement): readonly string[] {
    // Read every row label.
    return Array.from(host.querySelectorAll(".cg-nm"), (node: Element): string => node.textContent ?? "");
}


/** Return the file icon labels that are not hidden by a filter. */
function visibleFileLabels(host: HTMLElement): readonly string[] {
    // Read the icons outside every hidden row.
    return Array.from(host.querySelectorAll(".cg-file"))
        .filter((node: Element): boolean => node.closest("[hidden]") === null)
        .map((node: Element): string => node.getAttribute("aria-label") ?? "");
}


/** Install one clipboard implementation, or remove the clipboard. */
function setClipboard(writeText?: (text: string) => Promise<void>): void {
    // Replace the surface clipboard for this test.
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: writeText === undefined ? undefined : { writeText },
    });
}


beforeEach(() => {
    // Start every test with the same notices and no clipboard.
    Notice.instances = [];
    setClipboard();

    // Drop any previous host and its listeners.
    document.body.replaceChildren();
});


describe("graph tree", () => {
    it("renders the toolbar chrome", () => {
        // Mount the tree.
        const { host } = mount();

        expect(host.querySelector(".cg-tools")).not.toBeNull();
        expect(host.querySelector(".cg-search")).not.toBeNull();
        expect(host.querySelector(".cg-search-icon svg")?.getAttribute("data-icon")).toBe("search");
        expect(host.querySelector(".cg-chev svg")?.getAttribute("data-icon")).toBe("chevron-down");
        expect(host.querySelector(".cg-kbd")?.textContent).toBe("/");

        // Require the expand control to start with the collapse action.
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");
        expect(toggle.querySelector("svg")?.getAttribute("data-icon")).toBe("chevrons-down-up");

        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 areas · 4 projects · 1 program",
        );
        expect(host.querySelector(".cg-list")).not.toBeNull();
        expect(host.querySelector(".cg-gutter")).not.toBeNull();
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(true);
    });

    it("starts with every area and program expanded in count order", () => {
        // Mount the tree.
        const { host } = mount();

        // Require native details in the open state.
        expect(areaDetails(host, "work").open).toBe(true);
        expect(areaDetails(host, "home").open).toBe(true);
        expect(programDetails(host).open).toBe(true);

        // Require the largest area first with all contents visible.
        expect(rowTexts(host)).toEqual(["work", "alpha", "beta", "phd", "gamma", "home", "chores"]);
    });

    it("anchors fold tooltips to the identifier", () => {
        // Mount the tree.
        const { host } = mount();

        // Read every fold row and its expected identifier.
        const rows: readonly (readonly [HTMLDetailsElement, string])[] = [
            [areaDetails(host, "work"), "work"],
            [areaDetails(host, "home"), "home"],
            [programDetails(host), "phd"],
        ];

        // Require each summary to label itself through its identifier.
        for (const [details, text] of rows) {
            // Read the summary and its visible name.
            const line: HTMLElement = summary(details);
            const name: HTMLElement = line.querySelector(".cg-nm") as HTMLElement;

            // Keep the tooltip off the full-width summary.
            expect(line.hasAttribute("aria-label")).toBe(false);

            // Resolve the summary name through the visible identifier.
            expect(line.getAttribute("aria-labelledby")).toBe(name.id);

            // Anchor the tooltip to the identifier itself.
            expect(name.getAttribute("aria-label")).toBe(text);
        }

        // Require each label to have its own identifier.
        const ids: readonly (string | undefined)[] = rows.map(
            ([details]): string | undefined => summary(details).querySelector(".cg-nm")?.id,
        );
        expect(new Set(ids).size).toBe(rows.length);
    });

    it("orders areas by identifier when name order is configured", () => {
        // Mount the same areas in name order.
        const { host } = mount(AREAS, null, "name");

        // Require the alphabetical area order.
        expect(Array.from(
            host.querySelectorAll("details.cg-row[data-cg-key^='area:'] > summary .cg-node .cg-nm"),
            (node: Element): string => node.textContent ?? "",
        )).toEqual(["home", "work"]);
    });

    it("folds and reopens an area through its native summary", () => {
        // Mount the tree.
        const { host } = mount();
        const area: HTMLDetailsElement = areaDetails(host);

        // Fold the area without rebuilding its rows.
        summary(area).click();
        expect(area.open).toBe(false);
        expect(projectRow(host, "alpha")).not.toBeNull();

        // Reopen the same element.
        summary(area).click();
        expect(area.open).toBe(true);
    });

    it("folds and reopens a program without folding its area", () => {
        // Mount the tree.
        const { host } = mount();
        const area: HTMLDetailsElement = areaDetails(host);
        const program: HTMLDetailsElement = programDetails(host);

        // Fold the program.
        summary(program).click();
        expect(program.open).toBe(false);
        expect(area.open).toBe(true);
        expect(projectRow(host, "gamma")).not.toBeNull();

        // Reopen the same program.
        summary(program).click();
        expect(program.open).toBe(true);
    });

    it("collapses and expands every area and program through one control", () => {
        // Mount the tree.
        const { host } = mount();
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;
        const work: HTMLDetailsElement = areaDetails(host, "work");
        const home: HTMLDetailsElement = areaDetails(host, "home");
        const program: HTMLDetailsElement = programDetails(host);

        // A native fold updates the control before any tree action.
        summary(work).click();
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");
        summary(work).click();
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");

        // Collapse every area and keep the program state.
        toggle.click();
        expect(work.open).toBe(false);
        expect(home.open).toBe(false);
        expect(program.open).toBe(true);
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");
        expect(toggle.querySelector("svg")?.getAttribute("data-icon")).toBe("chevrons-up-down");

        // Expand every area and program.
        toggle.click();
        expect(work.open).toBe(true);
        expect(home.open).toBe(true);
        expect(program.open).toBe(true);
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");
    });

    it("keeps the program open when collapse all folds the areas", () => {
        // Mount the tree without folding anything.
        const { host } = mount();
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;
        const work: HTMLDetailsElement = areaDetails(host, "work");
        const program: HTMLDetailsElement = programDetails(host);

        // Collapse the areas and require the program state to survive.
        toggle.click();
        expect(work.open).toBe(false);
        expect(program.open).toBe(true);

        // Reopen the work area and require the coordinated project to show.
        summary(work).click();
        expect(work.open).toBe(true);
        expect(program.open).toBe(true);
        expect(projectRow(host, "gamma").hidden).toBe(false);
    });

    it("filters with hidden rows, highlights, counts, and stats immediately", () => {
        // Mount the tree.
        const { host } = mount();
        const workName: Element = areaDetails(host).querySelector("summary .cg-node .cg-nm") as Element;

        // Search for the coordinated project.
        search(host, "gamma");

        expect(host.querySelector(".cg-stats")?.textContent).toBe("1 of 4 projects");
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(areaDetails(host, "home").hidden).toBe(true);
        expect(projectRow(host, "alpha").hidden).toBe(true);
        expect(projectRow(host, "beta").hidden).toBe(true);
        expect(projectRow(host, "gamma").hidden).toBe(false);
        expect(programDetails(host).hidden).toBe(false);

        // Require one highlight in the existing name elements.
        expect(projectRow(host, "gamma").querySelector(".cg-mark")?.textContent).toBe("gamma");
        expect(host.querySelectorAll(".cg-mark")).toHaveLength(1);

        // Require the built name element to survive filtering.
        expect(areaDetails(host).querySelector("summary .cg-node .cg-nm")).toBe(workName);

        // Move the highlight when the query changes.
        search(host, "alpha");
        expect(projectRow(host, "gamma").querySelector(".cg-mark")).toBeNull();
        expect(projectRow(host, "alpha").querySelector(".cg-mark")?.textContent).toBe("alpha");
    });

    it("keeps a matching area visible while filtering its direct projects", () => {
        // Mount the tree.
        const { host } = mount();

        // Search for the area name.
        search(host, "work");

        // Require only the program project and the area highlight.
        expect(host.querySelector(".cg-stats")?.textContent).toBe("1 of 4 projects");
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(areaDetails(host, "home").hidden).toBe(true);
        expect(projectRow(host, "alpha").hidden).toBe(true);
        expect(projectRow(host, "beta").hidden).toBe(true);
        expect(projectRow(host, "gamma").hidden).toBe(false);
        expect(programDetails(host).hidden).toBe(false);
        expect(areaDetails(host).querySelector("summary .cg-mark")?.textContent).toBe("work");
    });

    it("shows only a matching program's projects", () => {
        // Mount the tree.
        const { host } = mount();

        // Search for the program name.
        search(host, "phd");

        expect(host.querySelector(".cg-stats")?.textContent).toBe("1 of 4 projects");
        expect(projectRow(host, "alpha").hidden).toBe(true);
        expect(projectRow(host, "beta").hidden).toBe(true);
        expect(projectRow(host, "gamma").hidden).toBe(false);
        expect(programDetails(host).hidden).toBe(false);
    });

    it("reports an empty result with the empty message and zero stats", () => {
        // Mount the tree.
        const { host } = mount();

        // Search for a missing identifier.
        search(host, "nothing-here");

        // Require the empty message instead of visible areas.
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(false);
        expect(host.querySelector(".cg-empty")?.textContent).toContain("No area");
        expect(areaDetails(host, "work").hidden).toBe(true);
        expect(areaDetails(host, "home").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe("0 of 4 projects");
    });

    it("clears the query and restores the full tree", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Filter, then clear the way the modal keymap does.
        search(host, "gamma");
        (host.querySelector(".cg-search input") as HTMLInputElement).focus();
        tree.clearSearch();

        // Require a reset field that no longer owns focus.
        const input: HTMLInputElement = host.querySelector(".cg-search input") as HTMLInputElement;
        expect(input.value).toBe("");
        expect(tree.hasSearchFocus()).toBe(false);
        expect(document.activeElement).not.toBe(input);

        // Require every row and the complete stats line.
        expect(host.querySelector(".cg-stats")?.textContent).toBe("2 areas · 4 projects · 1 program");
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(true);
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(areaDetails(host, "home").hidden).toBe(false);
        expect(projectRow(host, "alpha").hidden).toBe(false);
        expect(projectRow(host, "gamma").hidden).toBe(false);
        expect(host.querySelector(".cg-mark")).toBeNull();
    });

    it("focuses the search field through the exposed handle", () => {
        // Mount the tree.
        const { host, tree } = mount();
        const input: HTMLElement = host.querySelector(".cg-search input") as HTMLElement;

        expect(tree.hasSearchFocus()).toBe(false);

        // Focus the field the way the modal keymap does.
        tree.focusSearch();
        expect(document.activeElement).toBe(input);
        expect(tree.hasSearchFocus()).toBe(true);

        // Release focus without clearing the input.
        input.blur();
        expect(tree.hasSearchFocus()).toBe(false);
    });

    it("preserves the native open state through a query and restores it when cleared", () => {
        // Mount the tree.
        const { host, tree } = mount();
        const work: HTMLDetailsElement = areaDetails(host, "work");
        const home: HTMLDetailsElement = areaDetails(host, "home");
        const program: HTMLDetailsElement = programDetails(host);

        // Fold the program, one area, and the other area.
        summary(program).click();
        summary(home).click();
        summary(work).click();
        expect(work.open).toBe(false);
        expect(home.open).toBe(false);
        expect(program.open).toBe(false);

        // A query opens every visible area and program.
        search(host, "gamma");
        expect(work.open).toBe(true);
        expect(program.open).toBe(true);
        expect(home.hidden).toBe(true);
        expect(home.open).toBe(false);

        // Clearing the query restores the captured state.
        tree.clearSearch();
        expect(work.open).toBe(false);
        expect(home.open).toBe(false);
        expect(program.open).toBe(false);
        expect(work.hidden).toBe(false);
        expect(home.hidden).toBe(false);
    });

    it("copies an identifier and reports success through a Notice", async () => {
        // Record every clipboard write.
        const written: string[] = [];
        setClipboard(async (text: string): Promise<void> => {
            written.push(text);
        });

        // Mount the tree and copy the first direct project.
        const { host } = mount();
        (host.querySelector(".cg-leaf") as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(written).toEqual(["alpha"]);
        expect(Notice.instances.map((notice: Notice): string => notice.message)).toEqual([
            "Copied alpha",
        ]);
    });

    it("reports a rejected copy through a Notice", async () => {
        // Reject every clipboard write.
        setClipboard((): Promise<void> => Promise.reject(new Error("denied")));

        // Mount the tree and copy the first direct project.
        const { host } = mount();
        (host.querySelector(".cg-leaf") as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(Notice.instances.map((notice: Notice): string => notice.message)).toEqual([
            "Copy failed",
        ]);
    });

    it("reports an unavailable clipboard through a Notice", () => {
        // Mount the tree without a clipboard.
        const { host } = mount();

        // Copy the first direct project.
        (host.querySelector(".cg-leaf") as HTMLElement).click();

        expect(Notice.instances.map((notice: Notice): string => notice.message)).toEqual([
            "Copy failed",
        ]);
    });

    it("renders one file icon per area, program, and project row", () => {
        // Build a seam that opens every row except an implicit area.
        const actions: ContainerFileActions = {
            actionFor: (identity) => identity.id === "home" ? "create" : "open",
            activate: async (): Promise<void> => undefined,
        };

        // Mount the tree with the seam.
        const { host } = mount(AREAS, actions);

        // Require one icon per commitment row in render order.
        expect(host.querySelectorAll(".cg-file")).toHaveLength(7);
        expect(Array.from(host.querySelectorAll(".cg-file"), (node) => node.getAttribute("aria-label"))).toEqual([
            "Open work",
            "Open alpha",
            "Open beta",
            "Open phd",
            "Open gamma",
            "Create home",
            "Open chores",
        ]);
        expect(host.querySelectorAll(".cg-file--open")).toHaveLength(6);
        expect(host.querySelectorAll(".cg-file--create")).toHaveLength(1);

        // Require the coordinated project order title, then icon.
        const gamma: HTMLElement = host.querySelector(".cg-leaf--program") as HTMLElement;
        const gammaLine: HTMLElement = gamma.parentElement as HTMLElement;
        expect(Array.from(gammaLine.children, (node: Element): string => node.className)).toEqual([
            "cg-leaf cg-leaf--program",
            "cg-file cg-file--open",
        ]);
        expect(gamma.textContent).toBe("└gamma");

        // Require the action marker and the requested icon.
        const create: Element = host.querySelector(".cg-file--create") as Element;
        expect(create.getAttribute("data-cg-action")).toBe("create");
        expect(create.getAttribute("aria-hidden")).toBeNull();
        expect(create.getAttribute("data-icon")).toBe("circle-plus");
        expect(create.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect((host.querySelector(".cg-file--open") as Element).getAttribute("data-icon")).toBe("sticky-note");
    });

    it("activates the seam once with the exact row identity", async () => {
        // Record every activation.
        const activate = vi.fn(async (): Promise<void> => undefined);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host } = mount(AREAS, actions);

        // Activate the direct project icon.
        (host.querySelector(".cg-leaf + .cg-file") as HTMLElement).click();
        await Promise.resolve();

        // Require the direct project identity.
        expect(activate).toHaveBeenCalledTimes(1);
        expect(activate).toHaveBeenCalledWith({
            kind: "project",
            id: "alpha",
            area: "work",
            program: null,
        });

        // Activate the program icon.
        (host.querySelector(".cg-node--program + .cg-file") as HTMLElement).click();
        await Promise.resolve();

        // Require the program identity.
        expect(activate).toHaveBeenLastCalledWith({
            kind: "program",
            id: "phd",
            area: "work",
            program: null,
        });

        // Activate the coordinated project icon.
        (host.querySelector(".cg-leaf--program + .cg-file") as HTMLElement).click();
        await Promise.resolve();

        // Require the enclosing program identity.
        expect(activate).toHaveBeenLastCalledWith({
            kind: "project",
            id: "gamma",
            area: "work",
            program: "phd",
        });

        // Activate the area icon.
        (host.querySelector(".cg-node + .cg-file") as HTMLElement).click();
        await Promise.resolve();

        // Require the area identity.
        expect(activate).toHaveBeenLastCalledWith({
            kind: "area",
            id: "work",
            area: "work",
            program: null,
        });
    });

    it("keeps one activation in flight at a time", async () => {
        // Hold the first activation open.
        let release: () => void = () => undefined;
        const pending: Promise<void> = new Promise<void>((resolve) => {
            // Retain the resolver until the test releases the action.
            release = resolve;
        });
        const activate = vi.fn((): Promise<void> => pending);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host } = mount(AREAS, actions);
        const icon: HTMLElement = host.querySelector(".cg-leaf + .cg-file") as HTMLElement;

        // Press the icon twice before the first action settles.
        icon.click();
        icon.click();
        expect(activate).toHaveBeenCalledTimes(1);

        // Release the first action and require the next press to run.
        release();
        await pending;
        await Promise.resolve();
        icon.click();
        expect(activate).toHaveBeenCalledTimes(2);
    });

    it("does not toggle a details row when its file icon is pressed", async () => {
        // Build a seam that opens every row.
        const activate = vi.fn(async (): Promise<void> => undefined);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host } = mount(AREAS, actions);
        const work: HTMLDetailsElement = areaDetails(host);
        const program: HTMLDetailsElement = programDetails(host);

        // Press the open area icon and require the area to stay open.
        (work.querySelector("summary .cg-file") as HTMLElement).click();
        await Promise.resolve();
        expect(work.open).toBe(true);

        // Press the open program icon and require the program to stay open.
        (program.querySelector("summary .cg-file") as HTMLElement).click();
        await Promise.resolve();
        expect(program.open).toBe(true);
        expect(activate).toHaveBeenCalledTimes(2);
    });

    it("keeps icons through native folds and filtering", () => {
        // Build a seam that opens every row.
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate: async (): Promise<void> => undefined,
        };
        const { host } = mount(AREAS, actions);
        const work: HTMLDetailsElement = areaDetails(host);

        // Fold the first area and require its icon to remain.
        summary(work).click();
        expect(host.querySelector('.cg-file[aria-label="Open work"]')).not.toBeNull();

        // Reopen and filter to the program project.
        summary(work).click();
        search(host, "gamma");
        expect(host.querySelector('.cg-file[aria-label="Open gamma"]')).not.toBeNull();
        expect(visibleFileLabels(host)).toEqual([
            "Open work",
            "Open phd",
            "Open gamma",
        ]);
    });

    it("renders no icons without a seam", () => {
        // Mount the tree without file actions.
        const { host } = mount();

        expect(host.querySelector(".cg-file")).toBeNull();
        expect(host.querySelector("[data-cg-action]")).toBeNull();
    });

    it("keeps the body click behavior beside the file icon", async () => {
        // Record every file activation.
        const activate = vi.fn(async (): Promise<void> => undefined);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host } = mount(AREAS, actions);

        // Activate the area summary and require a fold without a file action.
        const work: HTMLDetailsElement = areaDetails(host);
        summary(work).click();
        await Promise.resolve();
        expect(work.open).toBe(false);
        expect(activate).not.toHaveBeenCalled();

        // Reopen and activate the project body with a clipboard.
        summary(work).click();
        const written: string[] = [];
        setClipboard(async (text: string): Promise<void> => {
            written.push(text);
        });
        (host.querySelector(".cg-leaf") as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();
        expect(written).toEqual(["alpha"]);
        expect(activate).not.toHaveBeenCalled();
    });
});
