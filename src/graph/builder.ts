/**
 * Derive and validate the canonical commitment graph from saved frontmatter.
 *
 * Construction normalizes every sorted input in one scan, rejects duplicate
 * containers, validates programs from the collected references, and projects
 * the area snapshots. Supports that anchor to a program or project stay pending
 * until the caller has a membership-checked snapshot.
 */

import type { CanonicalField } from "../frontmatter/canonical-field";
import { appendGrouped, uniqueSorted } from "../helpers/collections";
import { compareText } from "../helpers/strings";
import { CommitmentGraph, type GraphResult } from "./commitment-graph";
import { createDiagnostic } from "./diagnostics";
import type {
    CanonicalInput,
    CommitmentKind,
    CommitmentLevel,
    Diagnostic,
    GraphArea,
    GraphProgram,
    PendingSupport,
} from "./types";


/** Canonical kinds recognized by graph construction. */
const CANONICAL_KINDS: Readonly<Record<string, true>> = {
    area: true,
    program: true,
    project: true,
    meeting: true,
    note: true,
    task: true,
    board: true,
};


/** Recognized support levels. */
const SUPPORT_LEVELS: Readonly<Record<string, true>> = {
    area: true,
    program: true,
    project: true,
};


/** One grouped area container. */
interface AreaEntry {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated area identifier. */
    readonly id: string;
}


/** One grouped program container. */
interface ProgramEntry {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated program identifier. */
    readonly id: string;

    /** Required program area. */
    readonly area: string;
}


/** One grouped project container. */
interface ProjectEntry {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated project identifier. */
    readonly id: string;

    /** Required project area. */
    readonly area: string;

    /** Optional project program. */
    readonly program: string | null;
}


/** One recognized support association derived from canonical fields. */
interface SupportAssociation {
    /** Concept level of the anchored identifier. */
    readonly level: CommitmentLevel;

    /** Exact anchored identifier text. */
    readonly identifier: string;
}


/** One duplicated container identifier and every distinct source path. */
interface DuplicateContainers {
    /** Duplicated concept level. */
    readonly level: CommitmentLevel;

    /** Duplicated identifier text. */
    readonly identifier: string;

    /** Distinct source paths in code-unit order. */
    readonly paths: readonly string[];
}


/** Local data produced by one normalization scan. */
interface NormalizedInputs {
    /** Area containers grouped by identifier. */
    readonly areas: Map<string, AreaEntry[]>;

    /** Program containers grouped by identifier. */
    readonly programs: Map<string, ProgramEntry[]>;

    /** Project containers grouped by identifier. */
    readonly projects: Map<string, ProjectEntry[]>;

    /** Project references grouped by program and declaring area. */
    readonly programProjects: Map<string, Map<string, ProjectEntry[]>>;

    /** Every established area identifier. */
    readonly areaIds: Set<string>;

    /** Support anchors that need the finished membership sets. */
    readonly pendingSupports: PendingSupport[];

    /** Classification findings in input path order. */
    readonly findings: Diagnostic[];

    /** First duplicate representation, or null when every container is unique. */
    readonly duplicate: DuplicateContainers | null;
}


/** One validated program with its area and coordinated projects. */
interface ResolvedProgram {
    /** Validated program identifier. */
    readonly id: string;

    /** Validated program area. */
    readonly area: string;

    /** Coordinated project identifiers in declaration order. */
    readonly projects: readonly string[];
}


/** Validated programs and their nonblocking findings. */
interface ProgramResolution {
    /** Programs in identifier order. */
    readonly programs: readonly ResolvedProgram[];

    /** Underfilled-program findings in identifier order. */
    readonly findings: readonly Diagnostic[];
}


/** Own one graph construction pass over saved canonical inputs. */
export class GraphBuilder {
    /** Canonical inputs copied into code-unit path order. */
    private readonly inputs: readonly CanonicalInput[];

    /** Read one own frontmatter entry as exact text or no value. */
    private textField(input: CanonicalInput, field: CanonicalField): string | null {
        // Report no supplied value for an absent field.
        if (!input.frontmatter.has(field)) {
            // Return the absent marker.
            return null;
        }

        // Require exact string text for the supplied value.
        const value: unknown = input.frontmatter.get(field);
        return typeof value === "string" ? value : null;
    }

    /** Return whether a value is a valid identifier for its concept level. */
    private isValidIdentifier(value: unknown): value is string {
        // Reject every non-text value without coercing it.
        if (typeof value !== "string") {
            // Report the unsupported value.
            return false;
        }

        // Reject empty and padded values without normalizing.
        return value !== "" && value === value.trim();
    }

    /** Throw when an identifier is absent or invalid for a required field. */
    private requiredIdentifier(
        input: CanonicalInput,
        field: CanonicalField,
        kind: CommitmentKind,
    ): string {
        // Reject an absent required field.
        if (!input.frontmatter.has(field)) {
            // Report the missing field with its source path.
            throw new Error(
                `Canonical ${kind} container '${input.path}' is missing required field '${field}'.`,
            );
        }

        // Read the supplied value without changing it.
        const value: unknown = input.frontmatter.get(field);

        // Reject a present value that is not a valid identifier.
        if (!this.isValidIdentifier(value)) {
            // Report the invalid field with its source path.
            throw new Error(
                `Canonical ${kind} container '${input.path}' has an invalid '${field}' value.`,
            );
        }

        // Return the validated identifier text.
        return value;
    }

    /** Return the canonical kind of one input, or null when it is not canonical. */
    private canonicalKind(input: CanonicalInput): CommitmentKind | null {
        // Read the exact type value as text.
        const value: string | null = this.textField(input, "type");

        // Accept only exact supported canonical type values.
        if (value !== null && CANONICAL_KINDS[value] === true) {
            // Return the recognized canonical kind.
            return value as CommitmentKind;
        }

        // Treat every other document as non-canonical.
        return null;
    }

    /** Read one optional project program value using the canonical rules. */
    private optionalProjectProgram(input: CanonicalInput): string | null {
        // Name the canonical relationship field for typed access.
        const field: CanonicalField = "program";

        // Treat an absent program field as no relationship.
        if (!input.frontmatter.has(field)) {
            // Report no relationship.
            return null;
        }

        // Read the present value without changing it.
        const value: unknown = input.frontmatter.get(field);

        // Treat an explicit null value as no relationship.
        if (value === null || value === undefined) {
            // Report no relationship.
            return null;
        }

        // Reject every other value that is not a valid program identifier.
        if (!this.isValidIdentifier(value)) {
            // Report the invalid optional relationship.
            throw new Error(
                `Canonical project container '${input.path}' has an invalid 'program' value.`,
            );
        }

        // Return the validated program identifier.
        return value;
    }

    /** Read one support association from its exact dependent fields. */
    private supportAssociation(input: CanonicalInput): SupportAssociation | null {
        // Read the dependent level and anchor fields as exact text.
        const level: string | null = this.textField(input, "level");
        const anchor: string | null = this.textField(input, "anchor");

        // Reject a missing or malformed level or anchor.
        if (level === null || anchor === null || SUPPORT_LEVELS[level] !== true) {
            // Report no usable association.
            return null;
        }

        // Reject an invalid anchored identifier.
        if (!this.isValidIdentifier(anchor)) {
            // Report no usable association.
            return null;
        }

        // Return the recognized support association.
        return { level: level as CommitmentLevel, identifier: anchor };
    }

    /** Scan the sorted inputs once and collect the normalized local data. */
    private normalize(): NormalizedInputs {
        // Start the local containers, area set, supports, and findings.
        const areas: Map<string, AreaEntry[]> = new Map<string, AreaEntry[]>();
        const programs: Map<string, ProgramEntry[]> = new Map<string, ProgramEntry[]>();
        const projects: Map<string, ProjectEntry[]> = new Map<string, ProjectEntry[]>();
        const programProjects: Map<string, Map<string, ProjectEntry[]>> = new Map<
            string,
            Map<string, ProjectEntry[]>
        >();
        const areaIds: Set<string> = new Set<string>();
        const pendingSupports: PendingSupport[] = [];
        const findings: Diagnostic[] = [];

        // Track duplicated identifiers by concept level.
        const duplicates: Record<CommitmentLevel, Set<string>> = {
            area: new Set<string>(),
            program: new Set<string>(),
            project: new Set<string>(),
        };

        // Classify and group every input in path order.
        for (const input of this.inputs) {
            // Read the canonical kind and skip non-canonical documents.
            const kind: CommitmentKind | null = this.canonicalKind(input);
            if (kind === null) {
                // Continue with the next input.
                continue;
            }

            // Group a canonical area container's required identity.
            if (kind === "area") {
                // Require a valid typed area identifier.
                const entry: AreaEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                };

                // Establish the area container identifier.
                areaIds.add(entry.id);

                // Insert the area container and record a duplicate representation.
                this.insertContainer(areas, duplicates.area, entry);
                continue;
            }

            // Group a canonical program container's required identity and area.
            if (kind === "program") {
                // Require valid program identity and area references.
                const entry: ProgramEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                    area: this.requiredIdentifier(input, "area", kind),
                };

                // Establish the area declared by the program container.
                areaIds.add(entry.area);

                // Insert the program container and record a duplicate representation.
                this.insertContainer(programs, duplicates.program, entry);
                continue;
            }

            // Group a canonical project's identity, area, and optional program.
            if (kind === "project") {
                // Require valid project identity and area references.
                const entry: ProjectEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                    area: this.requiredIdentifier(input, "area", kind),
                    program: this.optionalProjectProgram(input),
                };

                // Establish the area declared by the project.
                areaIds.add(entry.area);

                // Insert the project container and record a duplicate representation.
                this.insertContainer(projects, duplicates.project, entry);

                // Group a program relationship by program and declaring area.
                if (entry.program === null) {
                    // Continue with the next input.
                    continue;
                }

                // Read or start the program's area groups.
                let groups: Map<string, ProjectEntry[]> | undefined = programProjects.get(
                    entry.program,
                );
                if (groups === undefined) {
                    // Create the program group map.
                    groups = new Map<string, ProjectEntry[]>();
                    programProjects.set(entry.program, groups);
                }

                // Read or start the area's project list.
                let coordinated: ProjectEntry[] | undefined = groups.get(entry.area);
                if (coordinated === undefined) {
                    // Create the area project list.
                    coordinated = [];
                    groups.set(entry.area, coordinated);
                }

                // Add the project under its program and area.
                coordinated.push(entry);
                continue;
            }

            // Read the support association from its dependent fields.
            const association: SupportAssociation | null = this.supportAssociation(input);

            // Diagnose a support container with no usable canonical anchor.
            if (association === null) {
                // Report the unresolved input without inventing a target.
                findings.push(
                    createDiagnostic(
                        "unresolved_anchor",
                        `Canonical ${kind} container '${input.path}' has no usable canonical anchor; it is omitted from the commitment graph.`,
                        [input.path],
                    ),
                );
                continue;
            }

            // Establish an explicit area-level support anchor directly.
            if (association.level === "area") {
                // Add the referenced area without inventing a graph node.
                areaIds.add(association.identifier);
                continue;
            }

            // Defer project and program targets until the graph exists.
            pendingSupports.push({
                level: association.level,
                identifier: association.identifier,
                path: input.path,
            });
        }

        // Select the first duplicate in concept-level and identifier order.
        const duplicate: DuplicateContainers | null =
            this.firstDuplicate("area", areas, duplicates.area) ??
            this.firstDuplicate("program", programs, duplicates.program) ??
            this.firstDuplicate("project", projects, duplicates.project);

        // Return every local result from the single scan.
        return {
            areas,
            programs,
            projects,
            programProjects,
            areaIds,
            pendingSupports,
            findings,
            duplicate,
        };
    }

    /** Insert one container and record a duplicate when another source path exists. */
    private insertContainer<Entry extends AreaEntry>(
        groups: Map<string, Entry[]>,
        duplicates: Set<string>,
        entry: Entry,
    ): void {
        // Read the existing containers for the identifier.
        const existing: Entry[] | undefined = groups.get(entry.id);

        // Record the identifier when another source path already represents it.
        if (
            existing !== undefined &&
            existing.some((other: Entry): boolean => other.path !== entry.path)
        ) {
            duplicates.add(entry.id);
        }

        // Append the container under its identifier.
        appendGrouped(groups, entry.id, entry);
    }

    /** Return the first duplicated identifier for one concept level. */
    private firstDuplicate<Entry extends AreaEntry>(
        level: CommitmentLevel,
        groups: ReadonlyMap<string, readonly Entry[]>,
        identifiers: ReadonlySet<string>,
    ): DuplicateContainers | null {
        // Order the duplicated identifiers by code unit.
        const ordered: readonly string[] = [...identifiers].sort(
            (left: string, right: string): number => compareText(left, right),
        );

        // Read the first duplicated identifier.
        const identifier: string | undefined = ordered[0];
        if (identifier === undefined) {
            // Report no duplicate at this concept level.
            return null;
        }

        // Collect every distinct source path in code-unit order.
        const paths: readonly string[] = uniqueSorted(
            (groups.get(identifier) ?? []).map((entry: Entry): string => entry.path),
        );

        // Return the first duplicate representation.
        return { level, identifier, paths };
    }

    /** Render the blocking duplicate representation failure. */
    private duplicateError(duplicate: DuplicateContainers): Error {
        // Quote each distinct source path.
        const rendered: string = duplicate.paths
            .map((path: string): string => `'${path}'`)
            .join(", ");

        // Build the message naming the level, identifier, and sources.
        return new Error(
            `Multiple ${duplicate.level} containers represent ${duplicate.level} identifier '${duplicate.identifier}': ${rendered}.`,
        );
    }

    /** Validate every program declared by a container or project reference. */
    private resolvePrograms(normalized: NormalizedInputs): ProgramResolution {
        // Read the programs declared by a container or a project reference.
        const identifiers: readonly string[] = uniqueSorted([
            ...normalized.programs.keys(),
            ...normalized.programProjects.keys(),
        ]);

        // Start the validated programs and their findings.
        const programs: ResolvedProgram[] = [];
        const findings: Diagnostic[] = [];

        // Validate each program in identifier order.
        for (const identifier of identifiers) {
            // Read the first container and the project area groups.
            const container: ProgramEntry | undefined = normalized.programs.get(identifier)?.[0];
            const groups: Map<string, ProjectEntry[]> =
                normalized.programProjects.get(identifier) ?? new Map<string, ProjectEntry[]>();

            // Collect every area declared for the program.
            const declaredAreas: Set<string> = new Set<string>(groups.keys());
            if (container !== undefined) {
                // Add the program container's declared area.
                declaredAreas.add(container.area);
            }

            // Collect every source path that defines the program.
            const sourcePaths: string[] = [];
            if (container !== undefined) {
                // Include the program container path.
                sourcePaths.push(container.path);
            }
            for (const projects of groups.values()) {
                // Include each project path that names the program.
                sourcePaths.push(...projects.map((project: ProjectEntry): string => project.path));
            }

            // Read the declared areas and project count for the program.
            const areas: readonly string[] = [...declaredAreas];
            const projectCount: number =
                areas.length === 1 ? (groups.get(areas[0] ?? "") ?? []).length : 0;

            // Resolve the structural finding for the program.
            const finding: Diagnostic | null = this.programFinding(
                identifier,
                areas,
                projectCount,
                sourcePaths,
            );

            // Report underfilled programs as warnings; keep contradictions blocking.
            if (finding !== null) {
                if (finding.code === "underfilled_program") {
                    // Retain the nonblocking program warning.
                    findings.push(finding);
                } else {
                    // Raise the graph error from the blocking finding.
                    throw new Error(finding.message);
                }
            }

            // Read the single validated area and its coordinated projects.
            const area: string = areas[0] ?? "";
            const coordinated: readonly ProjectEntry[] = groups.get(area) ?? [];

            // Store the validated program with its coordinated project identifiers.
            programs.push({
                id: identifier,
                area,
                projects: coordinated.map((project: ProjectEntry): string => project.id),
            });
        }

        // Return the validated programs and their findings.
        return { programs, findings };
    }

    /** Return the structural finding for one program definition. */
    private programFinding(
        program: string,
        areas: readonly string[],
        projectCount: number,
        paths: readonly string[],
    ): Diagnostic | null {
        // Sort the distinct source paths and declared areas.
        const stablePaths: readonly string[] = uniqueSorted(paths);
        const stableAreas: readonly string[] = uniqueSorted(areas);

        // Reject contradictory area declarations instead of selecting a winner.
        if (stableAreas.length > 1) {
            // Render the readable area list.
            const rendered: string = stableAreas
                .map((area: string): string => `'${area}'`)
                .join(", ");
            const message: string = `Program identifier '${program}' has conflicting area declarations: ${rendered}.`;

            // Return the blocking structural finding.
            return createDiagnostic(
                "contradictory_program_area",
                message,
                stablePaths,
                stableAreas.length,
                1,
            );
        }

        // Accept a program that coordinates two or more distinct projects.
        if (stableAreas.length === 0 || projectCount >= 2) {
            // Report no structural finding.
            return null;
        }

        // Build the underfilled warning with the domain recommendation.
        const message: string = `Program identifier '${program}' in area '${stableAreas[0]}' has ${projectCount} project(s); at least 2 are recommended.`;

        // Return the nonblocking program finding.
        return createDiagnostic(
            "underfilled_program",
            message,
            stablePaths,
            projectCount,
            2,
        );
    }

    /** Build one sorted area snapshot from the normalized local data. */
    private buildArea(
        area: string,
        projects: ReadonlyMap<string, readonly ProjectEntry[]>,
        programs: readonly ResolvedProgram[],
    ): GraphArea {
        // Collect direct project identifiers declared under the area.
        const directProjects: string[] = [];
        for (const entries of projects.values()) {
            for (const project of entries) {
                // Skip program-coordinated projects and projects in another area.
                if (project.program !== null || project.area !== area) {
                    // Continue with the next project.
                    continue;
                }

                // Add the direct project identifier.
                directProjects.push(project.id);
            }
        }

        // Sort the direct project identifiers by code unit.
        directProjects.sort(
            (left: string, right: string): number => compareText(left, right),
        );

        // Collect the programs declared under the area.
        const areaPrograms: GraphProgram[] = [];
        for (const program of programs) {
            // Skip a program declared under another area.
            if (program.area !== area) {
                // Continue with the next program.
                continue;
            }

            // Add the program with its sorted project identifiers.
            areaPrograms.push({
                id: program.id,
                projects: [...program.projects].sort(
                    (left: string, right: string): number => compareText(left, right),
                ),
            });
        }

        // Sort the programs by identifier.
        areaPrograms.sort(
            (left: GraphProgram, right: GraphProgram): number => compareText(left.id, right.id),
        );

        // Return the area with sorted direct projects and programs.
        return { id: area, projects: directProjects, programs: areaPrograms };
    }

    /** Build the membership sets from the normalized local data. */
    private members(
        normalized: NormalizedInputs,
        programs: readonly ResolvedProgram[],
    ): Readonly<Record<CommitmentLevel, ReadonlySet<string>>> {
        // Return one set per concept level.
        return {
            area: normalized.areaIds,
            program: new Set<string>(
                programs.map((program: ResolvedProgram): string => program.id),
            ),
            project: new Set<string>(normalized.projects.keys()),
        };
    }

    /** Index the first explicit container source path per concept level. */
    private containerPaths(
        normalized: NormalizedInputs,
    ): Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>> {
        // Start one empty source index per concept level.
        const paths: Record<CommitmentLevel, Map<string, string>> = {
            area: new Map<string, string>(),
            program: new Map<string, string>(),
            project: new Map<string, string>(),
        };

        // Record the first explicit area source path for each identifier.
        for (const [identifier, entries] of normalized.areas) {
            const entry: AreaEntry | undefined = entries[0];
            if (entry !== undefined) {
                paths.area.set(identifier, entry.path);
            }
        }

        // Record the first explicit program source path for each identifier.
        for (const [identifier, entries] of normalized.programs) {
            const entry: ProgramEntry | undefined = entries[0];
            if (entry !== undefined) {
                paths.program.set(identifier, entry.path);
            }
        }

        // Record the first explicit project source path for each identifier.
        for (const [identifier, entries] of normalized.projects) {
            const entry: ProjectEntry | undefined = entries[0];
            if (entry !== undefined) {
                paths.project.set(identifier, entry.path);
            }
        }

        // Return the per-level source indexes.
        return paths;
    }

    /** Sort a copy of the inputs without mutating the caller's list. */
    public constructor(inputs: readonly CanonicalInput[]) {
        this.inputs = [...inputs].sort(
            (left: CanonicalInput, right: CanonicalInput): number =>
                compareText(left.path, right.path),
        );
    }

    /** Normalize, validate, and project the commitment graph. */
    public build(): GraphResult {
        // Scan every sorted input once and collect the normalized local data.
        const normalized: NormalizedInputs = this.normalize();

        // Reject duplicate representations before validating any program.
        if (normalized.duplicate !== null) {
            throw this.duplicateError(normalized.duplicate);
        }

        // Validate every declared program after normalization.
        const resolution: ProgramResolution = this.resolvePrograms(normalized);

        // Build the sorted area snapshots from every established area.
        const areas: readonly GraphArea[] = [...normalized.areaIds]
            .sort((left: string, right: string): number => compareText(left, right))
            .map(
                (area: string): GraphArea =>
                    this.buildArea(area, normalized.projects, resolution.programs),
            );

        // Copy the findings so the snapshot can append its own diagnostics.
        const diagnostics: Diagnostic[] = [...normalized.findings, ...resolution.findings];

        // Create the immutable snapshot, which resolves the pending supports.
        const graph: CommitmentGraph = new CommitmentGraph(
            areas,
            this.members(normalized, resolution.programs),
            this.containerPaths(normalized),
            normalized.pendingSupports,
            diagnostics,
        );

        // Return the graph and diagnostics from the same construction pass.
        return { graph, diagnostics };
    }
}
