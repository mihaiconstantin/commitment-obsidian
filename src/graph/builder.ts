/**
 * Derive and validate the canonical commitment graph from saved frontmatter.
 *
 * Construction runs in two passes: one normalization pass validates and groups
 * the recognized canonical documents, then one validation and projection pass
 * rejects duplicate representations and builds the area snapshots and
 * membership indexes. Supports that anchor to a program or project stay
 * pending until the caller has a membership-checked snapshot.
 */

import type { CanonicalField } from "../frontmatter/canonical-field";
import { createDiagnostic } from "../plugin-failure";
import { compareText } from "./compare-text";
import type {
    CanonicalInput,
    CommitmentKind,
    CommitmentLevel,
    Diagnostic,
    GraphArea,
    GraphProgram,
    PendingSupport,
} from "./types";


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


/** Validated canonical documents grouped by typed identifier. */
interface NormalizedInputs {
    /** Area containers grouped by identifier. */
    readonly areas: Map<string, AreaEntry[]>;

    /** Program containers grouped by identifier. */
    readonly programs: Map<string, ProgramEntry[]>;

    /** Project containers grouped by identifier. */
    readonly projects: Map<string, ProjectEntry[]>;

    /** Areas established only by an area-level support anchor. */
    readonly supportAreas: string[];

    /** Support anchors that need the finished membership sets. */
    readonly pendingSupports: PendingSupport[];

    /** Classification findings in source path order. */
    readonly diagnostics: Diagnostic[];
}


/** One constructed graph before the snapshot resolves its pending supports. */
export interface BuiltGraph {
    /** Sorted area snapshots. */
    readonly areas: readonly GraphArea[];

    /** Known identifiers by concept level. */
    readonly members: Readonly<Record<CommitmentLevel, ReadonlySet<string>>>;

    /** Explicit container source paths by concept level and identifier. */
    readonly containerPaths: Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>>;

    /** Support anchors that need the finished membership sets. */
    readonly pendingSupports: readonly PendingSupport[];

    /** Nonblocking findings captured before the snapshot exists. */
    readonly diagnostics: Diagnostic[];
}


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


/** Read one own frontmatter entry as exact text or no value. */
function textField(input: CanonicalInput, field: CanonicalField): string | null {
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
function isValidIdentifier(value: unknown): value is string {
    // Reject every non-text value without coercing it.
    if (typeof value !== "string") {
        // Report the unsupported value.
        return false;
    }

    // Reject empty and padded values without normalizing.
    return value !== "" && value === value.trim();
}


/** Throw when an identifier is absent or invalid for a required field. */
function requiredIdentifier(
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
    if (!isValidIdentifier(value)) {
        // Report the invalid field with its source path.
        throw new Error(
            `Canonical ${kind} container '${input.path}' has an invalid '${field}' value.`,
        );
    }

    // Return the validated identifier text.
    return value;
}


/** Return the canonical kind of one input, or null when it is not canonical. */
function canonicalKind(input: CanonicalInput): CommitmentKind | null {
    // Read the exact type value as text.
    const value: string | null = textField(input, "type");

    // Accept only exact supported canonical type values.
    if (value !== null && CANONICAL_KINDS[value] === true) {
        // Return the recognized canonical kind.
        return value as CommitmentKind;
    }

    // Treat every other document as non-canonical.
    return null;
}


/** Read one optional project program value using the canonical rules. */
function optionalProjectProgram(input: CanonicalInput): string | null {
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
    if (!isValidIdentifier(value)) {
        // Report the invalid optional relationship.
        throw new Error(
            `Canonical project container '${input.path}' has an invalid 'program' value.`,
        );
    }

    // Return the validated program identifier.
    return value;
}


/** Read one support association from its exact dependent fields. */
function supportAssociation(input: CanonicalInput): SupportAssociation | null {
    // Read the dependent level and anchor fields as exact text.
    const level: string | null = textField(input, "level");
    const anchor: string | null = textField(input, "anchor");

    // Reject a missing or malformed level or anchor.
    if (level === null || anchor === null || SUPPORT_LEVELS[level] !== true) {
        // Report no usable association.
        return null;
    }

    // Reject an invalid anchored identifier.
    if (!isValidIdentifier(anchor)) {
        // Report no usable association.
        return null;
    }

    // Return the recognized support association.
    return { level: level as CommitmentLevel, identifier: anchor };
}


/** Return a sorted list of unique strings by code-unit order. */
function uniqueSorted(values: Iterable<string>): readonly string[] {
    // Deduplicate the values with a set.
    const unique: Set<string> = new Set<string>(values);

    // Return the values in code-unit order.
    return [...unique].sort(compareText);
}


/** Append one entry under its grouping key. */
function appendGrouped<T>(groups: Map<string, T[]>, key: string, entry: T): void {
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


/** Validate one sorted input list and group its canonical containers. */
function normalizeInputs(inputs: readonly CanonicalInput[]): NormalizedInputs {
    // Start the grouped collections for the canonical containers.
    const areas: Map<string, AreaEntry[]> = new Map<string, AreaEntry[]>();
    const programs: Map<string, ProgramEntry[]> = new Map<string, ProgramEntry[]>();
    const projects: Map<string, ProjectEntry[]> = new Map<string, ProjectEntry[]>();

    // Start the area anchors, pending supports, and classification findings.
    const supportAreas: string[] = [];
    const pendingSupports: PendingSupport[] = [];
    const diagnostics: Diagnostic[] = [];

    // Classify every input in path order.
    for (const input of inputs) {
        // Read the canonical kind and skip non-canonical documents.
        const kind: CommitmentKind | null = canonicalKind(input);
        if (kind === null) {
            // Continue with the next input.
            continue;
        }

        // Group a canonical area container's required identity.
        if (kind === "area") {
            // Require a valid typed area identifier.
            const entry: AreaEntry = {
                path: input.path,
                id: requiredIdentifier(input, "id", kind),
            };

            // Group the area container under its identifier.
            appendGrouped(areas, entry.id, entry);
            continue;
        }

        // Group a canonical program container's required identity and area.
        if (kind === "program") {
            // Require valid program identity and area references.
            const entry: ProgramEntry = {
                path: input.path,
                id: requiredIdentifier(input, "id", kind),
                area: requiredIdentifier(input, "area", kind),
            };

            // Group the program container under its identifier.
            appendGrouped(programs, entry.id, entry);
            continue;
        }

        // Group a canonical project's identity, area, and optional program.
        if (kind === "project") {
            // Require valid project identity and area references.
            const entry: ProjectEntry = {
                path: input.path,
                id: requiredIdentifier(input, "id", kind),
                area: requiredIdentifier(input, "area", kind),
                program: optionalProjectProgram(input),
            };

            // Group the project container under its identifier.
            appendGrouped(projects, entry.id, entry);
            continue;
        }

        // Read the support association from its dependent fields.
        const association: SupportAssociation | null = supportAssociation(input);

        // Diagnose a support container with no usable canonical anchor.
        if (association === null) {
            // Report the unresolved input without inventing a target.
            diagnostics.push(
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
            supportAreas.push(association.identifier);
            continue;
        }

        // Defer project and program targets until the graph exists.
        pendingSupports.push({
            level: association.level,
            identifier: association.identifier,
            path: input.path,
        });
    }

    // Return the grouped structural inputs and findings.
    return {
        areas,
        programs,
        projects,
        supportAreas,
        pendingSupports,
        diagnostics,
    };
}


/** Return the blocking duplicate representation failure for one concept level. */
function duplicateRepresentation<Entry extends AreaEntry>(
    level: CommitmentLevel,
    groups: ReadonlyMap<string, readonly Entry[]>,
): Error | null {
    // Inspect identifiers in code-unit order for deterministic findings.
    const identifiers: readonly string[] = [...groups.keys()].sort(compareText);

    // Return the first duplicate representation.
    for (const identifier of identifiers) {
        // Read the distinct source paths in code-unit order.
        const paths: readonly string[] = uniqueSorted(
            (groups.get(identifier) ?? []).map((entry: Entry): string => entry.path),
        );

        // Skip identifiers represented only once.
        if (paths.length < 2) {
            // Continue with the next identifier.
            continue;
        }

        // Render the readable path list.
        const rendered: string = paths
            .map((path: string): string => `'${path}'`)
            .join(", ");

        // Build the message naming the level, identifier, and sources.
        const message: string = `Multiple ${level} containers represent ${level} identifier '${identifier}': ${rendered}.`;

        // Return the duplicate representation failure.
        return new Error(message);
    }

    // Report no duplicate representation at this concept level.
    return null;
}


/** Return the structural finding for one program definition. */
function programFinding(
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


/** Read every area declared for one program. */
function declaredProgramAreas(
    container: ProgramEntry | undefined,
    groups: ReadonlyMap<string, readonly ProjectEntry[]>,
): readonly string[] {
    // Collect every area declared by a project or the container.
    const areas: Set<string> = new Set<string>(groups.keys());
    if (container !== undefined) {
        // Add the program container's declared area.
        areas.add(container.area);
    }

    // Return the declared areas in insertion order.
    return [...areas];
}


/** Read every source path that defines one program. */
function programSourcePaths(
    container: ProgramEntry | undefined,
    groups: ReadonlyMap<string, readonly ProjectEntry[]>,
): readonly string[] {
    // Collect every source path for the program definition.
    const sourcePaths: string[] = [];
    if (container !== undefined) {
        // Include the program container path.
        sourcePaths.push(container.path);
    }
    for (const projects of groups.values()) {
        // Include each project path that names the program.
        sourcePaths.push(...projects.map((project: ProjectEntry): string => project.path));
    }

    // Return the collected paths.
    return sourcePaths;
}


/** Build one sorted area snapshot. */
function buildArea(
    area: string,
    directProjects: ReadonlyMap<string, readonly string[]>,
    programAreas: ReadonlyMap<string, string>,
    programProjects: ReadonlyMap<string, readonly string[]>,
): GraphArea {
    // Collect the programs declared under the area.
    const programs: GraphProgram[] = [];
    for (const [program, declaredArea] of programAreas) {
        // Skip a program declared under another area.
        if (declaredArea !== area) {
            // Continue with the next program.
            continue;
        }

        // Add the program with its sorted project identifiers.
        programs.push({
            id: program,
            projects: [...(programProjects.get(program) ?? [])].sort(compareText),
        });
    }

    // Sort the programs by identifier.
    programs.sort(
        (left: GraphProgram, right: GraphProgram): number =>
            compareText(left.id, right.id),
    );

    // Return the area with sorted direct projects and programs.
    return {
        id: area,
        projects: [...(directProjects.get(area) ?? [])].sort(compareText),
        programs,
    };
}


/**
 * Build one graph snapshot from saved canonical inputs.
 *
 * The first pass validates and groups every canonical document. The second
 * pass rejects duplicates, resolves programs, and projects the grouped data
 * into the area snapshots and membership indexes.
 */
export function buildGraph(inputs: readonly CanonicalInput[]): BuiltGraph {
    // Sort the canonical inputs by portable path for deterministic findings.
    const ordered: readonly CanonicalInput[] = [...inputs].sort(
        (left: CanonicalInput, right: CanonicalInput): number =>
            compareText(left.path, right.path),
    );

    // Validate and group every canonical container in path order.
    const normalized: NormalizedInputs = normalizeInputs(ordered);

    // Reject duplicate representations before building any node.
    const conflict: Error | null =
        duplicateRepresentation("area", normalized.areas) ??
        duplicateRepresentation("program", normalized.programs) ??
        duplicateRepresentation("project", normalized.projects);
    if (conflict !== null) {
        // Raise the duplicate representation failure.
        throw conflict;
    }

    // Establish every area named by a container, support anchor, or project.
    const areaValues: Set<string> = new Set<string>(normalized.areas.keys());

    // Add the area established by each area-level support anchor.
    for (const area of normalized.supportAreas) {
        // Add the anchored area.
        areaValues.add(area);
    }

    // Add each program container's area.
    for (const entries of normalized.programs.values()) {
        for (const entry of entries) {
            // Add the program's area.
            areaValues.add(entry.area);
        }
    }

    // Add each project's area.
    for (const entries of normalized.projects.values()) {
        for (const entry of entries) {
            // Add the project's area.
            areaValues.add(entry.area);
        }
    }

    // Index the unique canonical program containers.
    const programContainers: Map<string, ProgramEntry> = new Map<string, ProgramEntry>();
    for (const [identifier, entries] of normalized.programs) {
        // Record the first container under its validated identifier.
        const container: ProgramEntry | undefined = entries[0];
        if (container !== undefined) {
            programContainers.set(identifier, container);
        }
    }

    // Group project references by program and declaring area.
    const programProjectGroups: Map<string, Map<string, ProjectEntry[]>> = new Map<string, Map<string, ProjectEntry[]>>();
    for (const entries of normalized.projects.values()) {
        for (const project of entries) {
            // Skip projects with no program relationship.
            if (project.program === null) {
                // Continue with the next project.
                continue;
            }

            // Read or start the program's area groups.
            let groups: Map<string, ProjectEntry[]> | undefined = programProjectGroups.get(
                project.program,
            );
            if (groups === undefined) {
                // Create the program group map.
                groups = new Map<string, ProjectEntry[]>();
                programProjectGroups.set(project.program, groups);
            }

            // Read or start the area's project list.
            let projects: ProjectEntry[] | undefined = groups.get(project.area);
            if (projects === undefined) {
                // Create the area project list.
                projects = [];
                groups.set(project.area, projects);
            }

            // Add the project under its program and area.
            projects.push(project);
        }
    }

    // Validate every referenced or container-declared program.
    const programAreas: Map<string, string> = new Map<string, string>();
    const programProjects: Map<string, readonly string[]> = new Map<string, readonly string[]>();
    const programIdentifiers: Set<string> = new Set<string>();
    const diagnostics: Diagnostic[] = normalized.diagnostics;

    // Read the programs declared by a container or a project reference.
    const declaredPrograms: readonly string[] = uniqueSorted([
        ...programContainers.keys(),
        ...programProjectGroups.keys(),
    ]);

    // Validate each program in identifier order.
    for (const program of declaredPrograms) {
        // Read the optional container and the project area groups.
        const container: ProgramEntry | undefined = programContainers.get(program);
        const groups: Map<string, ProjectEntry[]> =
            programProjectGroups.get(program) ?? new Map<string, ProjectEntry[]>();

        // Read the declared areas and source paths of the program.
        const declared: readonly string[] = declaredProgramAreas(container, groups);
        const sourcePaths: readonly string[] = programSourcePaths(container, groups);

        // Read the project count in the single declared area.
        const projectCount: number =
            declared.length === 1 ? (groups.get(declared[0] ?? "") ?? []).length : 0;

        // Resolve the shared structural finding for the program.
        const finding: Diagnostic | null = programFinding(
            program,
            declared,
            projectCount,
            sourcePaths,
        );

        // Report underfilled programs as warnings; keep contradictions blocking.
        if (finding !== null) {
            if (finding.code === "underfilled_program") {
                // Retain the nonblocking program warning.
                diagnostics.push(finding);
            } else {
                // Raise the graph error from the blocking finding.
                throw new Error(finding.message);
            }
        }

        // Use the single validated area and its coordinated projects.
        const area: string = declared[0] ?? "";
        const projects: readonly ProjectEntry[] = groups.get(area) ?? [];

        // Store the validated program area and coordinated project list.
        programAreas.set(program, area);
        programProjects.set(
            program,
            projects.map((project: ProjectEntry): string => project.id),
        );
        programIdentifiers.add(program);
    }

    // Group direct projects under their established areas.
    const directProjects: Map<string, string[]> = new Map<string, string[]>();
    for (const area of areaValues) {
        // Start an empty direct project list for each area.
        directProjects.set(area, []);
    }

    // Add projects with no program relationship to their area's direct list.
    for (const entries of normalized.projects.values()) {
        for (const project of entries) {
            // Skip projects coordinated by a program.
            if (project.program !== null) {
                // Continue with the next project.
                continue;
            }

            // Read the direct project list for the project area.
            const projects: string[] | undefined = directProjects.get(project.area);
            if (projects === undefined) {
                // Start the area's direct project list.
                directProjects.set(project.area, [project.id]);
                continue;
            }

            // Append the direct project.
            projects.push(project.id);
        }
    }

    // Build the sorted area snapshots from every established area.
    const areas: readonly GraphArea[] = [...areaValues]
        .sort(compareText)
        .map(
            (area: string): GraphArea =>
                buildArea(area, directProjects, programAreas, programProjects),
        );

    // Build the membership sets from the normalized data.
    const members: Readonly<Record<CommitmentLevel, ReadonlySet<string>>> = {
        area: areaValues,
        program: programIdentifiers,
        project: new Set<string>(normalized.projects.keys()),
    };

    // Start one empty source index per concept level.
    const containerPaths: Record<CommitmentLevel, Map<string, string>> = {
        area: new Map<string, string>(),
        program: new Map<string, string>(),
        project: new Map<string, string>(),
    };

    // Record the first explicit area source path for each identifier.
    for (const [identifier, entries] of normalized.areas) {
        const entry: AreaEntry | undefined = entries[0];
        if (entry !== undefined) {
            containerPaths.area.set(identifier, entry.path);
        }
    }

    // Record the first explicit program source path for each identifier.
    for (const [identifier, entries] of normalized.programs) {
        const entry: ProgramEntry | undefined = entries[0];
        if (entry !== undefined) {
            containerPaths.program.set(identifier, entry.path);
        }
    }

    // Record the first explicit project source path for each identifier.
    for (const [identifier, entries] of normalized.projects) {
        const entry: ProjectEntry | undefined = entries[0];
        if (entry !== undefined) {
            containerPaths.project.set(identifier, entry.path);
        }
    }

    // Return the assembled graph data for the snapshot.
    return {
        areas,
        members,
        containerPaths,
        pendingSupports: normalized.pendingSupports,
        diagnostics,
    };
}
