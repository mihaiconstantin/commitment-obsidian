import { beforeEach, describe, expect, it, vi } from "vitest";

import { Menu, Notice } from "obsidian";

import { GraphTree } from "../../src/ui/graph-tree";
import { CONFIG } from "../../src/constants";
import type { ContainerFileActions } from "../../src/containers/container-file-actions";
import { PROJECT_STATES, type ProjectState } from "../../src/graph/project-state";
import type { GraphArea } from "../../src/graph/types";
import type { AppearanceSettings, GraphSort, TreeDefaultsSettings } from "../../src/settings/settings";


const AREAS: readonly GraphArea[] = [
    {
        id: "work",
        active: null,
        projects: ["alpha", "beta"],
        programs: [{ id: "phd", state: null, projects: ["gamma"] }],
        projectStates: new Map<string, ProjectState>(),
    },
    {
        id: "home",
        active: null,
        projects: ["chores"],
        programs: [],
        projectStates: new Map<string, ProjectState>(),
    },
];


const FILTER_AREAS: readonly GraphArea[] = [
    {
        id: "states",
        active: true,
        projects: [
            "project-active",
            "project-done",
            "project-dropped",
            "project-no-state",
            "project-paused",
            "project-planned",
            "project-triage",
        ],
        programs: [{ id: "mixed", state: "active", projects: ["program-active", "program-done"] }],
        projectStates: new Map<string, ProjectState>([
            ["project-active", "active"],
            ["project-done", "done"],
            ["project-dropped", "dropped"],
            ["project-paused", "paused"],
            ["project-planned", "planned"],
            ["project-triage", "triage"],
            ["program-active", "active"],
            ["program-done", "done"],
        ]),
    },
    {
        id: "inactive",
        active: false,
        projects: ["inactive-project"],
        programs: [],
        projectStates: new Map<string, ProjectState>([["inactive-project", "active"]]),
    },
    {
        id: "implicit",
        active: null,
        projects: ["implicit-project"],
        programs: [],
        projectStates: new Map<string, ProjectState>([["implicit-project", "planned"]]),
    },
];


const STABLE_AREAS: readonly GraphArea[] = [
    {
        id: "work-tiu",
        active: true,
        projects: ["finished-direct"],
        programs: [
            { id: "active-program", state: "active", projects: ["finished-coordinated"] },
        ],
        projectStates: new Map<string, ProjectState>([
            ["finished-direct", "done"],
            ["finished-coordinated", "done"],
        ]),
    },
    {
        id: "empty",
        active: true,
        projects: [],
        programs: [],
        projectStates: new Map<string, ProjectState>(),
    },
];


const PROGRAM_STATE_AREAS: readonly GraphArea[] = [
    {
        id: "work",
        active: true,
        projects: [],
        programs: [
            { id: "active-program", state: "active", projects: [] },
            { id: "planned-program", state: "planned", projects: [] },
            { id: "paused-program", state: "paused", projects: [] },
            { id: "done-program", state: "done", projects: ["active-under-done"] },
            { id: "dropped-program", state: "dropped", projects: [] },
            { id: "unknown-program", state: null, projects: ["unknown-project"] },
        ],
        projectStates: new Map<string, ProjectState>([
            ["active-under-done", "active"],
            ["unknown-project", "active"],
        ]),
    },
];


/** Mount the tree into a fresh container. */
function mount(areas: readonly GraphArea[] = AREAS, actions: ContainerFileActions | null = null, sort: GraphSort = "count", appearance: AppearanceSettings = CONFIG.DEFAULT_SETTINGS.appearance, defaults: TreeDefaultsSettings = CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults): { host: HTMLElement; tree: GraphTree } {
    // Create the host element.
    const host: HTMLElement = document.createElement("div");

    // Attach it so focus and native folding behave like the modal.
    document.body.append(host);

    // Mount the tree and return its boundary.
    return { host, tree: new GraphTree(host, areas, sort, actions, appearance, defaults) };
}


/** Return one area's native folding element. */
function areaDetails(host: HTMLElement, id: string = "work"): HTMLDetailsElement {
    // Read the built area element by its stable key.
    return host.querySelector(
        `details.cg-row[data-cg-key="area:${id}"]`,
    ) as HTMLDetailsElement;
}


/** Return one program's native folding element. */
function programDetails(host: HTMLElement, id: string = "phd", area: string = "work"): HTMLDetailsElement {
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


/** Project or program state menu. */
type StateScope = "project" | "program";


/** Open one state menu from its button. */
function openStateMenu(host: HTMLElement, scope: StateScope = "project"): Menu {
    // Click the requested state menu button.
    const button: HTMLButtonElement = host.querySelector(
        `.cg-states-button[data-cg-state-scope="${scope}"]`,
    ) as HTMLButtonElement;
    button.click();

    // Read the menu opened by the click.
    const menu: Menu | undefined = Menu.instances[Menu.instances.length - 1];
    if (menu === undefined) {
        // Report a missing test fixture.
        throw new Error(`Missing ${scope} state menu`);
    }

    // Return the opened menu.
    return menu;
}


/** Toggle one project state through the native menu. */
function setState(host: HTMLElement, state: ProjectState, checked: boolean): void {
    // Open the project menu and find the item for this state.
    const menu: Menu = openStateMenu(host, "project");
    const item = menu.items[PROJECT_STATES.indexOf(state)];
    if (item === undefined) {
        // Report a missing test fixture.
        throw new Error(`Missing project state menu item: ${state}`);
    }

    // Close the menu when the item already has the requested state.
    if (item.checked === checked) {
        menu.hide();
        return;
    }

    // Toggle the item and let the production handler apply the change.
    item.click();
}


/** Toggle one program state through the native menu. */
function setProgramState(host: HTMLElement, state: ProjectState, checked: boolean): void {
    // Open the program menu and find the item for this state.
    const menu: Menu = openStateMenu(host, "program");
    const item = menu.items[PROJECT_STATES.indexOf(state)];
    if (item === undefined) {
        // Report a missing test fixture.
        throw new Error(`Missing program state menu item: ${state}`);
    }

    // Close the menu when the item already has the requested state.
    if (item.checked === checked) {
        menu.hide();
        return;
    }

    // Toggle the item and let the production handler apply the change.
    item.click();
}


/** Select exactly one program state through the native menu. */
function setOnlyProgramState(host: HTMLElement, selected: ProjectState): void {
    // Apply each program state selection.
    for (const state of PROJECT_STATES) {
        setProgramState(host, state, state === selected);
    }
}


/** Toggle the area relevance checkbox and apply the change synchronously. */
function setInactive(host: HTMLElement, checked: boolean): void {
    // Read the area checkbox.
    const input: HTMLInputElement = host.querySelector(
        ".cg-filters input[data-cg-scope='area']",
    ) as HTMLInputElement;

    // Update the checkbox to the requested state.
    input.checked = checked;

    // Dispatch the immediate change event.
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
    Menu.instances = [];
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
        expect(host.querySelector(".cg-list")?.classList.contains("commitment-modal__scroll")).toBe(true);
        expect(host.querySelector(".cg-gutter")).toBeNull();
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(true);
    });

    it("renders project and program state menus", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Require the filter row and both state menu buttons.
        expect(host.querySelector(".cg-filters")).not.toBeNull();
        const projectButton: HTMLButtonElement = host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        ) as HTMLButtonElement;
        const programButton: HTMLButtonElement = host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        ) as HTMLButtonElement;
        expect(projectButton.textContent).toBe("Project States: 6/6");
        expect(programButton.textContent).toBe("Program States: 6/6");
        expect(projectButton.getAttribute("aria-haspopup")).toBe("menu");
        expect(programButton.getAttribute("aria-haspopup")).toBe("menu");
        expect(projectButton.getAttribute("aria-expanded")).toBe("false");
        expect(programButton.getAttribute("aria-expanded")).toBe("false");
        expect(projectButton.getAttribute("aria-label")).toBe(
            "Project States: 6 of 6 selected",
        );
        expect(programButton.getAttribute("aria-label")).toBe(
            "Program States: 6 of 6 selected",
        );

        // Require the project menu items in order with every state checked.
        const projectMenu: Menu = openStateMenu(host, "project");
        expect(projectMenu.items.map((item): string => item.title)).toEqual([
            "Triage",
            "Planned",
            "Active",
            "Paused",
            "Done",
            "Dropped",
        ]);
        expect(projectMenu.items.every((item): boolean => item.checked === true)).toBe(true);
        expect(projectButton.getAttribute("aria-expanded")).toBe("true");

        // Require the same six states in the program menu.
        const programMenu: Menu = openStateMenu(host, "program");
        expect(programMenu.items.map((item): string => item.title)).toEqual([
            "Triage",
            "Planned",
            "Active",
            "Paused",
            "Done",
            "Dropped",
        ]);
        expect(programMenu.items.every((item): boolean => item.checked === true)).toBe(true);
        expect(programButton.getAttribute("aria-expanded")).toBe("true");

        // Require no inline state checkboxes.
        expect(host.querySelector(".cg-states input[data-cg-state]")).toBeNull();

        // Require the unchecked area scope checkbox.
        const scopes: readonly HTMLInputElement[] = Array.from(
            host.querySelectorAll<HTMLInputElement>(".cg-filters input[data-cg-scope]"),
        );
        expect(scopes.map((box: HTMLInputElement): string | undefined => box.dataset.cgScope)).toEqual([
            "area",
        ]);
        expect(scopes.every((box: HTMLInputElement): boolean => box.checked)).toBe(false);

        // Require no alternate state control or row badge.
        expect(host.querySelector(".cg-select")).toBeNull();
        expect(host.querySelector(".cg-clear")).toBeNull();
        expect(host.querySelector(".cg-badge")).toBeNull();
        expect(host.querySelector(".cg-gutter")).toBeNull();
        expect(host.querySelector(".cg-row .cg-check")).toBeNull();
    });

    it("starts with the configured project state defaults", () => {
        // Mount the graph with only active projects selected.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            projectStates: ["active"],
        };
        const { host } = mount(
            FILTER_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );

        // Require both state buttons to report the configured defaults.
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 1/6");
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 6/6");

        // Require only active project rows to remain visible.
        expect(projectRow(host, "project-active").hidden).toBe(false);
        expect(projectRow(host, "project-done").hidden).toBe(true);
        expect(projectRow(host, "program-active").hidden).toBe(false);
        expect(projectRow(host, "program-done").hidden).toBe(true);

        // Require the menu to reflect the same initial selection.
        const menu: Menu = openStateMenu(host, "project");
        expect(menu.items.map((item): boolean => item.checked === true)).toEqual([
            false,
            false,
            true,
            false,
            false,
            false,
        ]);
    });

    it("starts with the configured program state defaults", () => {
        // Mount the graph with only active programs selected.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            programStates: ["active"],
        };
        const { host } = mount(
            PROGRAM_STATE_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );

        // Require both state buttons to report the configured defaults.
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 6/6");
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 1/6");

        // Require only active and unknown-state programs to remain visible.
        expect(programDetails(host, "active-program", "work").hidden).toBe(false);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);
        expect(projectRow(host, "active-under-done").hidden).toBe(true);

        // Require the menu to reflect the same initial selection.
        const menu: Menu = openStateMenu(host, "program");
        expect(menu.items.map((item): boolean => item.checked === true)).toEqual([
            false,
            false,
            true,
            false,
            false,
            false,
        ]);
    });

    it("starts with the configured area visibility default", () => {
        // Mount the graph with inactive areas hidden by default.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            hideInactiveAreas: true,
        };
        const { host } = mount(
            FILTER_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );

        // Require the checkbox to start checked and the inactive area to hide.
        const box: HTMLInputElement = host.querySelector(
            ".cg-filters input[data-cg-scope='area']",
        ) as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(areaDetails(host, "inactive").hidden).toBe(true);
        expect(areaDetails(host, "states").hidden).toBe(false);
    });

    it("restores folds made after opening with restrictive defaults", () => {
        // Mount the graph with only active programs selected.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            programStates: ["active"],
        };
        const { host } = mount(
            PROGRAM_STATE_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );
        const active: HTMLDetailsElement = programDetails(host, "active-program", "work");

        // Fold a visible program after the initial default render.
        expect(active.open).toBe(true);
        summary(active).click();
        expect(active.open).toBe(false);

        // Apply and clear a temporary search, then require the fold to survive.
        search(host, "active-program");
        expect(active.open).toBe(true);
        search(host, "");
        expect(active.open).toBe(false);
    });

    it("discards fold snapshots when search returns to defaults", () => {
        // Mount the graph with inactive areas hidden by default.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            hideInactiveAreas: true,
        };
        const { host } = mount(
            FILTER_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );

        // Apply and clear a search to return to the opening defaults.
        search(host, "project-active");
        search(host, "");

        // Fold an area and clear the area filter.
        const states: HTMLDetailsElement = areaDetails(host, "states");
        summary(states).click();
        expect(states.open).toBe(false);
        setInactive(host, false);
        expect(states.open).toBe(false);

        // Restore the opening defaults and require the fold to remain.
        setInactive(host, true);
        expect(states.open).toBe(false);
    });

    it("preserves folds when clearing all program state filters", () => {
        // Mount the graph with only active programs selected.
        const defaults: TreeDefaultsSettings = {
            ...CONFIG.DEFAULT_SETTINGS.presentation.treeDefaults,
            programStates: ["active"],
        };
        const { host } = mount(
            PROGRAM_STATE_AREAS,
            null,
            "count",
            CONFIG.DEFAULT_SETTINGS.appearance,
            defaults,
        );
        const active: HTMLDetailsElement = programDetails(host, "active-program", "work");

        // Fold a visible program after the initial default render.
        summary(active).click();
        expect(active.open).toBe(false);

        // Clear the program filter and require the fold to remain.
        for (const state of PROJECT_STATES) {
            setProgramState(host, state, true);
        }
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 6/6");
        expect(active.open).toBe(false);
    });

    it("toggles project states from the native menu", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Open the menu and hide the done state.
        const menu: Menu = openStateMenu(host, "project");
        const done = menu.items[PROJECT_STATES.indexOf("done")];
        expect(done?.checked).toBe(true);
        done?.click();

        // Require the menu to close, the button to update, and the row to hide.
        expect(menu.hidden).toBe(true);
        const button: HTMLButtonElement = host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        ) as HTMLButtonElement;
        expect(button.textContent).toBe("Project States: 5/6");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(button.getAttribute("aria-label")).toBe("Project States: 5 of 6 selected");
        expect(projectRow(host, "project-done").hidden).toBe(true);

        // Reopen the menu and require the done item to stay unchecked.
        const reopened: Menu = openStateMenu(host, "project");
        expect(reopened.items[PROJECT_STATES.indexOf("done")]?.checked).toBe(false);
    });

    it("toggles program states from the native menu", () => {
        // Mount one area with programs in every state plus an unknown state.
        const { host } = mount(PROGRAM_STATE_AREAS);

        // Open the program menu and hide the done state.
        const menu: Menu = openStateMenu(host, "program");
        const done = menu.items[PROJECT_STATES.indexOf("done")];
        expect(done?.checked).toBe(true);
        done?.click();

        // Require the menu to close, the button to update, and the program to hide.
        expect(menu.hidden).toBe(true);
        const button: HTMLButtonElement = host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        ) as HTMLButtonElement;
        expect(button.textContent).toBe("Program States: 5/6");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);

        // Reopen the menu and require the done item to stay unchecked.
        const reopened: Menu = openStateMenu(host, "program");
        expect(reopened.items[PROJECT_STATES.indexOf("done")]?.checked).toBe(false);
    });

    it("keeps project and program menu selections independent", () => {
        // Hide a project state and require the program menu to stay complete.
        const first = mount(PROGRAM_STATE_AREAS);
        const projectMenu: Menu = openStateMenu(first.host, "project");
        projectMenu.items[PROJECT_STATES.indexOf("done")]?.click();
        expect(first.host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 5/6");
        expect(programDetails(first.host, "done-program", "work").hidden).toBe(false);
        const programMenu: Menu = openStateMenu(first.host, "program");
        expect(programMenu.items.every((item): boolean => item.checked === true)).toBe(true);
        expect(first.host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 6/6");
        first.host.remove();

        // Hide a program state and require the project menu to stay complete.
        const second = mount(PROGRAM_STATE_AREAS);
        const changedProgramMenu: Menu = openStateMenu(second.host, "program");
        changedProgramMenu.items[PROJECT_STATES.indexOf("done")]?.click();
        expect(second.host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 5/6");
        expect(programDetails(second.host, "done-program", "work").hidden).toBe(true);
        const unchangedProjectMenu: Menu = openStateMenu(second.host, "project");
        expect(unchangedProjectMenu.items.every(
            (item): boolean => item.checked === true,
        )).toBe(true);
        expect(second.host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 6/6");
    });

    it("filters projects by state and keeps program context", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Hide the done state.
        setState(host, "done", false);

        // Require the done projects and the project without a recognized state to disappear.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 of 3 areas · 8 of 11 projects · 1 of 1 program",
        );
        expect(projectRow(host, "project-done").hidden).toBe(true);
        expect(projectRow(host, "program-done").hidden).toBe(true);
        expect(projectRow(host, "project-no-state").hidden).toBe(true);

        // Require every selected recognized state to remain visible.
        for (const identifier of [
            "project-active",
            "project-dropped",
            "project-paused",
            "project-planned",
            "project-triage",
            "inactive-project",
            "implicit-project",
        ]) {
            expect(projectRow(host, identifier).hidden).toBe(false);
        }

        // Require the mixed program to remain with its selected project.
        const mixed: HTMLDetailsElement = programDetails(host, "mixed", "states");
        expect(mixed.hidden).toBe(false);
        expect(mixed.querySelector(".cg-num")?.textContent).toBe("1");
        expect(areaDetails(host, "states").querySelector(".cg-num")?.textContent).toBe("6");
        expect(projectRow(host, "program-active").hidden).toBe(false);
    });

    it("filters to each exact project state", () => {
        // Define the visible project total for one selected state.
        const cases: ReadonlyArray<readonly [ProjectState, number]> = [
            ["triage", 1],
            ["planned", 2],
            ["active", 3],
            ["paused", 1],
            ["done", 2],
            ["dropped", 1],
        ];
        for (const [selected, visible] of cases) {
            // Mount a fresh graph and select only this state.
            const { host } = mount(FILTER_AREAS);
            for (const state of PROJECT_STATES) {
                setState(host, state, state === selected);
            }

            // Require stable area and program rows with the selected project total.
            expect(host.querySelector(".cg-stats")?.textContent).toBe(
                `3 of 3 areas · ${visible} of 11 projects · 1 of 1 program`,
            );
            expect(projectRow(host, "project-no-state").hidden).toBe(true);

            // Drop this mount before checking the next state.
            host.remove();
        }
    });

    it("hides projects without a recognized state when a state filter is active", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Require the project without a recognized state with no state constraint.
        expect(projectRow(host, "project-no-state").hidden).toBe(false);

        // Hide one state and require the project without a recognized state to disappear.
        setState(host, "done", false);
        expect(projectRow(host, "project-no-state").hidden).toBe(true);

        // Recheck the state and require the project to return.
        setState(host, "done", true);
        expect(projectRow(host, "project-no-state").hidden).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 areas · 11 projects · 1 program",
        );
    });

    it("keeps area and program rows when all states are unchecked", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Uncheck every recognized state.
        for (const state of PROJECT_STATES) {
            setState(host, state, false);
        }

        // Require structural rows to remain while every project row is hidden.
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='project']",
        )?.textContent).toBe("Project States: 0/6");
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 of 3 areas · 0 of 11 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(areaDetails(host, "implicit").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(projectRow(host, "project-active").hidden).toBe(true);
    });

    it("restores the pre-filter fold state when every state is rechecked", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);
        const mixed: HTMLDetailsElement = programDetails(host, "mixed", "states");
        const implicit: HTMLDetailsElement = areaDetails(host, "implicit");

        // Fold one program and one area before filtering.
        summary(mixed).click();
        summary(implicit).click();
        expect(mixed.open).toBe(false);
        expect(implicit.open).toBe(false);

        // Hide the done state and require visible rows to open.
        setState(host, "done", false);
        expect(mixed.open).toBe(true);
        expect(implicit.open).toBe(true);

        // Recheck the state and require the original folds.
        setState(host, "done", true);
        expect(mixed.open).toBe(false);
        expect(implicit.open).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 areas · 11 projects · 1 program",
        );

        // Require every default project row and area to return.
        for (const identifier of [
            "project-active",
            "project-done",
            "project-dropped",
            "project-no-state",
            "project-paused",
            "project-planned",
            "project-triage",
            "program-active",
            "program-done",
            "inactive-project",
            "implicit-project",
        ]) {
            expect(projectRow(host, identifier).hidden).toBe(false);
        }
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(areaDetails(host, "implicit").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
    });

    it("keeps all summary dimensions when a filter hides nothing", () => {
        // Mount areas that have no explicit inactive relevance.
        const { host } = mount();

        // Apply the area filter without hiding any row.
        setInactive(host, true);

        // Require visible-of-total counts for all three dimensions.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 of 2 areas · 4 of 4 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(areaDetails(host, "home").hidden).toBe(false);
    });

    it("hides only explicitly inactive areas when the area filter is checked", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);
        const mixed: HTMLDetailsElement = programDetails(host, "mixed", "states");
        const implicit: HTMLDetailsElement = areaDetails(host, "implicit");

        // Fold one program and one area before filtering.
        summary(mixed).click();
        summary(implicit).click();
        expect(mixed.open).toBe(false);
        expect(implicit.open).toBe(false);

        // Hide explicitly inactive areas and open visible rows.
        setInactive(host, true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 of 3 areas · 10 of 11 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "inactive").hidden).toBe(true);
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(areaDetails(host, "implicit").hidden).toBe(false);
        expect(projectRow(host, "inactive-project").hidden).toBe(true);
        expect(mixed.open).toBe(true);
        expect(implicit.open).toBe(true);

        // Restore every area and the pre-filter folds.
        setInactive(host, false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 areas · 11 projects · 1 program",
        );
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(mixed.open).toBe(false);
        expect(implicit.open).toBe(false);
    });

    it("composes state filters with the text query", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Hide the done state.
        setState(host, "done", false);

        // Require a hidden done project to stay hidden when queried.
        search(host, "project-done");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 of 3 areas · 0 of 11 projects · 0 of 1 program",
        );
        expect(host.querySelector(".cg-empty")?.textContent).toBe(
            "No match for `project-done` under the current filters.",
        );
        expect(areaDetails(host, "states").hidden).toBe(true);

        // Require a matching area name to keep only selected projects.
        search(host, "states");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 1 of 11 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(projectRow(host, "program-active").hidden).toBe(false);
        expect(projectRow(host, "program-done").hidden).toBe(true);

        // Require a matching program name to keep only selected projects.
        search(host, "mixed");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 1 of 11 projects · 1 of 1 program",
        );
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(projectRow(host, "program-active").hidden).toBe(false);
        expect(projectRow(host, "program-done").hidden).toBe(true);
    });

    it("composes the query with the inactive-area filter", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Match the inactive area and its direct project by name.
        search(host, "inactive");
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(projectRow(host, "inactive-project").hidden).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 1 of 11 projects · 0 of 1 program",
        );

        // Hide the matching inactive area and report the filter-composed empty result.
        setInactive(host, true);
        expect(areaDetails(host, "inactive").hidden).toBe(true);
        expect(host.querySelector(".cg-empty")?.textContent).toBe(
            "No match for `inactive` under the current filters.",
        );
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 of 3 areas · 0 of 11 projects · 0 of 1 program",
        );

        // Restore the area and its query result.
        setInactive(host, false);
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(projectRow(host, "inactive-project").hidden).toBe(false);
    });

    it("composes query, state, and inactive-area filters", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Hide done projects and the inactive area, then query the active state.
        setState(host, "done", false);
        setInactive(host, true);
        search(host, "active");

        // Require only the active projects in the active area.
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(projectRow(host, "project-active").hidden).toBe(false);
        expect(projectRow(host, "program-active").hidden).toBe(false);
        expect(projectRow(host, "inactive-project").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 2 of 11 projects · 1 of 1 program",
        );

        // Clear the query and restore the state-and-area filter result.
        search(host, "");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 of 3 areas · 7 of 11 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "inactive").hidden).toBe(true);
    });

    it("keeps a program when no selected projects remain", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Hide both states used by the mixed program.
        setState(host, "active", false);
        setState(host, "done", false);

        // Require the program, area, and other areas to remain visible.
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").querySelector(".cg-num")?.textContent).toBe("0");
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(areaDetails(host, "inactive").hidden).toBe(false);
        expect(areaDetails(host, "implicit").hidden).toBe(false);
        expect(projectRow(host, "program-active").hidden).toBe(true);
        expect(projectRow(host, "program-done").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "3 of 3 areas · 5 of 11 projects · 1 of 1 program",
        );
    });

    it("keeps active areas and programs when project filtering removes every project", () => {
        // Mount an active area with completed work and an active area with no projects.
        const { host } = mount(STABLE_AREAS);

        // Hide the completed state.
        setState(host, "done", false);

        // Require every structural row to remain with zero visible projects.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 of 2 areas · 0 of 2 projects · 1 of 1 program",
        );
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(true);
        expect(areaDetails(host, "work-tiu").hidden).toBe(false);
        expect(areaDetails(host, "empty").hidden).toBe(false);
        expect(programDetails(host, "active-program", "work-tiu").hidden).toBe(false);
        expect(projectRow(host, "finished-direct").hidden).toBe(true);
        expect(projectRow(host, "finished-coordinated").hidden).toBe(true);
        expect(areaDetails(host, "work-tiu").querySelector(".cg-num")?.textContent).toBe("0");
        expect(areaDetails(host, "empty").querySelector(".cg-num")?.textContent).toBe("0");

        // Require the meter to follow the visible count.
        const fill: HTMLElement = areaDetails(host, "work-tiu").querySelector(
            ".cg-meter i",
        ) as HTMLElement;
        expect(fill.style.width).toBe("0%");

        // Require an area match to keep the empty area visible under the state filter.
        search(host, "empty");
        expect(areaDetails(host, "empty").hidden).toBe(false);
        expect(areaDetails(host, "work-tiu").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 2 areas · 0 of 2 projects · 0 of 1 program",
        );

        // Require a missing query to hide every area and report the combined filters.
        search(host, "missing");
        expect(host.querySelector(".cg-empty")?.hasAttribute("hidden")).toBe(false);
        expect(host.querySelector(".cg-empty")?.textContent).toBe(
            "No match for `missing` under the current filters.",
        );

        // Require the area scope filter to keep active areas with no projects.
        search(host, "");
        setInactive(host, true);
        expect(areaDetails(host, "work-tiu").hidden).toBe(false);
        expect(areaDetails(host, "empty").hidden).toBe(false);
    });

    it("filters programs by their own state and keeps unknown states visible", () => {
        // Mount one area with programs in every state plus an unknown state.
        const { host } = mount(PROGRAM_STATE_AREAS);

        // Require every program before the program filter is active.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 area · 2 projects · 6 programs",
        );
        expect(programDetails(host, "done-program", "work").hidden).toBe(false);
        expect(projectRow(host, "active-under-done").hidden).toBe(false);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);

        // Select only the active program state.
        setOnlyProgramState(host, "active");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 1 area · 1 of 2 projects · 2 of 6 programs",
        );
        expect(programDetails(host, "active-program", "work").hidden).toBe(false);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(programDetails(host, "planned-program", "work").hidden).toBe(true);
        expect(programDetails(host, "paused-program", "work").hidden).toBe(true);
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(programDetails(host, "dropped-program", "work").hidden).toBe(true);
        expect(projectRow(host, "active-under-done").hidden).toBe(true);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);

        // Require the area meter to follow the visible project count.
        const fill: HTMLElement = areaDetails(host, "work").querySelector(
            ".cg-meter i",
        ) as HTMLElement;
        expect(fill.style.width).toBe("50%");

        // Require a hidden program query to report the combined filters.
        search(host, "done-program");
        expect(areaDetails(host, "work").hidden).toBe(true);
        expect(host.querySelector(".cg-empty")?.textContent).toBe(
            "No match for `done-program` under the current filters.",
        );

        // Require a project inside the hidden program to stay hidden.
        search(host, "active-under-done");
        expect(areaDetails(host, "work").hidden).toBe(true);
        expect(host.querySelector(".cg-empty")?.textContent).toBe(
            "No match for `active-under-done` under the current filters.",
        );

        // Require an area match to keep only the in-scope program rows.
        search(host, "work");
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(programDetails(host, "active-program", "work").hidden).toBe(false);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(projectRow(host, "active-under-done").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 1 area · 1 of 2 projects · 2 of 6 programs",
        );

        // Clear the query and select active projects with both scope filters.
        search(host, "");
        for (const state of PROJECT_STATES) {
            setState(host, state, state === "active");
        }
        setInactive(host, true);
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(programDetails(host, "active-program", "work").hidden).toBe(false);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(projectRow(host, "active-under-done").hidden).toBe(true);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 1 area · 1 of 2 projects · 2 of 6 programs",
        );
    });

    it("keeps matching zero-project rows under a state filter", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Hide both states used by the mixed program.
        setState(host, "active", false);
        setState(host, "done", false);

        // Require a matching program to remain visible with zero projects.
        search(host, "mixed");
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").querySelector(".cg-num")?.textContent).toBe("0");
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 0 of 11 projects · 1 of 1 program",
        );

        // Require a matching area to keep the same zero-project program row.
        search(host, "states");
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").querySelector(".cg-num")?.textContent).toBe("0");
        expect(areaDetails(host, "states").hidden).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 3 areas · 0 of 11 projects · 1 of 1 program",
        );
    });

    it("keeps areas and unknown programs when no program state is selected", () => {
        // Mount one area with programs in every state plus an unknown state.
        const { host } = mount(PROGRAM_STATE_AREAS);

        // Uncheck every recognized program state.
        for (const state of PROJECT_STATES) {
            setProgramState(host, state, false);
        }

        // Require recognized programs to hide while the area and unknown program remain.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 1 area · 1 of 2 projects · 1 of 6 programs",
        );
        expect(host.querySelector(
            ".cg-states-button[data-cg-state-scope='program']",
        )?.textContent).toBe("Program States: 0/6");
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(programDetails(host, "unknown-program", "work").hidden).toBe(false);
        expect(programDetails(host, "done-program", "work").hidden).toBe(true);
        expect(projectRow(host, "unknown-project").hidden).toBe(false);
    });

    it("restores folds after program state filtering", () => {
        // Mount one area with programs in every state plus an unknown state.
        const { host } = mount(PROGRAM_STATE_AREAS);
        const active: HTMLDetailsElement = programDetails(host, "active-program", "work");
        const done: HTMLDetailsElement = programDetails(host, "done-program", "work");

        // Fold one visible program and one program that the filter will hide.
        summary(active).click();
        summary(done).click();
        expect(active.open).toBe(false);
        expect(done.open).toBe(false);

        // Select active programs only and require visible rows to open.
        setOnlyProgramState(host, "active");
        expect(active.open).toBe(true);
        expect(done.hidden).toBe(true);

        // Restore every program state and require the original folds.
        for (const state of PROJECT_STATES) {
            setProgramState(host, state, true);
        }
        expect(active.open).toBe(false);
        expect(done.open).toBe(false);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 area · 2 projects · 6 programs",
        );
    });

    it("ignores hidden programs when choosing the expand action", () => {
        // Mount one area with programs in every state plus an unknown state.
        const { host } = mount(PROGRAM_STATE_AREAS);
        const done: HTMLDetailsElement = programDetails(host, "done-program", "work");

        // Fold the program that the filter will hide.
        summary(done).click();
        expect(done.open).toBe(false);

        // Hide the folded program first, then select active programs only.
        setProgramState(host, "done", false);
        for (const state of ["triage", "planned", "paused", "dropped"] as const) {
            setProgramState(host, state, false);
        }
        expect(done.hidden).toBe(true);
        const toggle: HTMLButtonElement = host.querySelector(".cg-toggle") as HTMLButtonElement;
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");

        // Collapse the visible area and keep the hidden program folded.
        toggle.click();
        expect(areaDetails(host, "work").open).toBe(false);
        expect(done.open).toBe(false);
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");
    });

    it("composes program scope with state and area scope", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Select dropped projects and active programs, then hide inactive areas.
        for (const state of PROJECT_STATES) {
            setState(host, state, state === "dropped");
        }
        setOnlyProgramState(host, "active");
        setInactive(host, true);

        // Require the active program row and implicit area to remain.
        expect(programDetails(host, "mixed", "states").hidden).toBe(false);
        expect(programDetails(host, "mixed", "states").querySelector(".cg-num")?.textContent).toBe("0");
        expect(areaDetails(host, "inactive").hidden).toBe(true);
        expect(areaDetails(host, "implicit").hidden).toBe(false);
        expect(projectRow(host, "implicit-project").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "2 of 3 areas · 1 of 11 projects · 1 of 1 program",
        );
    });

    it("adds no row state badges or labels", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);

        // Require no badge or state control inside a row.
        expect(host.querySelector(".cg-badge")).toBeNull();
        expect(host.querySelector(".cg-row .cg-check")).toBeNull();

        // Require every row name to stay an identifier rather than a state label.
        for (const name of host.querySelectorAll(".cg-row .cg-nm")) {
            expect(["Triage", "Planned", "Active", "Paused", "Done", "Dropped"]).not.toContain(
                name.textContent,
            );
        }
    });

    it("uses singular count labels for a one-area graph", () => {
        // Mount a graph with one area and one direct project.
        const { host } = mount([
            {
                id: "work",
                active: null,
                projects: ["alpha"],
                programs: [],
                projectStates: new Map<string, ProjectState>(),
            },
        ]);

        // Require singular area and project labels.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 area · 1 project · 0 programs",
        );

        // Require the filtered total to keep every summary dimension.
        search(host, "alpha");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 1 area · 1 of 1 project · 0 programs",
        );
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

    it("applies the default accents to the tree host", () => {
        // Mount the tree with the shipped defaults.
        const { host } = mount();

        // Require the settings defaults on the host that owns the variables.
        expect(host.style.getPropertyValue("--cg-area")).toBe(
            CONFIG.DEFAULT_SETTINGS.appearance.area,
        );
        expect(host.style.getPropertyValue("--cg-program")).toBe(
            CONFIG.DEFAULT_SETTINGS.appearance.program,
        );
    });

    it("applies stored accents to the tree host", () => {
        // Mount the tree with one override per supported level.
        const { host } = mount(AREAS, null, "count", {
            area: "#112233",
            program: "#445566",
        });

        // Require every override on the host that owns the CSS variables.
        expect(host.style.getPropertyValue("--cg-area")).toBe("#112233");
        expect(host.style.getPropertyValue("--cg-program")).toBe("#445566");
    });

    it("reserves a count column for the widest area", () => {
        // Build one area with a two-digit project count.
        const projects: readonly string[] = Array.from(
            { length: 12 },
            (_value: unknown, index: number): string => `p${index}`,
        );
        const areas: readonly GraphArea[] = [
            {
                id: "work",
                active: null,
                projects,
                programs: [],
                projectStates: new Map<string, ProjectState>(),
            },
            {
                id: "home",
                active: null,
                projects: ["chores"],
                programs: [],
                projectStates: new Map<string, ProjectState>(),
            },
        ];

        // Mount the tree.
        const { host } = mount(areas);

        // Require a two-character column for every count.
        expect(host.style.getPropertyValue("--cg-count-ch")).toBe("2ch");
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

    it("chooses the expand action from visible rows only", () => {
        // Mount the graph with area relevance and project states.
        const { host } = mount(FILTER_AREAS);
        const inactive: HTMLDetailsElement = areaDetails(host, "inactive");
        const toggle: HTMLElement = host.querySelector(".cg-toggle") as HTMLElement;

        // Fold the area before hiding it.
        summary(inactive).click();
        expect(inactive.open).toBe(false);

        // Hide the inactive area; every visible row stays open.
        setInactive(host, true);
        expect(inactive.open).toBe(false);
        expect(toggle.getAttribute("aria-label")).toBe("Collapse all");

        // Collapse the visible areas without reopening hidden rows.
        toggle.click();
        expect(areaDetails(host, "states").open).toBe(false);
        expect(inactive.open).toBe(false);
        expect(toggle.getAttribute("aria-label")).toBe("Expand all");
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

        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 2 areas · 1 of 4 projects · 1 of 1 program",
        );
        expect(areaDetails(host, "work").hidden).toBe(false);
        expect(areaDetails(host, "home").hidden).toBe(true);
        expect(projectRow(host, "alpha").hidden).toBe(true);
        expect(projectRow(host, "beta").hidden).toBe(true);
        expect(projectRow(host, "gamma").hidden).toBe(false);
        expect(programDetails(host).hidden).toBe(false);
        expect(areaDetails(host, "work").querySelector(".cg-num")?.textContent).toBe("1");
        expect(programDetails(host).querySelector(".cg-num")?.textContent).toBe("1");

        // Require one highlight in the existing name elements.
        expect(projectRow(host, "gamma").querySelector(".cg-mark")?.textContent).toBe("gamma");
        expect(host.querySelectorAll(".cg-mark")).toHaveLength(1);

        // Require the built name element to survive filtering.
        expect(areaDetails(host).querySelector("summary .cg-node .cg-nm")).toBe(workName);

        // Move the highlight when the query changes.
        search(host, "alpha");
        expect(projectRow(host, "gamma").querySelector(".cg-mark")).toBeNull();
        expect(projectRow(host, "alpha").querySelector(".cg-mark")?.textContent).toBe("alpha");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 2 areas · 1 of 4 projects · 0 of 1 program",
        );
        expect(programDetails(host).hidden).toBe(true);
    });

    it("keeps a matching area visible while filtering its direct projects", () => {
        // Mount the tree.
        const { host } = mount();

        // Search for the area name.
        search(host, "work");

        // Require only the program project and the area highlight.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 2 areas · 1 of 4 projects · 1 of 1 program",
        );
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

        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "1 of 2 areas · 1 of 4 projects · 1 of 1 program",
        );
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
        expect(host.querySelector(".cg-empty")?.textContent).toBe("No match for `nothing-here`.");
        expect(areaDetails(host, "work").hidden).toBe(true);
        expect(areaDetails(host, "home").hidden).toBe(true);
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 of 2 areas · 0 of 4 projects · 0 of 1 program",
        );
    });

    it("keeps the empty graph message under every filter", () => {
        // Mount an empty graph.
        const { host } = mount([]);

        // Require the empty graph totals and message.
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 areas · 0 projects · 0 programs",
        );
        expect(host.querySelector(".cg-empty")?.textContent).toBe("No areas.");

        // Require the area filter to keep the empty graph message and plain counts.
        setInactive(host, true);
        expect(host.querySelector(".cg-empty")?.textContent).toBe("No areas.");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 areas · 0 projects · 0 programs",
        );

        // Require the state filter and query to keep the same boundary behavior.
        setState(host, "done", false);
        search(host, "ghost");
        expect(host.querySelector(".cg-empty")?.textContent).toBe("No areas.");
        expect(host.querySelector(".cg-stats")?.textContent).toBe(
            "0 areas · 0 projects · 0 programs",
        );
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
        const { host } = mount();
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

        // Clear the query and restore the captured state.
        search(host, "");
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
