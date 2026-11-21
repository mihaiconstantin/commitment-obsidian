/**
 * Area ordering and project counting shared by the graph presentations.
 */

import type { GraphArea } from "../graph/types";
import { compareText } from "../helpers/strings";
import type { GraphSort } from "../settings/settings";


/** Return one area's direct and coordinated project count. */
export function countAreaProjects(area: GraphArea): number {
    // Count the direct projects.
    let total: number = area.projects.length;

    // Add each program's coordinated projects.
    for (const program of area.programs) {
        // Add the coordinated count.
        total += program.projects.length;
    }

    // Return the area total.
    return total;
}


/** Return a copy of the areas in the requested display order. */
export function orderAreas(areas: readonly GraphArea[], sort: GraphSort): readonly GraphArea[] {
    // Copy the areas before sorting.
    const ordered: GraphArea[] = [...areas];

    // Compare identifiers when the name order is selected.
    if (sort === "name") {
        // Sort by identifier.
        ordered.sort((left: GraphArea, right: GraphArea): number => compareText(left.id, right.id));
        return ordered;
    }

    // Sort by descending project count, then by identifier for a stable order.
    ordered.sort((left: GraphArea, right: GraphArea): number =>
        countAreaProjects(right) - countAreaProjects(left) || compareText(left.id, right.id));

    // Return the ordered areas.
    return ordered;
}
