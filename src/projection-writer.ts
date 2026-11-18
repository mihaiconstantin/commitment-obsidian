/**
 * Serialize the direct commitment projection to the same JSON text used by the
 * Python exporter: four-space indentation, literal Unicode, and one newline.
 */

import type { GraphArea, GraphProgram } from "./graph-types";


/** Return one indentation level of four spaces per unit. */
function indent(level: number): string {
    // Repeat the standard four-space JSON indentation.
    return "    ".repeat(level);
}


/**
 * Render sorted area, program, and project keys exactly as Python's
 * `json.dumps(..., ensure_ascii = False, indent = 4) + "\n"` does for the fixed
 * graph shape. Callers supply sorted values so JavaScript enumeration cannot
 * reorder numeric-like keys.
 */
export function serializeProjection(areas: readonly GraphArea[]): string {
    // Render the empty graph as a compact object with one final newline.
    if (areas.length === 0) {
        // Return the exact empty projection.
        return "{}\n";
    }

    // Render each area key and object at the first indentation level.
    const renderedAreas: readonly string[] = areas.map(
        (area: GraphArea): string => `${indent(1)}${JSON.stringify(area.id)}: ${renderArea(area)}`,
    );

    // Assemble the top-level object with one final newline.
    return `{\n${renderedAreas.join(",\n")}\n}\n`;
}


/** Render one area object whose closing brace is at the first level. */
function renderArea(area: GraphArea): string {
    // Render the project array closing at the area field level.
    const projects: string = renderStringArray(area.projects, 2);

    // Render the program map closing at the area field level.
    const programs: string = renderPrograms(area.programs, 2);

    // Render the fixed `projects` then `programs` field order.
    return `{\n${indent(2)}"projects": ${projects},\n${indent(2)}"programs": ${programs}\n${indent(1)}}`;
}


/** Render one program map ordered by identifier, closing at the given level. */
function renderPrograms(
    programs: readonly GraphProgram[],
    closingLevel: number,
): string {
    // Render an empty program map compactly.
    if (programs.length === 0) {
        // Return the exact empty mapping.
        return "{}";
    }

    // Render each program entry at one level past the mapping's close.
    const entries: readonly string[] = programs.map((program: GraphProgram): string => {
        // Render the coordinated project array closing at the program-field level.
        const projects: string = renderStringArray(program.projects, closingLevel + 2);

        // Render the program object closing at the entry level.
        return `${indent(closingLevel + 1)}${JSON.stringify(program.id)}: {\n${indent(closingLevel + 2)}"projects": ${projects}\n${indent(closingLevel + 1)}}`;
    });

    // Assemble the program mapping.
    return `{\n${entries.join(",\n")}\n${indent(closingLevel)}}`;
}


/** Render a string array whose closing bracket is at the given level. */
function renderStringArray(values: readonly string[], closingLevel: number): string {
    // Render an empty array compactly.
    if (values.length === 0) {
        // Return the exact empty array text.
        return "[]";
    }

    // Render each value one level past the array's close.
    const items: readonly string[] = values.map(
        (value: string): string => `${indent(closingLevel + 1)}${JSON.stringify(value)}`,
    );

    // Assemble the array with its closing bracket at the supplied level.
    return `[\n${items.join(",\n")}\n${indent(closingLevel)}]`;
}
