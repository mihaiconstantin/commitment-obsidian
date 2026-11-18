/**
 * Derive and validate the canonical commitment graph from saved frontmatter.
 *
 * The rules mirror the repository's Python graph builder, excluding legacy
 * recognition. This class has no Obsidian, presentation, or file dependency.
 */

import type { CanonicalField } from "./canonical-field";
import { compareCodePoints } from "./code-point-order";
import { createDiagnostic, createFailure } from "./plugin-failure";
import { serializeProjection } from "./projection-writer";
import type {
    CanonicalInput,
    CommitmentKind,
    CommitmentLevel,
    Diagnostic,
    GraphArea,
    GraphProgram,
} from "./graph-types";


/** A graph snapshot and the diagnostics captured with it. */
export interface GraphResult {
    /** Immutable graph snapshot. */
    readonly graph: CommitmentGraph;

    /** Nonblocking findings from the same build moment. */
    readonly diagnostics: readonly Diagnostic[];
}


/** One canonical area representation. */
interface AreaInput {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated area identifier. */
    readonly id: string;
}


/** One canonical program representation. */
interface ProgramInput {
    /** Root-relative source path. */
    readonly path: string;

    /** Validated program identifier. */
    readonly id: string;

    /** Required program area. */
    readonly area: string;
}


/** One canonical project representation. */
interface ProjectInput {
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


/** One pending support anchor awaiting graph membership. */
interface PendingSupport {
    /** Concept level of the anchored identifier. */
    readonly level: CommitmentLevel;

    /** Exact anchored identifier text. */
    readonly identifier: string;

    /** Root-relative source path. */
    readonly path: string;
}


/** One collected representation with its concept level. */
interface LeveledIdentifier {
    /** Concept level of the representation. */
    readonly level: CommitmentLevel;

    /** Validated identifier text. */
    readonly identifier: string;

    /** Root-relative source path. */
    readonly path: string;
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


/** Python whitespace characters, including the information separators. */
const PYTHON_WHITESPACE: RegExp =
    /[\t\n\v\f\r \u001c-\u001f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;


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


/** Return the text without leading and trailing Python whitespace. */
function pythonStrip(value: string): string {
    // Walk from the start to the first non-whitespace code unit.
    let start: number = 0;
    while (start < value.length && PYTHON_WHITESPACE.test(value.charAt(start))) {
        // Advance past the whitespace character.
        start += 1;
    }

    // Walk from the end to the last non-whitespace code unit.
    let end: number = value.length;
    while (end > start && PYTHON_WHITESPACE.test(value.charAt(end - 1))) {
        // Retreat past the whitespace character.
        end -= 1;
    }

    // Return the retained slice.
    return value.slice(start, end);
}


/** Return whether a value is a valid identifier for its concept level. */
function isValidIdentifier(value: unknown): value is string {
    // Reject every non-text value without coercing it.
    if (typeof value !== "string") {
        // Report the unsupported value.
        return false;
    }

    // Reject empty, whitespace-only, and padded values without normalizing.
    return value !== "" && pythonStrip(value) !== "" && value === pythonStrip(value);
}


/** Throw when an identifier is absent or invalid for a required field. */
function requiredIdentifier(
    input: CanonicalInput,
    field: CanonicalField,
    kind: CommitmentKind,
    code: string,
): string {
    // Reject an absent required field.
    if (!input.frontmatter.has(field)) {
        // Report the missing field with its source path.
        throw createFailure(
            code,
            `Canonical ${kind} container '${input.path}' is missing required field '${field}'.`,
            [createDiagnostic(code, `Missing required field '${field}'.`, [input.path])],
        );
    }

    // Read the supplied value without changing it.
    const value: unknown = input.frontmatter.get(field);

    // Reject a present value that is not a valid identifier.
    if (!isValidIdentifier(value)) {
        // Report the invalid field with its source path.
        throw createFailure(
            code,
            `Canonical ${kind} container '${input.path}' has an invalid '${field}' value.`,
            [createDiagnostic(code, `Invalid '${field}' value.`, [input.path])],
        );
    }

    // Return the validated identifier text.
    return value;
}


/** Build one blocking graph failure with its finding. */
function graphFailure(diagnostic: Diagnostic): Error {
    // Return the failure carrying the blocking finding.
    return createFailure("graph_error", diagnostic.message, [diagnostic]);
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
        throw createFailure(
            "invalid_project_program",
            `Canonical project container '${input.path}' has an invalid 'program' value.`,
            [
                createDiagnostic(
                    "invalid_project_program",
                    "Invalid 'program' value.",
                    [input.path],
                ),
            ],
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


/** Return a sorted list of unique strings by code point. */
function uniqueSorted(values: Iterable<string>): readonly string[] {
    // Deduplicate the values with a set.
    const unique: Set<string> = new Set<string>(values);

    // Return the values in code-point order.
    return [...unique].sort(compareCodePoints);
}


/** Return the blocking duplicate representation failure, if any. */
function duplicateRepresentation(
    identifiers: readonly LeveledIdentifier[],
): Error | null {
    // Group source paths by concept level and exact identifier text.
    const groups: Map<CommitmentLevel, Map<string, string[]>> = new Map<
        CommitmentLevel,
        Map<string, string[]>
    >();
    for (const item of identifiers) {
        // Read or start the identifier groups for the concept level.
        let byIdentifier: Map<string, string[]> | undefined = groups.get(item.level);
        if (byIdentifier === undefined) {
            // Create the level's identifier groups.
            byIdentifier = new Map<string, string[]>();
            groups.set(item.level, byIdentifier);
        }

        // Read or start the source paths for the typed identifier.
        let paths: string[] | undefined = byIdentifier.get(item.identifier);
        if (paths === undefined) {
            // Start the identifier's source list.
            paths = [item.path];
            byIdentifier.set(item.identifier, paths);
            continue;
        }

        // Append to the existing source list.
        paths.push(item.path);
    }

    // Inspect concept levels in code-point order for deterministic findings.
    const levels: readonly CommitmentLevel[] = [...groups.keys()].sort(compareCodePoints);

    // Return the first duplicate representation.
    for (const level of levels) {
        // Read the identifier groups for this concept level.
        const byIdentifier: Map<string, string[]> = groups.get(level) ?? new Map();

        // Inspect identifiers in code-point order.
        const identifiersForLevel: readonly string[] = [...byIdentifier.keys()].sort(
            compareCodePoints,
        );
        for (const identifier of identifiersForLevel) {
            // Read the distinct source paths in code-point order.
            const paths: readonly string[] = uniqueSorted(
                byIdentifier.get(identifier) ?? [],
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
            return createFailure("duplicate_representation", message, [
                createDiagnostic(
                    "duplicate_representation",
                    message,
                    paths,
                    paths.length,
                    1,
                ),
            ]);
        }
    }

    // Report no duplicate representation.
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
            projects: [...(programProjects.get(program) ?? [])].sort(compareCodePoints),
        });
    }

    // Sort the programs by identifier.
    programs.sort(
        (left: GraphProgram, right: GraphProgram): number =>
            compareCodePoints(left.id, right.id),
    );

    // Return the area with sorted direct projects and programs.
    return {
        id: area,
        projects: [...(directProjects.get(area) ?? [])].sort(compareCodePoints),
        programs,
    };
}


/** Immutable commitment graph with structured access and JSON projection. */
export class CommitmentGraph {
    /** Sorted area snapshots. */
    private readonly areas: readonly GraphArea[];

    /** Known identifiers by concept level. */
    private readonly members: ReadonlyMap<CommitmentLevel, ReadonlySet<string>>;

    /** Construct the graph from prepared snapshots. */
    private constructor(
        areas: readonly GraphArea[],
        members: ReadonlyMap<CommitmentLevel, ReadonlySet<string>>,
    ) {
        // Store the prepared snapshot and membership sets.
        this.areas = areas;
        this.members = members;
    }

    /** Build and validate one graph from saved canonical inputs. */
    static build(inputs: readonly CanonicalInput[]): GraphResult {
        // Sort the canonical inputs by portable path for deterministic findings.
        const ordered: readonly CanonicalInput[] = [...inputs].sort(
            (left: CanonicalInput, right: CanonicalInput): number =>
                compareCodePoints(left.path, right.path),
        );

        // Collect the canonical structural inputs and unresolved findings.
        const areaInputs: AreaInput[] = [];
        const supportAreas: string[] = [];
        const programInputs: ProgramInput[] = [];
        const projectInputs: ProjectInput[] = [];
        const pendingSupports: PendingSupport[] = [];
        const diagnostics: Diagnostic[] = [];

        // Classify each input for graph construction.
        for (const input of ordered) {
            // Read the canonical kind and skip non-canonical documents.
            const kind: CommitmentKind | null = canonicalKind(input);
            if (kind === null) {
                // Continue with the next input.
                continue;
            }

            // Collect a canonical area container's required identity.
            if (kind === "area") {
                // Require a valid typed area identifier.
                areaInputs.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_area_identity"),
                });
                continue;
            }

            // Collect a canonical program container's required identity and area.
            if (kind === "program") {
                // Require valid program identity and area references.
                programInputs.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_program_identity"),
                    area: requiredIdentifier(input, "area", kind, "missing_program_area"),
                });
                continue;
            }

            // Collect a canonical project's identity, area, and optional program.
            if (kind === "project") {
                // Require valid project identity and area references.
                projectInputs.push({
                    path: input.path,
                    id: requiredIdentifier(input, "id", kind, "missing_project_identity"),
                    area: requiredIdentifier(input, "area", kind, "missing_project_area"),
                    program: optionalProjectProgram(input),
                });
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

        // List every typed representation for duplicate detection.
        const representations: LeveledIdentifier[] = [
            ...areaInputs.map(
                (input: AreaInput): LeveledIdentifier => ({
                    level: "area",
                    identifier: input.id,
                    path: input.path,
                }),
            ),
            ...programInputs.map(
                (input: ProgramInput): LeveledIdentifier => ({
                    level: "program",
                    identifier: input.id,
                    path: input.path,
                }),
            ),
            ...projectInputs.map(
                (input: ProjectInput): LeveledIdentifier => ({
                    level: "project",
                    identifier: input.id,
                    path: input.path,
                }),
            ),
        ];

        // Reject duplicate representations before building any graph node.
        const conflict: Error | null = duplicateRepresentation(representations);
        if (conflict !== null) {
            // Raise the duplicate representation failure.
            throw conflict;
        }

        // Establish every area named by a container, support anchor, or relationship.
        const areaValues: Set<string> = new Set<string>();
        for (const input of areaInputs) {
            // Add the area established by its canonical container.
            areaValues.add(input.id);
        }
        for (const area of supportAreas) {
            // Add the area established by its area-level support anchor.
            areaValues.add(area);
        }
        for (const input of programInputs) {
            // Add the program container's area.
            areaValues.add(input.area);
        }
        for (const input of projectInputs) {
            // Add the project's area.
            areaValues.add(input.area);
        }

        // Group project references by program and declaring area.
        const programProjectGroups: Map<string, Map<string, ProjectInput[]>> =
            new Map<string, Map<string, ProjectInput[]>>();
        for (const project of projectInputs) {
            // Skip projects with no program relationship.
            if (project.program === null) {
                // Continue with the next project.
                continue;
            }

            // Read or start the program's area groups.
            let groups: Map<string, ProjectInput[]> | undefined = programProjectGroups.get(
                project.program,
            );
            if (groups === undefined) {
                // Create the program group map.
                groups = new Map<string, ProjectInput[]>();
                programProjectGroups.set(project.program, groups);
            }

            // Read or start the area's project list.
            let projects: ProjectInput[] | undefined = groups.get(project.area);
            if (projects === undefined) {
                // Create the area project list.
                projects = [];
                groups.set(project.area, projects);
            }

            // Add the project under its program and area.
            projects.push(project);
        }

        // Index the unique canonical program containers.
        const programContainers: Map<string, ProgramInput> = new Map<string, ProgramInput>();
        for (const input of programInputs) {
            // Record the container under its validated identifier.
            programContainers.set(input.id, input);
        }

        // Derive and validate every referenced or container-declared program.
        const programAreas: Map<string, string> = new Map<string, string>();
        const programProjects: Map<string, readonly string[]> = new Map<
            string,
            readonly string[]
        >();
        const programIdentifiers: Set<string> = new Set<string>();
        const declaredPrograms: readonly string[] = uniqueSorted([
            ...programContainers.keys(),
            ...programProjectGroups.keys(),
        ]);

        // Validate each program in identifier order.
        for (const program of declaredPrograms) {
            // Read the optional container and the project area groups.
            const container: ProgramInput | undefined = programContainers.get(program);
            const groups: Map<string, ProjectInput[]> =
                programProjectGroups.get(program) ?? new Map<string, ProjectInput[]>();

            // Collect every area declared for the program.
            const declaredAreas: Set<string> = new Set<string>(groups.keys());
            if (container !== undefined) {
                // Add the program container's declared area.
                declaredAreas.add(container.area);
            }

            // Collect every source path for the program definition.
            const sourcePaths: string[] = [];
            if (container !== undefined) {
                // Include the program container path.
                sourcePaths.push(container.path);
            }
            for (const projects of groups.values()) {
                // Include each project path that names the program.
                sourcePaths.push(...projects.map((project: ProjectInput): string => project.path));
            }

            // Read the declared areas and the project count in the single area.
            const declared: readonly string[] = [...declaredAreas];
            const projectCount: number =
                declared.length === 1
                    ? (groups.get(declared[0] ?? "") ?? []).length
                    : 0;

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
                    throw graphFailure(finding);
                }
            }

            // Use the single validated area and its coordinated projects.
            const area: string = declared[0] ?? "";
            const projects: readonly ProjectInput[] = groups.get(area) ?? [];

            // Store the validated program area and coordinated project list.
            programAreas.set(program, area);
            programProjects.set(
                program,
                projects.map((project: ProjectInput): string => project.id),
            );
            programIdentifiers.add(program);
        }

        // Group direct projects and programs under their established areas.
        const directProjects: Map<string, string[]> = new Map<string, string[]>();
        for (const area of areaValues) {
            // Start an empty direct project list for each area.
            directProjects.set(area, []);
        }

        // Add projects with no program relationship to their area's direct list.
        for (const project of projectInputs) {
            // Skip projects coordinated by a program.
            if (project.program !== null) {
                // Continue with the next project.
                continue;
            }

            // Read or start the direct project list for the project area.
            const projects: string[] | undefined = directProjects.get(project.area);
            if (projects === undefined) {
                // Start the area's direct project list.
                directProjects.set(project.area, [project.id]);
                continue;
            }

            // Append the direct project.
            projects.push(project.id);
        }

        // Build the sorted area snapshots from every established area.
        const areas: GraphArea[] = [...areaValues]
            .sort(compareCodePoints)
            .map(
                (area: string): GraphArea =>
                    buildArea(area, directProjects, programAreas, programProjects),
            );

        // Collect the known project identifiers from every area snapshot.
        const projectIdentifiers: Set<string> = new Set<string>();
        for (const area of areas) {
            // Register each direct project under its area.
            for (const project of area.projects) {
                // Record the direct project membership.
                projectIdentifiers.add(project);
            }
            for (const program of area.programs) {
                // Register each coordinated project.
                for (const project of program.projects) {
                    // Record the coordinated project membership.
                    projectIdentifiers.add(project);
                }
            }
        }

        // Build the typed membership sets for support-target resolution.
        const members: Map<CommitmentLevel, ReadonlySet<string>> = new Map<
            CommitmentLevel,
            ReadonlySet<string>
        >();
        members.set("area", areaValues);
        members.set("program", programIdentifiers);
        members.set("project", projectIdentifiers);

        // Create the immutable graph snapshot.
        const graph: CommitmentGraph = new CommitmentGraph(areas, members);

        // Diagnose support anchors whose typed targets are absent from the graph.
        for (const support of pendingSupports) {
            // Require the support target to be a known graph member.
            if (graph.contains(support.level, support.identifier)) {
                // Continue when the target already exists in the graph.
                continue;
            }

            // Diagnose the unresolved target without inventing a node.
            diagnostics.push(
                createDiagnostic(
                    "unresolved_anchor",
                    `Support container '${support.path}' anchors to unknown ${support.level} identifier '${support.identifier}'; it is omitted from the commitment graph.`,
                    [support.path],
                ),
            );
        }

        // Return the graph and diagnostics from the same build moment.
        return { graph, diagnostics };
    }

    /** Return whether a typed identifier is a member of the graph. */
    contains(level: CommitmentLevel, identifier: string): boolean {
        // Report membership from the matching concept-level set.
        return this.members.get(level)?.has(identifier) ?? false;
    }

    /** Return the sorted area snapshots. */
    getAreas(): readonly GraphArea[] {
        // Return the immutable area list.
        return this.areas;
    }

    /** Serialize the direct projection exactly as the Python exporter does. */
    toJson(): string {
        // Render the shared direct projection.
        return serializeProjection(this.areas);
    }
}
