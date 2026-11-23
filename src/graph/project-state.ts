/**
 * Closed vocabulary for project and program states.
 */

/** Project lifecycle states recognized by the commitment domain. */
export type ProjectState = "triage" | "planned" | "active" | "paused" | "done" | "dropped";


/** Every recognized project state in display order. */
export const PROJECT_STATES: readonly ProjectState[] = [
    "triage",
    "planned",
    "active",
    "paused",
    "done",
    "dropped",
];


/** Membership index for the closed vocabulary. */
const PROJECT_STATE_SET: ReadonlySet<string> = new Set(PROJECT_STATES);


/** Return whether a value is one exact recognized project state. */
export function isProjectState(value: unknown): value is ProjectState {
    // Require exact string text and reject case changes or whitespace.
    return typeof value === "string" && PROJECT_STATE_SET.has(value);
}
