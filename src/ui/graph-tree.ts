/**
 * Interactive foldable graph tree used by the graph modal.
 *
 * The tree is the only production view; the JSON view renders the same graph
 * without rows. Areas and programs use native `details` folding, and rows use
 * plain DOM. Icons use Obsidian's `setIcon` so the tree follows the active
 * theme.
 */

import { Notice, setIcon } from "obsidian";

import { CONFIG } from "../constants";
import type { ContainerFileAction, ContainerFileActions } from "../containers/container-file-actions";
import type { ContainerIdentity, GraphArea, GraphProgram } from "../graph/types";
import type { GraphSort } from "../settings/settings";
import { TreeModel } from "./tree-model";
import type { AreaView } from "./tree-model";


/** Project row elements kept for in-place filtering. */
interface ProjectElements {
    /** Row wrapper toggled by the hidden attribute. */
    readonly row: HTMLElement;

    /** Identifier text that receives match highlighting. */
    readonly name: HTMLElement;

    /** Project identifier. */
    readonly id: string;
}


/** Program row elements kept for in-place filtering. */
interface ProgramElements {
    /** Native folding element. */
    readonly details: HTMLDetailsElement;

    /** Program identifier text that receives match highlighting. */
    readonly name: HTMLElement;

    /** Visible project count beside the program name. */
    readonly num: HTMLElement;

    /** Program identifier. */
    readonly id: string;

    /** Coordinated project rows. */
    readonly projects: readonly ProjectElements[];
}


/** Area row elements kept for in-place filtering. */
interface AreaElements {
    /** Graph area rendered by these elements. */
    readonly area: GraphArea;

    /** Native folding element. */
    readonly details: HTMLDetailsElement;

    /** Area identifier text that receives match highlighting. */
    readonly name: HTMLElement;

    /** Visible project count beside the area name. */
    readonly num: HTMLElement;

    /** Direct project rows. */
    readonly projects: readonly ProjectElements[];

    /** Program rows. */
    readonly programs: readonly ProgramElements[];
}


/**
 * Interactive tree of areas, programs, and projects.
 *
 * `TreeModel` owns the active query, the configured order, and totals. The
 * class owns the toolbar and list elements, the row markup, filtering, the copy
 * notice, and the single in-flight file action. Areas and programs fold
 * natively, so the tree builds its rows once in display order and only hides
 * them afterwards.
 */
export class GraphTree {
    /** File action seam, or null when the surface offers no file actions. */
    private readonly actions: ContainerFileActions | null;

    /** Query, order, and totals for this tree. */
    private readonly model: TreeModel;

    /** Search container with the icon, field, and shortcut hint. */
    private readonly search: HTMLElement;

    /** Query field that drives filtering. */
    private readonly input: HTMLInputElement;

    /** Control that expands or collapses every entry. */
    private readonly toggleAll: HTMLButtonElement;

    /** Totals line below the tools. */
    private readonly stats: HTMLElement;

    /** Scrolling list of rows. */
    private readonly list: HTMLElement;

    /** Empty-result message toggled by filtering. */
    private readonly empty: HTMLElement;

    /** Built area elements in display order. */
    private readonly areaElements: AreaElements[] = [];

    /** Open state captured when a query starts, or null outside a query. */
    private openSnapshot: Map<HTMLDetailsElement, boolean> | null = null;

    /** Whether one file action is already running. */
    private activating: boolean = false;

    /** Build the toolbar, stats line, list, and footer gutter. */
    private buildChrome(container: HTMLElement): void {
        // Build the search icon, field, and shortcut hint.
        const searchIcon: HTMLElement = this.search.createEl("span", { cls: "cg-search-icon" });
        setIcon(searchIcon, "search");
        this.input.type = "search";
        this.input.placeholder = CONFIG.SEARCH_PLACEHOLDER;
        this.input.setAttribute("aria-label", "Filter the graph");
        this.input.autocomplete = "off";
        this.input.spellcheck = false;
        this.search.append(searchIcon, this.input);
        this.search.createEl("kbd", { cls: "cg-kbd", text: "/" });

        // Build the single control that expands or collapses every entry.
        this.toggleAll.type = "button";
        this.toggleAll.className = "cg-btn cg-toggle";

        // Build the tools row.
        const tools: HTMLElement = container.createDiv({ cls: "cg-tools" });
        tools.append(this.search, this.toggleAll);

        // Mark the stats line as a live status region.
        this.stats.setAttribute("role", "status");

        // Build the footer gutter that keeps the list clear of the modal edge.
        const gutter: HTMLElement = container.createDiv({ cls: "cg-gutter" });

        // Assemble the toolbar, stats line, scrolling list, and gutter.
        container.append(tools, this.stats, this.list, gutter);
    }

    /** Bind the filter and expand controls. */
    private bindControls(): void {
        // Filter as soon as the query changes.
        this.input.addEventListener("input", (): void => {
            // Read the latest trimmed query and apply it immediately.
            this.model.setQuery(this.input.value.trim());
            this.applyFilter();
        });

        // Expand everything, or collapse everything when already open.
        this.toggleAll.addEventListener("click", (): void => {
            // Read the action that the current state offers.
            const expanded: boolean = this.allExpanded();

            // Collapse only the areas so the program state survives.
            if (expanded) {
                // Set every area state.
                for (const area of this.areaElements) {
                    // Fold the area.
                    area.details.open = false;
                }
            } else {
                // Open every area and program.
                for (const area of this.areaElements) {
                    // Open the area.
                    area.details.open = true;

                    // Open every program state under the area.
                    for (const program of area.programs) {
                        // Open the program.
                        program.details.open = true;
                    }
                }
            }

            // Reflect the new state in the control.
            this.updateToggleAll();
        });
    }

    /** Copy one identifier through the clipboard and report the result. */
    private copyIdentifier(identifier: string): void {
        // Read the asynchronous clipboard when the surface exposes one.
        const clipboard: Clipboard | undefined = navigator.clipboard;
        if (clipboard?.writeText === undefined) {
            // Report the unavailable clipboard.
            new Notice("Copy failed");
            return;
        }

        // Copy the identifier and report the settled result.
        void clipboard.writeText(identifier).then(
            (): void => {
                // Confirm the copy.
                new Notice(`Copied ${identifier}`);
            },
            (): void => {
                // Report the denied copy.
                new Notice("Copy failed");
            },
        );
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
        button.setAttribute("aria-label", label);
        button.title = label;

        // Add the sticky note or circle plus icon.
        setIcon(button, action === "open" ? "sticky-note" : "circle-plus");

        // Activate the file action without toggling the enclosing details row.
        button.addEventListener("click", (event: MouseEvent): void => {
            // Cancel the native summary activation and keep the click local.
            event.preventDefault();
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

    /** Build one project row at the supplied depth. */
    private projectRow(
        identifier: string,
        depth: number,
        area: string,
        program: string | null,
    ): ProjectElements {
        // Create the row wrapper.
        const row: HTMLElement = document.createElement("div");
        row.className = "cg-row";

        // Create the line that keeps the body, icon, and count on one row.
        const line: HTMLElement = this.createLine();

        // Create the copy button.
        const leaf: HTMLButtonElement = document.createElement("button");
        leaf.type = "button";
        leaf.className = program === null ? "cg-leaf" : "cg-leaf cg-leaf--program";
        leaf.style.setProperty("--cg-indent", String(depth));
        leaf.title = `Copy ${identifier}`;

        // Add the depth glyph.
        leaf.createEl("span", { cls: "cg-glyph", text: program === null ? "·" : "└" });

        // Add the identifier.
        const name: HTMLElement = this.nameElement(identifier);
        leaf.append(name);

        // Copy the identifier on activation.
        leaf.addEventListener("click", (): void => {
            // Copy the selected identifier.
            this.copyIdentifier(identifier);
        });

        // Add the body button to the line.
        line.append(leaf);

        // Add the file icon immediately after the title.
        this.appendFileAction(line, { kind: "project", id: identifier, area, program });

        // Assemble the completed row.
        row.append(line);
        return { row, name, id: identifier };
    }

    /** Build one area with its direct projects and programs. */
    private buildArea(area: GraphArea): AreaElements {
        // Create the native folding element.
        const details: HTMLDetailsElement = document.createElement("details");
        details.className = "cg-row";
        details.open = true;
        details.dataset.cgKey = `area:${area.id}`;

        // Refresh the expand control after a native fold.
        details.addEventListener("toggle", (): void => this.updateToggleAll());

        // Create the area header line and name it after the identifier.
        const line: HTMLElement = this.createLine("summary");
        line.setAttribute("aria-label", area.id);

        // Create the area body with its chevron and identifier.
        const node: HTMLElement = document.createElement("span");
        node.className = "cg-node";
        node.style.setProperty("--cg-indent", "0");
        node.append(this.chevron());
        const name: HTMLElement = this.nameElement(area.id);
        node.append(name);
        line.append(node);

        // Add the file icon before the meter and count.
        this.appendFileAction(line, { kind: "area", id: area.id, area: area.id, program: null });

        // Add the size meter.
        const meter: HTMLElement = line.createEl("span", { cls: "cg-meter" });
        const fill: HTMLElement = meter.createEl("i");
        const maxTotal: number = this.model.getMaxTotal();
        fill.style.width = `${maxTotal === 0 ? 0 : Math.round(this.model.countArea(area) / maxTotal * 100)}%`;

        // Add the visible project count.
        const num: HTMLElement = line.createEl("span", { cls: "cg-num", text: String(this.model.countArea(area)) });

        // Add the area header line.
        details.append(line);

        // Build each direct project row.
        const projects: ProjectElements[] = [];
        for (const project of area.projects) {
            // Build and attach the direct project row.
            const projectElements: ProjectElements = this.projectRow(project, 1, area.id, null);
            projects.push(projectElements);
            details.append(projectElements.row);
        }

        // Build each program row and its coordinated projects.
        const programs: ProgramElements[] = [];
        for (const program of area.programs) {
            // Build and attach the program group.
            const programElements: ProgramElements = this.buildProgram(area, program);
            programs.push(programElements);
            details.append(programElements.details);
        }

        // Return the complete area boundary.
        const elements: AreaElements = {
            area,
            details,
            name,
            num,
            projects,
            programs,
        };
        return elements;
    }

    /** Build one native program group with its coordinated project rows. */
    private buildProgram(area: GraphArea, program: GraphProgram): ProgramElements {
        // Create the native folding element.
        const details: HTMLDetailsElement = document.createElement("details");
        details.className = "cg-program";
        details.open = true;
        details.dataset.cgKey = `program:${area.id}/${program.id}`;

        // Refresh the expand control after a native fold.
        details.addEventListener("toggle", (): void => this.updateToggleAll());

        // Create the program header line and name it after the identifier.
        const line: HTMLElement = this.createLine("summary");
        line.setAttribute("aria-label", program.id);

        // Create the program body with its chevron and identifier.
        const node: HTMLElement = document.createElement("span");
        node.className = "cg-node cg-node--program";
        node.style.setProperty("--cg-indent", "1");
        node.append(this.chevron());
        const name: HTMLElement = this.nameElement(program.id);
        node.append(name);
        line.append(node);

        // Add the file icon before the count.
        this.appendFileAction(line, { kind: "program", id: program.id, area: area.id, program: null });

        // Add the program project count.
        const num: HTMLElement = line.createEl("span", { cls: "cg-num", text: String(program.projects.length) });

        // Add the program header line.
        details.append(line);

        // Build each coordinated project row.
        const projects: ProjectElements[] = [];
        for (const project of program.projects) {
            // Build and attach the program project row.
            const projectElements: ProjectElements = this.projectRow(project, 2, area.id, program.id);
            projects.push(projectElements);
            details.append(projectElements.row);
        }

        // Return the complete program boundary.
        return {
            details,
            name,
            num,
            id: program.id,
            projects,
        };
    }

    /** Build every area and program once and append the empty message. */
    private buildAreas(): void {
        // Build the areas in the configured display order.
        for (const area of this.model.orderedAreas()) {
            // Build and retain the area boundary.
            const elements: AreaElements = this.buildArea(area);
            this.areaElements.push(elements);
            this.list.append(elements.details);
        }

        // Keep the empty message after every area.
        this.list.append(this.empty);
    }

    /** Return every area and program details element. */
    private details(): HTMLDetailsElement[] {
        // Flatten every area with its programs.
        return this.areaElements.flatMap((area) => [
            area.details,
            ...area.programs.map((program) => program.details),
        ]);
    }

    /** Report whether every area and program is expanded. */
    private allExpanded(): boolean {
        // Report whether every details element is open.
        return this.details().every((details) => details.open);
    }

    /** Capture the open state before a query forces rows open. */
    private snapshotOpenStates(): void {
        // Record every area and program state by its own element.
        this.openSnapshot = new Map(this.details().map((details) => [details, details.open]));
    }

    /** Restore the open state captured before the query started. */
    private restoreOpenStates(): void {
        // Read the captured state.
        const snapshot: Map<HTMLDetailsElement, boolean> | null = this.openSnapshot;
        if (snapshot === null) {
            // Leave the current state when no query captured one.
            return;
        }

        // Restore every captured area and program state.
        for (const [details, open] of snapshot) {
            details.open = open;
        }
    }

    /** Hide rows outside the query and refresh highlights, counts, and stats. */
    private applyFilter(): void {
        // Read the active query.
        const query: string = this.model.getQuery();

        // Capture the native fold state when a query starts.
        if (query !== "") {
            // Capture once so later keystrokes keep the original state.
            if (this.openSnapshot === null) {
                // Capture every area and program state.
                this.snapshotOpenStates();
            }
        } else if (this.openSnapshot !== null) {
            // Restore the state captured before the query.
            this.restoreOpenStates();
            this.openSnapshot = null;
        }

        // Count the visible areas and projects for the stats line.
        let visibleAreas: number = 0;
        let visibleProjects: number = 0;

        // Update every built area in place.
        for (const area of this.areaElements) {
            // Read the part of the area that survives the query.
            const view: AreaView = this.model.filterArea(area.area);

            // Hide the area when nothing inside it matches.
            area.details.hidden = !view.visible;

            // Update the area highlight, visible count, and query fold state.
            this.writeMarkedText(area.name, area.area.id, query);
            area.num.textContent = String(view.total);
            if (query !== "" && view.visible) {
                // Open every visible area while filtering.
                area.details.open = true;
            }

            // Count the visible area and its projects.
            if (view.visible) {
                visibleAreas += 1;
                visibleProjects += view.total;
            }

            // Index the visible direct projects.
            const direct: Set<string> = new Set<string>(view.projects);

            // Hide each direct project outside the query.
            for (const project of area.projects) {
                // Toggle the row without rebuilding it.
                project.row.hidden = !direct.has(project.id);

                // Refresh the project highlight.
                this.writeMarkedText(project.name, project.id, query);
            }

            // Index the visible programs and their projects.
            const programs: Map<string, readonly string[]> = new Map<string, readonly string[]>();
            for (const program of view.programs) {
                // Retain the visible project identifiers.
                programs.set(program.id, program.projects);
            }

            // Update every built program in place.
            for (const program of area.programs) {
                // Read the visible projects for this program.
                const kept: readonly string[] | undefined = programs.get(program.id);

                // Hide the program when nothing inside it matches.
                program.details.hidden = kept === undefined;

                // Update the program highlight and visible count.
                this.writeMarkedText(program.name, program.id, query);
                program.num.textContent = String(kept?.length ?? 0);
                if (query !== "" && kept !== undefined) {
                    // Open every visible program while filtering.
                    program.details.open = true;
                }

                // Index the visible coordinated projects.
                const visible: Set<string> = new Set<string>(kept ?? []);

                // Hide each coordinated project outside the query.
                for (const project of program.projects) {
                    // Toggle the row without rebuilding it.
                    project.row.hidden = !visible.has(project.id);

                    // Refresh the project highlight.
                    this.writeMarkedText(project.name, project.id, query);
                }
            }
        }

        // Report an empty result instead of a blank list.
        this.empty.textContent = `No area, program, or project matches “${query}”.`;
        this.empty.hidden = visibleAreas > 0;

        // Report the filtered or complete totals.
        const totalProjects: number = this.model.getTotalProjects();
        const totalPrograms: number = this.model.getTotalPrograms();
        this.stats.textContent = query === ""
            ? `${this.model.getAreaCount()} areas · ${totalProjects} projects · ${totalPrograms} program${totalPrograms === 1 ? "" : "s"}`
            : `${visibleProjects} of ${totalProjects} projects`;

        // Reflect the current fold state in the single control.
        this.updateToggleAll();
    }

    /** Return one detached row line. */
    private createLine(tag: "div" | "summary" = "div"): HTMLElement {
        // Create the line that keeps the body, icon, and count on one row.
        const line: HTMLElement = document.createElement(tag);
        line.className = "cg-line";
        return line;
    }

    /** Return one native fold chevron. */
    private chevron(): HTMLElement {
        // Create the icon container used by the fold rows.
        const icon: HTMLElement = document.createElement("span");
        icon.className = "cg-chev";
        setIcon(icon, "chevron-down");
        return icon;
    }

    /** Return one plain name element for the initial tree build. */
    private nameElement(text: string): HTMLElement {
        // Create the text container with the shared name classes.
        const span: HTMLElement = document.createElement("span");
        span.className = "cg-nm cg-mono";
        span.textContent = text;
        return span;
    }

    /** Replace one existing name element with text marked for the query. */
    private writeMarkedText(span: HTMLElement, text: string, query: string): void {
        // Clear the previous text and highlights.
        span.replaceChildren();

        // Add the plain text when no query is active.
        if (query === "") {
            // Set the whole identifier as text.
            span.textContent = text;
            return;
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
    }

    /** Show the action that the expand control performs from the current state. */
    private updateToggleAll(): void {
        // Collapse only when everything is already open.
        const expanded: boolean = this.allExpanded();
        const label: string = expanded ? "Collapse all" : "Expand all";

        // Swap the icon and the accessible name to match the action.
        setIcon(this.toggleAll, expanded ? "chevrons-down-up" : "chevrons-up-down");
        this.toggleAll.setAttribute("aria-label", label);
        this.toggleAll.title = label;
    }

    /** Construct and mount one tree inside the supplied container. */
    public constructor(
        container: HTMLElement,
        areas: readonly GraphArea[],
        sort: GraphSort,
        actions: ContainerFileActions | null,
    ) {
        // Store the file action seam and the ordered tree model.
        this.actions = actions;
        this.model = new TreeModel(areas, sort);

        // Clear any previous content.
        container.replaceChildren();

        // Build the search field, stats line, and list.
        this.search = container.createDiv({ cls: "cg-search" });
        this.input = document.createElement("input");
        this.toggleAll = document.createElement("button");
        this.stats = container.createEl("p", { cls: "cg-stats" });
        this.list = container.createDiv({ cls: "cg-list" });
        this.empty = document.createElement("div");
        this.empty.className = "cg-empty";
        this.empty.hidden = true;

        // Assemble the chrome and build every row once.
        this.buildChrome(container);
        this.buildAreas();

        // Wire the controls after the rows exist.
        this.bindControls();

        // Apply the initial visibility, highlights, and totals.
        this.applyFilter();
    }

    /** Focus the search field, used by the modal keymap. */
    public focusSearch(): void {
        // Move focus to the search field.
        this.input.focus();
    }

    /** Report whether the search field currently has focus. */
    public hasSearchFocus(): boolean {
        // Compare the focused element with the field.
        return document.activeElement === this.input;
    }

    /** Clear the query and leave the search field. */
    public clearSearch(): void {
        // Reset the query.
        this.input.value = "";
        this.model.setQuery("");

        // Leave the search field and refresh the full tree immediately.
        this.input.blur();
        this.applyFilter();
    }
}
