/**
 * Generic collection helpers shared across the plugin.
 */

import { compareText } from "./strings";


/** Return a sorted list of unique strings by code-unit order. */
export function uniqueSorted(values: Iterable<string>): readonly string[] {
    // Deduplicate the values with a set.
    const unique: Set<string> = new Set<string>(values);

    // Return the values in code-unit order.
    return [...unique].sort(
        (left: string, right: string): number => compareText(left, right),
    );
}


/** Append one entry under its grouping key. */
export function appendGrouped<T>(groups: Map<string, T[]>, key: string, entry: T): void {
    // Read the existing entries for the grouping key.
    const entries: T[] | undefined = groups.get(key);

    // Start a new group when the key has no entries yet.
    if (entries === undefined) {
        // Record the first entry under the key.
        groups.set(key, [entry]);
        return;
    }

    // Append to the existing group.
    entries.push(entry);
}
