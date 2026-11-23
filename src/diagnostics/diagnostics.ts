/**
 * Nonblocking graph checks and their Doctor messages.
 */

import type { AreaEntry, NormalizedInputs, ProjectEntry, ResolvedProgram, SupportAssociation } from "../graph/model";
import { appendGrouped, uniqueSorted } from "../helpers/collections";
import { compareText, countLabel } from "../helpers/strings";


/** One nonblocking finding ready for the Doctor to display. */
export interface Diagnostic {
    /** Heading of the finding group. */
    readonly group: string;

    /** Message naming the affected identifiers. */
    readonly message: string;

    /** Root-relative vault paths related to the finding. */
    readonly paths: readonly string[];
}


/** Collect findings without retaining data between builds. */
export class Diagnostics {
    /** Report support containers that cannot resolve their anchor. */
    private unresolvedAnchors(normalized: NormalizedInputs): readonly Diagnostic[] {
        // Start the findings in support path order.
        const findings: Diagnostic[] = [];

        // Visit every support container.
        for (const support of normalized.supports) {
            // Read the association, if any.
            const association: SupportAssociation | null = support.association;

            // Report a support container without usable dependent fields.
            if (association === null) {
                findings.push({
                    group: "Unresolved anchors",
                    message: "Support container has no valid `level` or `anchor`. Omitted from graph.",
                    paths: [support.path],
                });
                continue;
            }

            // Accept every area anchor because the area is established by the support.
            if (association.level === "area") {
                continue;
            }

            // Check explicit and project-derived targets in the existing maps.
            const known: boolean = association.level === "program"
                ? normalized.programs.has(association.identifier) || normalized.programProjects.has(association.identifier)
                : normalized.projects.has(association.identifier);

            // Report the unknown target without inventing a graph node.
            if (!known) {
                findings.push({
                    group: "Unresolved anchors",
                    message: `Support container anchors to unknown ${association.level} \`${association.identifier}\`. Omitted from graph.`,
                    paths: [support.path],
                });
            }
        }

        // Return the unresolved-target findings.
        return findings;
    }

    /** Report present state values outside the recognized vocabulary. */
    private invalidStates(normalized: NormalizedInputs): readonly Diagnostic[] {
        // Key findings by source path so repeated inputs report once.
        const findings: Map<string, Diagnostic> = new Map<string, Diagnostic>();

        // Check every program container.
        for (const entries of normalized.programs.values()) {
            for (const program of entries) {
                // Report only a present state that failed validation.
                if (program.statePresent && program.state === null) {
                    findings.set(program.path, {
                        group: "Invalid states",
                        message: `Program \`${program.id}\` in area \`${program.area}\` has invalid \`state\`. Expected one recognized state.`,
                        paths: [program.path],
                    });
                }
            }
        }

        // Check every project container.
        for (const entries of normalized.projects.values()) {
            for (const project of entries) {
                // Report only a present state that failed validation.
                if (project.statePresent && project.state === null) {
                    findings.set(project.path, {
                        group: "Invalid states",
                        message: `Project \`${project.id}\` in area \`${project.area}\` has invalid \`state\`. Expected one recognized state.`,
                        paths: [project.path],
                    });
                }
            }
        }

        // Check every task container.
        for (const support of normalized.supports) {
            // Report only a task with a present invalid state.
            if (support.kind === "task" && support.statePresent && support.state === null) {
                findings.set(support.path, {
                    group: "Invalid states",
                    message: "Task container has invalid `state`. Expected one recognized state.",
                    paths: [support.path],
                });
            }
        }

        // Return the findings in source path order.
        return [...findings.values()].sort(
            (left: Diagnostic, right: Diagnostic): number =>
                compareText(left.paths[0] ?? "", right.paths[0] ?? ""),
        );
    }

    /** Report present area active values that are not booleans. */
    private invalidAreaActivity(normalized: NormalizedInputs): readonly Diagnostic[] {
        // Key findings by source path so repeated inputs report once.
        const findings: Map<string, Diagnostic> = new Map<string, Diagnostic>();

        // Visit every explicit area.
        for (const entries of normalized.areas.values()) {
            for (const area of entries) {
                // Report only a present active value that failed validation.
                if (area.activePresent && area.active === null) {
                    findings.set(area.path, {
                        group: "Invalid area activity",
                        message: `Area \`${area.id}\` has invalid \`active\`. Expected \`true\` or \`false\`.`,
                        paths: [area.path],
                    });
                }
            }
        }

        // Return the findings in source path order.
        return [...findings.values()].sort(
            (left: Diagnostic, right: Diagnostic): number =>
                compareText(left.paths[0] ?? "", right.paths[0] ?? ""),
        );
    }

    /** Report inactive areas that still contain active projects. */
    private inactiveAreasWithActiveProjects(normalized: NormalizedInputs): readonly Diagnostic[] {
        // Index every active project by its declaring area.
        const activeByArea: Map<string, ProjectEntry[]> = new Map<string, ProjectEntry[]>();

        // Visit every project container.
        for (const entries of normalized.projects.values()) {
            for (const project of entries) {
                // Keep projects with the exact active state.
                if (project.state === "active") {
                    appendGrouped(activeByArea, project.area, project);
                }
            }
        }

        // Start the cross-field findings.
        const findings: Diagnostic[] = [];

        // Visit every explicit area in code-unit identifier order.
        for (const area of [...normalized.areas.keys()].sort(compareText)) {
            // Read the first explicit area container for this identifier.
            const container: AreaEntry | undefined = normalized.areas.get(area)?.[0];
            const activeProjects: readonly ProjectEntry[] = activeByArea.get(area) ?? [];

            // Skip every area that is not explicitly inactive or has no active project.
            if (container?.active !== false || activeProjects.length === 0) {
                continue;
            }

            // Build the finding with every affected identifier and source path.
            const identifiers: readonly string[] = uniqueSorted(activeProjects.map((project: ProjectEntry): string => project.id));
            const rendered: string = identifiers.map((identifier: string): string => `\`${identifier}\``).join(", ");
            findings.push({
                group: "Inactive areas with active projects",
                message: `Inactive area \`${area}\` contains ${countLabel(identifiers.length, "active project")} ${rendered}.`,
                paths: uniqueSorted([
                    container.path,
                    ...activeProjects.map((project: ProjectEntry): string => project.path),
                ]),
            });
        }

        // Return the cross-field findings.
        return findings;
    }

    /** Report inactive areas that still contain active programs. */
    private inactiveAreasWithActivePrograms(normalized: NormalizedInputs, programs: readonly ResolvedProgram[]): readonly Diagnostic[] {
        // Start the cross-field findings.
        const findings: Diagnostic[] = [];

        // Visit every explicit area in code-unit identifier order.
        for (const area of [...normalized.areas.keys()].sort(compareText)) {
            // Read the first explicit area container for this identifier.
            const container: AreaEntry | undefined = normalized.areas.get(area)?.[0];

            // Skip every area that is not explicitly inactive.
            if (container?.active !== false) {
                continue;
            }

            // Collect the active programs under this area in identifier order.
            const activePrograms: readonly ResolvedProgram[] = programs.filter(
                (program: ResolvedProgram): boolean => program.area === area && program.state === "active",
            );

            // Skip an inactive area with no active program.
            if (activePrograms.length === 0) {
                continue;
            }

            // Build the finding with the area and program container paths.
            const rendered: string = activePrograms.map((program: ResolvedProgram): string => `\`${program.id}\``).join(", ");
            findings.push({
                group: "Inactive areas with active programs",
                message: `Inactive area \`${area}\` contains ${countLabel(activePrograms.length, "active program")} ${rendered}.`,
                paths: uniqueSorted([
                    container.path,
                    ...activePrograms
                        .map((program: ResolvedProgram): string | null => program.containerPath)
                        .filter((path: string | null): path is string => path !== null),
                ]),
            });
        }

        // Return the cross-field findings.
        return findings;
    }

    /** Report inactive areas that still contain active tasks. */
    private inactiveAreasWithActiveTasks(normalized: NormalizedInputs): readonly Diagnostic[] {
        // Group active task paths by their resolved area.
        const taskPathsByArea: Map<string, Set<string>> = new Map<string, Set<string>>();

        // Visit every support container.
        for (const support of normalized.supports) {
            // Keep only active tasks with a valid association.
            if (support.kind !== "task" || support.state !== "active" || support.association === null) {
                continue;
            }

            // Start with no resolved area.
            let area: string | undefined;

            // Resolve the area from the association level.
            if (support.association.level === "area") {
                // Use the directly named area.
                area = support.association.identifier;
            } else if (support.association.level === "program") {
                // Use the explicit program area or its single validated project area.
                area = normalized.programs.get(support.association.identifier)?.[0]?.area
                    ?? normalized.programProjects.get(support.association.identifier)?.keys().next().value;
            } else {
                // Use the area of the named project.
                area = normalized.projects.get(support.association.identifier)?.[0]?.area;
            }

            // Skip a task whose target area is unknown or not explicitly inactive.
            if (area === undefined || normalized.areas.get(area)?.[0]?.active !== false) {
                continue;
            }

            // Read the task path set for this area.
            let paths: Set<string> | undefined = taskPathsByArea.get(area);

            // If the area has no task path set, create it.
            if (paths === undefined) {
                paths = new Set<string>();
                taskPathsByArea.set(area, paths);
            }

            // Record one task per source path.
            paths.add(support.path);
        }

        // Start the findings.
        const findings: Diagnostic[] = [];

        // Render one finding per inactive area with active tasks.
        for (const area of [...taskPathsByArea.keys()].sort(compareText)) {
            // Read the area container and its distinct task paths.
            const container: AreaEntry | undefined = normalized.areas.get(area)?.[0];
            const paths: ReadonlySet<string> | undefined = taskPathsByArea.get(area);

            // Skip an area without its container or task paths.
            if (container === undefined || paths === undefined) {
                continue;
            }

            // Build the finding with the area and task paths.
            findings.push({
                group: "Inactive areas with active tasks",
                message: `Inactive area \`${area}\` contains ${countLabel(paths.size, "active task")}.`,
                paths: uniqueSorted([container.path, ...paths]),
            });
        }

        // Return the cross-field findings.
        return findings;
    }

    /** Report programs that coordinate fewer than two projects. */
    private underfilledPrograms(programs: readonly ResolvedProgram[]): readonly Diagnostic[] {
        // Start the findings.
        const findings: Diagnostic[] = [];

        // Check every resolved program in identifier order.
        for (const program of programs) {
            // Accept a program that coordinates two or more projects.
            if (program.area === "" || program.projects.length >= 2) {
                continue;
            }

            // Build the underfilled warning with every defining source path.
            findings.push({
                group: "Underfilled programs",
                message: `Program \`${program.id}\` in area \`${program.area}\` has ${countLabel(program.projects.length, "project")}. 2 or more expected.`,
                paths: program.paths,
            });
        }

        // Return the underfilled findings.
        return findings;
    }

    /** Report finished programs that still coordinate active projects. */
    private finishedProgramsWithActiveProjects(normalized: NormalizedInputs, programs: readonly ResolvedProgram[]): readonly Diagnostic[] {
        // Start the findings.
        const findings: Diagnostic[] = [];

        // Check every resolved program in identifier order.
        for (const program of programs) {
            // Skip every program that is not done or dropped.
            if (program.state !== "done" && program.state !== "dropped") {
                continue;
            }

            // Collect the active projects coordinated by this program.
            const activeProjects: readonly ProjectEntry[] = program.projects
                .map((identifier: string): ProjectEntry | undefined => normalized.projects.get(identifier)?.[0])
                .filter(
                    (project: ProjectEntry | undefined): project is ProjectEntry =>
                        project !== undefined && project.state === "active",
                );

            // Skip a finished program with no active project.
            if (activeProjects.length === 0) {
                continue;
            }

            // Build the finding with the program and active project paths.
            const identifiers: readonly string[] = uniqueSorted(activeProjects.map((project: ProjectEntry): string => project.id));
            const rendered: string = identifiers.map((identifier: string): string => `\`${identifier}\``).join(", ");
            findings.push({
                group: "Finished programs with active projects",
                message: `Program \`${program.id}\` is ${program.state} but coordinates ${countLabel(identifiers.length, "active project")} ${rendered}.`,
                paths: uniqueSorted([
                    ...(program.containerPath === null ? [] : [program.containerPath]),
                    ...activeProjects.map((project: ProjectEntry): string => project.path),
                ]),
            });
        }

        // Return the cross-field findings.
        return findings;
    }

    /** Return every finding in Doctor output order after graph resolution. */
    public collect(normalized: NormalizedInputs, programs: readonly ResolvedProgram[]): readonly Diagnostic[] {
        // Run every check in its declared output order.
        return [
            ...this.unresolvedAnchors(normalized),
            ...this.invalidStates(normalized),
            ...this.invalidAreaActivity(normalized),
            ...this.inactiveAreasWithActiveProjects(normalized),
            ...this.inactiveAreasWithActivePrograms(normalized, programs),
            ...this.inactiveAreasWithActiveTasks(normalized),
            ...this.underfilledPrograms(programs),
            ...this.finishedProgramsWithActiveProjects(normalized, programs),
        ];
    }
}
