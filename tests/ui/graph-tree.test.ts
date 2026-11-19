import { beforeEach, describe, expect, it, vi } from "vitest";

import { GraphTree } from "../../src/ui/graph-tree";
import type { ContainerFileActions } from "../../src/containers/container-file-actions";
import type { GraphArea } from "../../src/graph/types";


const AREAS: readonly GraphArea[] = [
    { id: "work", projects: ["alpha", "beta"], programs: [{ id: "phd", projects: ["gamma"] }] },
    { id: "home", projects: ["chores"], programs: [] },
];


/** Mount the tree into a fresh container. */
function mount(
    areas: readonly GraphArea[] = AREAS,
    actions: ContainerFileActions | null = null,
): { host: HTMLElement; tree: GraphTree } {
    // Create the host element.
    const host: HTMLElement = document.createElement("div");

    // Attach it so focus and listeners behave like the modal.
    document.body.append(host);

    // Mount the tree and return its boundary.
    return { host, tree: GraphTree.mount(host, areas, actions) };
}


/** Type a query and let the debounced render run. */
function search(host: HTMLElement, value: string): void {
    // Read the search field.
    const input: HTMLInputElement = host.querySelector(".cg-search input") as HTMLInputElement;

    // Type the query.
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Run the debounced render immediately.
    vi.advanceTimersByTime(200);
}


/** Return the rendered row texts. */
function rowTexts(host: HTMLElement): readonly string[] {
    // Read every row label.
    return Array.from(host.querySelectorAll(".cg-nm"), (node: Element): string => node.textContent ?? "");
}


beforeEach(() => {
    // Control the debounce timer.
    vi.useFakeTimers();

    // Start every test from the default order.
    window.localStorage.clear();

    // Drop any previous host and its listeners.
    document.body.replaceChildren();
});


describe("graph tree", () => {
    it("renders search, sort, and expand controls", () => {
        // Mount the tree.
        const { host, tree } = mount();

        expect(host.querySelector(".cg-search input")).not.toBeNull();
        expect(host.querySelector(".cg-select")).not.toBeNull();
        expect(host.querySelectorAll(".cg-btn")).toHaveLength(1);
        expect(host.querySelector(".cg-toggle")).not.toBeNull();
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 areas · 4 projects · 1 program",
        );

        // Clean up the listeners.
        tree.dispose();
    });

    it("starts expanded and orders the largest area first", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Require the largest area and all of its contents first.
        expect(rowTexts(host)).toEqual(["work", "alpha", "beta", "phd", "gamma", "home", "chores"]);

        // Clean up the listeners.
        tree.dispose();
    });

    it("filters by identifier and highlights the match", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Type a query.
        search(host, "gamma");

        // Require only the matching branch.
        expect(rowTexts(host)).toEqual(["work", "phd", "gamma"]);

        // Require the visible match to be highlighted.
        expect(host.querySelector(".cg-mark")?.textContent).toBe("gamma");
        expect(host.querySelector(".cg-stats")?.textContent).toBe("1 of 4 projects");

        // Clean up the listeners.
        tree.dispose();
    });

    it("reports an empty result instead of a blank list", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Search for a missing identifier.
        search(host, "nothing-here");

        // Require the empty message.
        expect(host.querySelector(".cg-empty")?.textContent).toContain("No area");

        // Clean up the listeners.
        tree.dispose();
    });

    it("sorts by identifier when the order changes", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Select the identifier order.
        const select: HTMLSelectElement = host.querySelector(".cg-select") as HTMLSelectElement;
        select.value = "name";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        // Require the alphabetical area order.
        expect(rowTexts(host)[0]).toBe("home");

        // Clean up the listeners.
        tree.dispose();
    });

    it("remembers the sort order across mounts", () => {
        // Mount the tree and choose the identifier order.
        const first = mount();
        const select: HTMLSelectElement = first.host.querySelector(".cg-select") as HTMLSelectElement;
        select.value = "name";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        first.tree.dispose();

        // Mount a second tree and require the remembered order.
        const second = mount();
        expect((second.host.querySelector(".cg-select") as HTMLSelectElement).value).toBe("name");
        expect(second.host.querySelector(".cg-node .cg-nm")?.textContent).toBe("home");

        // Clean up the listeners.
        second.tree.dispose();
    });

    it("folds an area and reopens it", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Fold the first area.
        (host.querySelector(".cg-node") as HTMLElement).click();
        expect(host.querySelector(".cg-node")?.getAttribute("aria-expanded")).toBe("false");
        // The folded area row remains, plus the other area and its project.
        expect(host.querySelectorAll(".cg-row")).toHaveLength(3);

        // Reopen the first area: 2 areas plus 3 projects and 1 program.
        (host.querySelector(".cg-node") as HTMLElement).click();
        expect(host.querySelectorAll(".cg-row")).toHaveLength(6);

        // Clean up the listeners.
        tree.dispose();
    });

    it("folds a program without folding its area", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Fold the program.
        (host.querySelector(".cg-node--program") as HTMLElement).click();

        // Require the program project to disappear and the area to stay open.
        expect(rowTexts(host)).toEqual(["work", "alpha", "beta", "phd", "home", "chores"]);
        expect(host.querySelector(".cg-node")?.getAttribute("aria-expanded")).toBe("true");

        // Clean up the listeners.
        tree.dispose();
    });

    it("collapses and expands every area through one control", () => {
        // Mount the tree.
        const { host, tree } = mount();
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;

        // The control collapses while the tree is open.
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");

        // Collapse every area.
        toggle.click();
        expect(rowTexts(host)).toEqual(["work", "home"]);

        // The control now expands because nothing is open.
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");

        // Expand every area: 2 areas plus 3 projects and 1 program.
        toggle.click();
        expect(host.querySelectorAll(".cg-row")).toHaveLength(6);

        // The control returns to the collapse action.
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");

        // Clean up the listeners.
        tree.dispose();
    });

    it("offers the expand action when only one program is folded", () => {
        // Mount the tree.
        const { host, tree } = mount();
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;

        // Fold the single program by activating its row.
        (host.querySelector(".cg-node--program") as HTMLElement).click();

        // The control must expand rather than restart the collapse.
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");

        // Expand everything again.
        toggle.click();
        expect(host.querySelectorAll(".cg-row")).toHaveLength(6);

        // Clean up the listeners.
        tree.dispose();
    });

    it("keeps keyboard focus on a toggle after folding", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Focus the first area toggle and fold it.
        const area: HTMLElement = host.querySelector(".cg-node") as HTMLElement;
        area.focus();
        area.click();

        // Require focus to survive the re-render.
        expect(document.activeElement).toBe(host.querySelector(".cg-node"));

        // Clean up the listeners.
        tree.dispose();
    });

    it("copies an identifier and confirms it", async () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Record the clipboard writes.
        const written: string[] = [];
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async (text: string): Promise<void> => { written.push(text); } },
        });

        // Copy the first direct project.
        (host.querySelectorAll(".cg-leaf")[0] as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();

        expect(written).toEqual(["alpha"]);
        expect(host.querySelector(".cg-toast")?.textContent).toBe("Copied alpha");

        // Clean up the listeners.
        tree.dispose();
    });

    it("renders one file icon per area, program, and project row", () => {
        // Build a seam that opens every row except an implicit area.
        const actions: ContainerFileActions = {
            actionFor: (identity) => identity.id === "home" ? "create" : "open",
            activate: async (): Promise<void> => undefined,
        };

        // Mount the tree with the seam.
        const { host, tree } = mount(AREAS, actions);

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

        // Require the coordinated project order title, icon, then tag.
        const gamma: HTMLElement = host.querySelector(".cg-leaf--program") as HTMLElement;
        const gammaLine: HTMLElement = gamma.parentElement as HTMLElement;
        expect(Array.from(gammaLine.children, (node: Element): string => node.className)).toEqual([
            "cg-leaf cg-leaf--program",
            "cg-file cg-file--open",
            "cg-tag",
        ]);
        expect(gamma.textContent).toBe("└gamma");
        expect(gammaLine.children[2]?.textContent).toBe("in program");

        // Require the action marker and inline glyph.
        const create: Element = host.querySelector(".cg-file--create") as Element;
        expect(create.getAttribute("data-cg-action")).toBe("create");
        expect(create.getAttribute("aria-hidden")).toBeNull();
        expect(create.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(create.querySelectorAll("svg path")).toHaveLength(2);

        // Clean up the listeners.
        tree.dispose();
    });

    it("activates the seam once with the exact row identity", async () => {
        // Record every activation.
        const activate = vi.fn(async (): Promise<void> => undefined);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host, tree } = mount(AREAS, actions);

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

        // Clean up the listeners.
        tree.dispose();
    });

    it("keeps one activation in flight at a time", async () => {
        // Hold the first activation open.
        let release: () => void = () => undefined;
        const pending: Promise<void> = new Promise<void>((resolve) => {
            release = resolve;
        });
        const activate = vi.fn((): Promise<void> => pending);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host, tree } = mount(AREAS, actions);
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

        // Clean up the listeners.
        tree.dispose();
    });

    it("keeps icons through fold and filter re-renders", () => {
        // Build a seam that opens every row.
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate: async (): Promise<void> => undefined,
        };
        const { host, tree } = mount(AREAS, actions);

        // Fold the first area and require its icon to remain.
        (host.querySelector(".cg-node") as HTMLElement).click();
        expect(host.querySelector('.cg-file[aria-label="Open work"]')).not.toBeNull();

        // Reopen and filter to the program project.
        (host.querySelector(".cg-node") as HTMLElement).click();
        search(host, "gamma");
        expect(host.querySelector('.cg-file[aria-label="Open gamma"]')).not.toBeNull();
        expect(host.querySelectorAll(".cg-file")).toHaveLength(3);

        // Clean up the listeners.
        tree.dispose();
    });

    it("renders no icons without a seam", () => {
        // Mount the tree without file actions.
        const { host, tree } = mount();

        expect(host.querySelector(".cg-file")).toBeNull();
        expect(host.querySelector("[data-cg-action]")).toBeNull();

        // Clean up the listeners.
        tree.dispose();
    });

    it("keeps the body click behavior beside the file icon", async () => {
        // Record every file activation.
        const activate = vi.fn(async (): Promise<void> => undefined);
        const actions: ContainerFileActions = {
            actionFor: () => "open",
            activate,
        };
        const { host, tree } = mount(AREAS, actions);

        // Activate the area body and require a fold without a file action.
        (host.querySelector(".cg-node") as HTMLElement).click();
        await Promise.resolve();
        expect(host.querySelector(".cg-node")?.getAttribute("aria-expanded")).toBe("false");
        expect(activate).not.toHaveBeenCalled();

        // Activate the project body with a clipboard and require a copy.
        (host.querySelector(".cg-node") as HTMLElement).click();
        const written: string[] = [];
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async (text: string): Promise<void> => { written.push(text); } },
        });
        (host.querySelector(".cg-leaf") as HTMLElement).click();
        await Promise.resolve();
        await Promise.resolve();
        expect(written).toEqual(["alpha"]);
        expect(activate).not.toHaveBeenCalled();

        // Clean up the listeners.
        tree.dispose();
    });

    it("releases both pending timers when disposed", () => {
        // Force the synchronous clipboard fallback so the toast timer is scheduled now.
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });

        // Mount the tree and type a query to schedule a filter render.
        const { host, tree } = mount();
        const input: HTMLInputElement = host.querySelector(".cg-search input") as HTMLInputElement;
        input.value = "alpha";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        // Copy an identifier to schedule the toast hide.
        (host.querySelectorAll(".cg-leaf")[0] as HTMLElement).click();

        // Require exactly the filter and toast timers to be pending.
        expect(vi.getTimerCount()).toBe(2);

        // Dispose the tree and require both timers to be released.
        tree.dispose();
        expect(vi.getTimerCount()).toBe(0);

        // Require a repeated dispose to stay harmless.
        expect(() => tree.dispose()).not.toThrow();
    });

    it("focuses the search field through the exposed handle", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Focus the field the way the modal keymap does.
        tree.focusSearch();

        // Require the search field to take focus.
        expect(document.activeElement).toBe(host.querySelector(".cg-search input"));

        // Clean up the listeners.
        tree.dispose();
    });

    it("clears the query through the modal handle", () => {
        // Mount the tree.
        const { host, tree } = mount();

        // Type a query.
        search(host, "gamma");
        expect(host.querySelector(".cg-stats")?.textContent).toBe("1 of 4 projects");

        // Clear it the way the modal keymap does.
        tree.clearSearch();

        // Require the full graph again.
        expect(host.querySelector(".cg-stats")?.textContent).toBe("2 areas · 4 projects · 1 program");

        // Clean up the listeners.
        tree.dispose();
    });
});