/**
 * Interactive foldable graph tree used by the graph modal.
 *
 * The tree is the only production view; the JSON view renders the same graph
 * without rows. Rows use plain DOM, while icons use Obsidian's `setIcon` so the
 * tree follows the active theme.
 */

import { setIcon } from "obsidian";

import type { ContainerFileAction, ContainerFileActions } from "../containers/container-file-actions";
import type { ContainerIdentity, GraphArea, GraphProgram } from "../graph/types";
import {
    countArea,
    fileKey,
    filterArea,
    orderedAreas,
    readSort,
    rowIdentity,
    writeSort,
} from "./tree-model";
import type { AreaView, TreeSort } from "./tree-model";


/** Labels used by the tree chrome. */
const SEARCH_PLACEHOLDER: "Filter areas, programs, projects" = "Filter areas, programs, projects";


/** Delay before filtering so large vaults stay responsive while typing. */
const FILTER_DELAY: number = 90;


/** Duration of one copy confirmation message. */
const TOAST_DURATION: number = 1400;


/** Return one detached row line. */
function createLine(): HTMLElement {
    // Create the line that keeps the body, icon, and count on one row.
    const line: HTMLElement = document.createElement("div");
    line.className = "cg-line";
    return line;
}


/** Return the element text with the active query highlighted. */
function markedText(text: string, query: string): HTMLElement {
    // Create the text container with the shared name classes.
    const span: HTMLElement = document.createElement("span");
    span.className = "cg-nm cg-mono";

    // Add the plain text when no query is active.
    if (query === "") {
        // Set the whole identifier as text.
        span.textContent = text;
        return span;
    }

    // Split on every case-insensitive query occurrence.
    const pattern: RegExp = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts: readonly string[] = text.split(pattern);

    // Append each part, marking the matches.
    for (const part of parts) {
        // Skip an empty part produced by the split.
        if (part === "") {
            // Continue with the next part.
            continue;
        }

        // Mark a matched part.
        if (part.toLowerCase() === query.toLowerCase()) {
            // Add the highlight without interpreting markup.
            span.createEl("mark", { cls: "cg-mark", text: part });
            continue;
        }

        // Add the unmatched text.
        span.append(document.createTextNode(part));
    }

    // Return the highlighted text.
    return span;
}


/**
 * Interactive tree of areas, programs, and projects.
 *
 * The class owns the fold state, the active query and order, the toolbar and
 * list elements, the copy confirmation, and the single in-flight file action.
 * Row markup stays in class methods; only the line and marked-text helpers
 * live at module scope. Mount one tree per modal and call `dispose()` when it
 * closes.
 */
export class GraphTree {
    /** Areas shown by this tree, in graph order. */
    private readonly areas: readonly GraphArea[];

    /** File action seam, or null when the surface offers no file actions. */
    private readonly actions: ContainerFileActions | null;

    /** Area identifiers whose contents are folded. */
    private readonly foldedAreas: Set<string> = new Set<string>();

    /** Folded program identifiers by area identifier. */
    private readonly foldedPrograms: Map<string, Set<string>> = new Map<string, Set<string>>();

    /** Title element for the modal. */
    private readonly search: HTMLElement;

    /** Query field that drives filtering. */
    private readonly input: HTMLInputElement;

    /** Sort order control. */
    private readonly sortSelect: HTMLSelectElement;

    /** Control that expands or collapses every entry. */
    private readonly toggleAll: HTMLButtonElement;

    /** Totals line below the tools. */
    private readonly stats: HTMLElement;

    /** Scrolling list of rows. */
    private readonly list: HTMLElement;

    /** Copy confirmation element. */
    private readonly toast: HTMLElement;

    /** Largest area project count, used to size every meter. */
    private readonly maxTotal: number;

    /** Total project count across every area. */
    private readonly totalProjects: number;

    /** Total program count across every area. */
    private readonly totalPrograms: number;

    /** Active filter query. */
    private query: string = "";

    /** Active sort order. */
    private sort: TreeSort;

    /** Pending filter render, or zero when none is scheduled. */
    private filterTimer: number = 0;

    /** Pending toast hide, or zero when none is scheduled. */
    private toastTimer: number = 0;

    /** Whether one file action is already running. */
    private activating: boolean = false;

    /** Whether the tree released its timers. */
    private disposed: boolean = false;

    /** Construct and mount one tree inside the supplied container. */
    private constructor(container: HTMLElement, areas: readonly GraphArea[], actions: ContainerFileActions | null) {
        // Store the data and the optional file action seam.
        this.areas = areas;
        this.actions = actions;

        // Read the display totals once for the stats line and the meters.
        this.totalProjects = areas.reduce(
            (sum: number, area: GraphArea): number => sum + countArea(area),
            0,
        );
        this.totalPrograms = areas.reduce(
            (sum: number, area: GraphArea): number => sum + area.programs.length,
            0,
        );
        this.maxTotal = areas.reduce(
            (max: number, area: GraphArea): number => Math.max(max, countArea(area)),
            0,
        );

        // Read the remembered order before building the control.
        this.sort = readSort();

        // Clear any previous content.
        container.replaceChildren();

        // Build the search field, sort choice, stats line, list, and toast.
        this.search = container.createDiv({ cls: "cg-search" });
        this.input = document.createElement("input");
        this.sortSelect = document.createElement("select");
        this.toggleAll = document.createElement("button");
        this.stats = container.createEl("p", { cls: "cg-stats" });
        this.list = container.createDiv({ cls: "cg-list" });
        this.toast = container.createDiv({ cls: "cg-toast" });

        // Assemble the chrome and attach it to the container.
        this.buildChrome(container);

        // Wire the controls and the file action seam.
        this.bindControls();

        // Render the initial tree.
        this.render();
    }

    /** Create the tree in one container and return its control surface. */
    static mount(
        container: HTMLElement,
        areas: readonly GraphArea[],
        actions: ContainerFileActions | null = null,
    ): GraphTree {
        // Mount and return the new tree.
        return new GraphTree(container, areas, actions);
    }

    /** Focus the search field, used by the modal keymap. */
    focusSearch(): void {
        // Move focus to the search field.
        this.input.focus();
    }

    /** Report whether the search field currently has focus. */
    hasSearchFocus(): boolean {
        // Compare the focused element with the field.
        return document.activeElement === this.input;
    }

    /** Clear the query and leave the search field. */
    clearSearch(): void {
        // Reset the query.
        this.input.value = "";
        this.query = "";

        // Cancel a pending render and refresh immediately.
        window.clearTimeout(this.filterTimer);
        this.input.blur();
        this.render();
    }

    /** Cancel the pending timers owned by this tree. */
    dispose(): void {
        // Stop repeated calls from rescheduling work.
        if (this.disposed) {
            // Report that the tree already released its timers.
            return;
        }

        // Release both pending timers.
        this.disposed = true;
        window.clearTimeout(this.filterTimer);
        window.clearTimeout(this.toastTimer);
    }

    /** Build the toolbar, stats line, list, footer gutter, and toast. */
    private buildChrome(container: HTMLElement): void {
        // Build the search icon, field, and shortcut hint.
        const searchIcon: HTMLElement = this.search.createEl("span", { cls: "cg-search-icon" });
        setIcon(searchIcon, "search");
        this.input.type = "search";
        this.input.placeholder = SEARCH_PLACEHOLDER;
        this.input.setAttribute("aria-label", "Filter the graph");
        this.input.autocomplete = "off";
        this.input.spellcheck = false;
        this.search.append(searchIcon, this.input);
        this.search.createEl("kbd", { cls: "cg-kbd", text: "/" });

        // Build the sort control with both offered orders.
        this.sortSelect.className = "cg-select";
        this.sortSelect.setAttribute("aria-label", "Sort areas");
        const sortCount: HTMLOptionElement = document.createElement("option");
        sortCount.value = "count";
        sortCount.textContent = "Largest first";
        const sortName: HTMLOptionElement = document.createElement("option");
        sortName.value = "name";
        sortName.textContent = "A–Z";
        this.sortSelect.append(sortCount, sortName);

        // Apply the remembered order to the control.
        this.sortSelect.value = this.sort;

        // Build the single control that expands or collapses every entry.
        this.toggleAll.type = "button";
        this.toggleAll.className = "cg-btn cg-toggle";

        // Build the tools row.
        const tools: HTMLElement = container.createDiv({ cls: "cg-tools" });
        tools.append(this.search, this.sortSelect, this.toggleAll);

        // Mark the stats line as a live status region.
        this.stats.setAttribute("role", "status");

        // Mark the copy confirmation as a polite live region.
        this.toast.setAttribute("role", "status");
        this.toast.setAttribute("aria-live", "polite");

        // Build the footer gutter that keeps the list clear of the modal edge.
        const gutter: HTMLElement = container.createDiv({ cls: "cg-gutter" });

        // Assemble the tree chrome in the prototype order.
        container.append(tools, this.stats, this.list, gutter, this.toast);
    }

    /** Bind the filter, sort, expand, and file action controls. */
    private bindControls(): void {
        // Coalesce rapid keystrokes before re-rendering a large list.
        this.input.addEventListener("input", (): void => {
            // Read the latest trimmed query.
            this.query = this.input.value.trim();

            // Cancel a pending render for an older query.
            window.clearTimeout(this.filterTimer);

            // Re-render once typing pauses on a large vault.
            this.filterTimer = window.setTimeout((): void => this.render(), FILTER_DELAY);
        });

        // Re-order when the sort changes.
        this.sortSelect.addEventListener("change", (): void => {
            // Read the selected order.
            this.sort = this.sortSelect.value === "name" ? "name" : "count";

            // Remember the order for the next open.
            writeSort(this.sort);

            // Re-render the list.
            this.render();
        });

        // Expand everything, or collapse everything when already open.
        this.toggleAll.addEventListener("click", (): void => {
            // Fold every area when the tree is fully open.
            if (this.isFullyExpanded()) {
                // Record each folded area.
                for (const area of this.areas) {
                    // Record the folded area.
                    this.foldedAreas.add(area.id);
                }
            } else {
                // Clear every folded entry.
                this.foldedAreas.clear();
                this.foldedPrograms.clear();
            }

            // Re-render the list.
            this.render();
        });
    }

    /** Report whether every area and program is expanded. */
    private isFullyExpanded(): boolean {
        // Report false while any area is folded.
        if (this.foldedAreas.size > 0) {
            // Report the folded state.
            return false;
        }

        // Report false while any program is folded.
        for (const folded of this.foldedPrograms.values()) {
            // Report the folded state on the first folded program.
            if (folded.size > 0) {
                // Report the folded state.
                return false;
            }
        }

        // Report the expanded state when nothing is folded.
        return true;
    }

    /** Report whether one program is folded. */
    private isFolded(area: GraphArea, program: GraphProgram): boolean {
        // Read the folded set for the area.
        return this.foldedPrograms.get(area.id)?.has(program.id) ?? false;
    }

    /** Fold or unfold one program. */
    private toggleProgram(area: GraphArea, program: GraphProgram): void {
        // Read or start the folded set for the area.
        let folded: Set<string> | undefined = this.foldedPrograms.get(area.id);
        if (folded === undefined) {
            // Create the folded set.
            folded = new Set<string>();
            this.foldedPrograms.set(area.id, folded);
        }

        // Toggle the program entry.
        if (folded.has(program.id)) {
            // Remove the folded entry.
            folded.delete(program.id);
        } else {
            // Add the folded entry.
            folded.add(program.id);
        }
    }

    /** Show one short confirmation message. */
    private showToast(message: string): void {
        // Set the message and reveal it.
        this.toast.textContent = message;
        this.toast.classList.add("cg-toast--on");

        // Hide the message after a short delay.
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout((): void => {
            // Hide the message.
            this.toast.classList.remove("cg-toast--on");
        }, TOAST_DURATION);
    }

    /** Copy one identifier, with a fallback for denied clipboard access. */
    private copyIdentifier(identifier: string): void {
        // Prefer the asynchronous clipboard when it exists.
        if (navigator.clipboard?.writeText !== undefined) {
            // Copy the identifier and confirm the result.
            void navigator.clipboard.writeText(identifier).then(
                (): void => {
                    // Confirm the copy.
                    this.showToast(`Copied ${identifier}`);
                },
                (): void => {
                    // Report the denied copy.
                    this.showToast("Copy failed");
                },
            );
            return;
        }

        // Fall back to a temporary selection for restricted pages.
        const field: HTMLTextAreaElement = document.createElement("textarea");
        field.value = identifier;
        field.setAttribute("readonly", "");
        field.className = "cg-copy-field";
        document.body.append(field);
        field.select();
        try {
            // Report the copy only when the command succeeded.
            if (document.execCommand("copy")) {
                // Confirm the copy.
                this.showToast(`Copied ${identifier}`);
            } else {
                // Report the denied copy.
                this.showToast("Copy failed");
            }
        } catch {
            // Report the denied copy.
            this.showToast("Copy failed");
        }
        field.remove();
    }

    /** Activate one row's file action once at a time. */
    private async activate(identity: ContainerIdentity): Promise<void> {
        // Ignore repeated activation while one action is pending.
        if (this.activating || this.actions === null) {
            // Keep the current tree state.
            return;
        }

        // Acquire the single activation guard.
        this.activating = true;
        try {
            // Let the seam open or create the file.
            await this.actions.activate(identity);
        } catch {
            // The presenter reports activation failures and keeps the modal open.
        } finally {
            // Release the guard after the action settles.
            this.activating = false;
        }
    }

    /** Build one row's file action button. */
    private fileButton(identity: ContainerIdentity): HTMLButtonElement | null {
        // Add no icon without a seam.
        if (this.actions === null) {
            // Report no button.
            return null;
        }

        // Read the action the row offers.
        const action: ContainerFileAction = this.actions.actionFor(identity);
        const label: string = action === "open" ? `Open ${identity.id}` : `Create ${identity.id}`;

        // Create the icon button beside the row title.
        const button: HTMLButtonElement = document.createElement("button");
        button.type = "button";
        button.className = action === "open" ? "cg-file cg-file--open" : "cg-file cg-file--create";
        button.dataset.cgAction = action;
        button.dataset.cgKey = fileKey(identity);
        button.setAttribute("aria-label", label);
        button.title = label;

        // Add the pencil or plus icon.
        setIcon(button, action === "open" ? "pencil" : "plus");

        // Activate the file action without triggering the row body.
        button.addEventListener("click", (event: MouseEvent): void => {
            // Keep the body click behavior untouched.
            event.stopPropagation();

            // Run the guarded file action.
            void this.activate(identity);
        });

        // Return the completed button.
        return button;
    }

    /** Add one row's file action to its line when the seam offers one. */
    private appendFileAction(line: HTMLElement, identity: ContainerIdentity): void {
        // Build the action for this row.
        const button: HTMLButtonElement | null = this.fileButton(identity);

        // Add the action when the seam offers one.
        if (button !== null) {
            line.append(button);
        }
    }

    /** Add one project row at the supplied depth. */
    private projectRow(
        identifier: string,
        depth: number,
        area: string,
        program: string | null,
    ): HTMLElement {
        // Create the row wrapper.
        const row: HTMLElement = document.createElement("div");
        row.className = "cg-row";

        // Create the line that keeps the body, icon, and count on one row.
        const line: HTMLElement = createLine();

        // Create the copy button.
        const leaf: HTMLButtonElement = document.createElement("button");
        leaf.type = "button";
        leaf.className = program === null ? "cg-leaf" : "cg-leaf cg-leaf--program";
        leaf.style.setProperty("--cg-indent", String(depth));
        leaf.title = `Copy ${identifier}`;

        // Add the depth glyph.
        leaf.createEl("span", { cls: "cg-glyph", text: program === null ? "·" : "└" });

        // Add the highlighted identifier.
        leaf.append(markedText(identifier, this.query));

        // Copy the identifier on activation.
        leaf.addEventListener("click", (): void => {
            // Copy the selected identifier.
            this.copyIdentifier(identifier);
        });

        // Add the body button to the line.
        line.append(leaf);

        // Add the file icon immediately after the title.
        this.appendFileAction(line, rowIdentity("project", identifier, area, program));

        // Label a project that a program coordinates after its file action.
        if (program !== null) {
            // Add the program label outside the body button.
            line.createEl("span", { cls: "cg-tag", text: "in program" });
        }

        // Return the completed row.
        row.append(line);
        return row;
    }

    /** Add one area row with its visible projects and programs. */
    private areaRow(area: GraphArea, view: AreaView): HTMLElement {
        // Open every area while searching.
        const open: boolean = this.query !== "" || !this.foldedAreas.has(area.id);

        // Create the row wrapper and its single flex line.
        const row: HTMLElement = document.createElement("div");
        row.className = "cg-row";
        const line: HTMLElement = createLine();

        // Create the area toggle.
        const node: HTMLButtonElement = document.createElement("button");
        node.type = "button";
        node.className = "cg-node";
        node.setAttribute("aria-expanded", open ? "true" : "false");
        node.dataset.cgKey = `area:${area.id}`;
        node.style.setProperty("--cg-indent", "0");

        // Add the fold chevron.
        const chevron: HTMLElement = node.createEl("span", { cls: "cg-chev", text: "▼" });

        // Assemble the area body without the meter and count.
        node.append(chevron, markedText(area.id, this.query));

        // Add the body and file icon before the meter and count.
        line.append(node);
        this.appendFileAction(line, rowIdentity("area", area.id, area.id, null));

        // Add the size meter.
        const meter: HTMLElement = line.createEl("span", { cls: "cg-meter" });
        const fill: HTMLElement = meter.createEl("i");
        fill.style.width = `${this.maxTotal === 0 ? 0 : Math.round(countArea(area) / this.maxTotal * 100)}%`;

        // Add the visible project count.
        line.createEl("span", { cls: "cg-num", text: String(view.total) });

        // Toggle the area on activation.
        node.addEventListener("click", (): void => {
            // Fold an open area and unfold a folded one.
            if (open) {
                // Record the folded area.
                this.foldedAreas.add(area.id);
            } else {
                // Clear the folded area.
                this.foldedAreas.delete(area.id);
            }

            // Re-render the list.
            this.render();
        });

        // Add the area header line.
        row.append(line);

        // Render the area contents when it is open.
        if (open) {
            // Add each visible direct project.
            for (const project of view.projects) {
                // Add the direct project row.
                row.append(this.projectRow(project, 1, area.id, null));
            }

            // Add each visible program.
            for (const program of view.programs) {
                // Add the program header line and its coordinated projects.
                this.appendProgram(row, area, program);
            }
        }

        // Return the completed area row.
        return row;
    }

    /** Append one program header line and its coordinated project rows. */
    private appendProgram(row: HTMLElement, area: GraphArea, program: GraphProgram): void {
        // Open every program while searching.
        const programOpen: boolean = this.query !== "" || !this.isFolded(area, program);

        // Create the program line.
        const programLine: HTMLElement = createLine();

        // Create the program toggle.
        const programNode: HTMLButtonElement = document.createElement("button");
        programNode.type = "button";
        programNode.className = "cg-node cg-node--program";
        programNode.setAttribute("aria-expanded", programOpen ? "true" : "false");
        programNode.dataset.cgKey = `program:${area.id}/${program.id}`;
        programNode.style.setProperty("--cg-indent", "1");

        // Add the program identifier.
        const programText: HTMLElement = markedText(program.id, this.query);

        // Add the chevron before the identifier.
        programNode.createEl("span", { cls: "cg-chev", text: "▼" });
        programNode.append(programText);

        // Add the body and file icon before the tag and count.
        programLine.append(programNode);
        this.appendFileAction(programLine, rowIdentity("program", program.id, area.id, null));

        // Mark the program entry.
        programLine.createEl("span", { cls: "cg-tag", text: "program" });

        // Add the program project count.
        programLine.createEl("span", { cls: "cg-num", text: String(program.projects.length) });

        // Toggle the program on activation.
        programNode.addEventListener("click", (): void => {
            // Fold or unfold the program.
            this.toggleProgram(area, program);

            // Re-render the list.
            this.render();
        });

        // Add the program header line.
        row.append(programLine);

        // Render the program projects when it is open.
        if (programOpen) {
            // Add each coordinated project.
            for (const project of program.projects) {
                // Add the program project row.
                row.append(this.projectRow(project, 2, area.id, program.id));
            }
        }
    }

    /** Show the action that the expand control performs from the current state. */
    private updateToggleAll(): void {
        // Collapse only when everything is already open.
        const expanded: boolean = this.isFullyExpanded();
        const label: string = expanded ? "Collapse all" : "Expand all";

        // Swap the icon and the accessible name to match the action.
        setIcon(this.toggleAll, expanded ? "chevrons-down-up" : "chevrons-up-down");
        this.toggleAll.setAttribute("aria-label", label);
        this.toggleAll.title = label;
    }

    /** Render every visible area, program, and project. */
    private render(): void {
        // Read the focused toggle so keyboard focus can be restored.
        const focused: HTMLElement | null = this.list.contains(document.activeElement)
            ? (document.activeElement as HTMLElement)
            : null;
        const focusedKey: string | null = focused?.dataset.cgKey ?? null;

        // Clear the previous list.
        this.list.replaceChildren();

        // Count the visible areas and projects for the stats line.
        let visibleAreas: number = 0;
        let visibleProjects: number = 0;

        // Render the areas in the selected order.
        for (const area of orderedAreas(this.areas, this.sort)) {
            // Read the part of the area that survives the query.
            const view: AreaView = filterArea(area, this.query);

            // Skip an area with nothing visible.
            if (!view.visible) {
                // Continue with the next area.
                continue;
            }

            // Count the visible area.
            visibleAreas += 1;

            // Add the rendered area row.
            this.list.append(this.areaRow(area, view));

            // Count the visible projects; a search keeps every area and program open.
            visibleProjects += view.total;
        }

        // Report an empty result instead of a blank list.
        if (visibleAreas === 0) {
            // Add the empty message.
            this.list.createEl("div", {
                cls: "cg-empty",
                text: `No area, program, or project matches “${this.query}”.`,
            });
        }

        // Return focus to the same toggle after the rebuild.
        if (focusedKey !== null) {
            // Find the recreated control.
            const restored: HTMLElement | null = this.list.querySelector(
                `[data-cg-key="${CSS.escape(focusedKey)}"]`,
            );

            // Restore focus when the control still exists.
            restored?.focus();
        }

        // Report the filtered or complete totals.
        this.stats.textContent = this.query === ""
            ? `${this.areas.length} areas · ${this.totalProjects} projects · ${this.totalPrograms} program${this.totalPrograms === 1 ? "" : "s"}`
            : `${visibleProjects} of ${this.totalProjects} projects`;

        // Reflect the new fold state in the single control.
        this.updateToggleAll();
    }
}
