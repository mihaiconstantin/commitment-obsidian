/**
 * One recognized-state selection for a tree row level.
 *
 * The class owns the opening and current sets, so the tree model does not
 * repeat the default comparison and filtering checks for each state menu.
 */

import { PROJECT_STATES, type ProjectState } from "../graph/project-state";


/** Selected recognized states for one tree row level. */
export class StateSelection {
    /** States selected when the selection was created. */
    private readonly initial: ReadonlySet<ProjectState>;

    /** States selected now. */
    private selected: ReadonlySet<ProjectState>;

    /** Report whether two state selections contain the same states. */
    private statesEqual(left: ReadonlySet<ProjectState>, right: ReadonlySet<ProjectState>): boolean {
        // Require equal sizes before checking membership.
        if (left.size !== right.size) {
            // Report a different selection.
            return false;
        }

        // Require every left state to exist on the right.
        return Array.from(left).every((state: ProjectState): boolean => right.has(state));
    }

    /** Copy the opening selection. */
    public constructor(initial: Iterable<ProjectState>) {
        // Copy the opening and current sets so callers cannot mutate them.
        this.initial = new Set<ProjectState>(initial);
        this.selected = new Set<ProjectState>(initial);
    }

    /** Report whether one state is selected. */
    public has(state: ProjectState): boolean {
        // Report the current membership.
        return this.selected.has(state);
    }

    /** Replace the current selection. */
    public set(states: Iterable<ProjectState>): void {
        // Copy the caller's set so later mutations do not change the view.
        this.selected = new Set<ProjectState>(states);
    }

    /** Return the current selection without exposing a mutable set. */
    public get(): ReadonlySet<ProjectState> {
        // Report the current selection.
        return this.selected;
    }

    /** Report whether the selection applies a constraint. */
    public isFiltering(): boolean {
        // Report a constraint when any recognized state is unselected.
        return PROJECT_STATES.some(
            (state: ProjectState): boolean => !this.selected.has(state),
        );
    }

    /** Report whether the current selection matches the opening selection. */
    public isAtDefault(): boolean {
        // Compare the current and opening selections.
        return this.statesEqual(this.selected, this.initial);
    }
}
