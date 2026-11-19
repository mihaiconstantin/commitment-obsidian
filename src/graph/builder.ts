/**
 * Derive and validate the canonical commitment graph from saved frontmatter.
 *
 * The rules mirror the repository's Python graph builder, excluding legacy
 * recognition. Canonical input reading lives in `canonical-inputs.ts`; this
 * module owns the construction rules and their intermediate collections.
 *
 * Construction runs in four named stages: reject duplicate representations,
 * establish areas, validate programs, then assemble the area snapshots and
 * membership indexes. Supports that anchor to a program or project stay
 * pending until the caller has a membership-checked snapshot.
 */

import { createDiagnostic, createFailure } from "../plugin-failure";
import type {
    AreaInput,
    CanonicalInputs,
    PendingSupport,
    ProgramInput,
    ProjectInput,
} from "./canonical-inputs";
import { CanonicalInputReader } from "./canonical-inputs";
import { compareCodePoints } from "./code-point-order";
import type {
    CanonicalInput,
    CommitmentLevel,
    Diagnostic,
    GraphArea,
    GraphProgram,
} from "./types";


/** One collected representation with its concept level. */
interface LeveledIdentifier {
    /** Concept level of the representation. */
    readonly level: CommitmentLevel;

    /** Validated identifier text. */
    readonly identifier: string;

    /** Root-relative source path. */
    readonly path: string;
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


/** Build one blocking graph failure with its finding. */
function graphFailure(diagnostic: Diagnostic): Error {
    // Return the failure carrying the blocking finding.
    return createFailure("graph_error", diagnostic.message, [diagnostic]);
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


/**
 * Build one graph snapshot from saved canonical inputs.
 *
 * Each stage fills the collections it owns, so a reader can follow the
 * pipeline from duplicate rejection to membership without tracking a long
 * list of local variables inside one method.
 */
export class GraphBuilder {
    /** Canonical inputs in code-point path order. */
    private readonly ordered: readonly CanonicalInput[];

    /** Every established area identifier. */
    private readonly areaValues: Set<string> = new Set<string>();

    /** Project references grouped by program and declaring area. */
    private readonly programProjectGroups: Map<string, Map<string, ProjectInput[]>> = new Map<
        string,
        Map<string, ProjectInput[]>
    >();

    /** Unique canonical program containers by identifier. */
    private readonly programContainers: Map<string, ProgramInput> = new Map<string, ProgramInput>();

    /** Validated area of every declared program. */
    private readonly programAreas: Map<string, string> = new Map<string, string>();

    /** Coordinated project identifiers of every declared program. */
    private readonly programProjects: Map<string, readonly string[]> = new Map<
        string,
        readonly string[]
    >();

    /** Identifiers of every declared program. */
    private readonly programIdentifiers: Set<string> = new Set<string>();

    /** Direct project identifiers by area. */
    private readonly directProjects: Map<string, string[]> = new Map<string, string[]>();

    /** Structural inputs read from the canonical documents. */
    private readonly inputs: CanonicalInputs;

    /** Construct the builder for one input list. */
    constructor(inputs: readonly CanonicalInput[]) {
        // Sort the canonical inputs by portable path for deterministic findings.
        this.ordered = [...inputs].sort(
            (left: CanonicalInput, right: CanonicalInput): number =>
                compareCodePoints(left.path, right.path),
        );

        // Read and classify the canonical inputs in path order.
        this.inputs = CanonicalInputReader.read(this.ordered);
    }

    /** Run every construction stage and return the built graph data. */
    build(): BuiltGraph {
        // Reject duplicate representations before building any node.
        this.rejectDuplicates();

        // Establish every area named by a container, anchor, or relationship.
        this.establishAreas();

        // Validate every referenced or container-declared program.
        this.resolvePrograms();

        // Assemble the area snapshots and membership indexes.
        return this.assemble();
    }

    /** Reject two containers that represent the same typed identifier. */
    private rejectDuplicates(): void {
        // List every typed representation for duplicate detection.
        const representations: LeveledIdentifier[] = [
            ...this.inputs.areas.map(
                (input: AreaInput): LeveledIdentifier => ({
                    level: "area",
                    identifier: input.id,
                    path: input.path,
                }),
            ),
            ...this.inputs.programs.map(
                (input: ProgramInput): LeveledIdentifier => ({
                    level: "program",
                    identifier: input.id,
                    path: input.path,
                }),
            ),
            ...this.inputs.projects.map(
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
    }

    /** Establish every area named by a container, support anchor, or project. */
    private establishAreas(): void {
        // Add the area established by each canonical container.
        for (const input of this.inputs.areas) {
            // Add the container's area.
            this.areaValues.add(input.id);
        }

        // Add the area established by each area-level support anchor.
        for (const area of this.inputs.supportAreas) {
            // Add the anchored area.
            this.areaValues.add(area);
        }

        // Add each program container's area.
        for (const input of this.inputs.programs) {
            // Add the program's area.
            this.areaValues.add(input.area);
        }

        // Add each project's area.
        for (const input of this.inputs.projects) {
            // Add the project's area.
            this.areaValues.add(input.area);
        }

        // Group project references by program and declaring area.
        for (const project of this.inputs.projects) {
            // Skip projects with no program relationship.
            if (project.program === null) {
                // Continue with the next project.
                continue;
            }

            // Read or start the program's area groups.
            let groups: Map<string, ProjectInput[]> | undefined = this.programProjectGroups.get(
                project.program,
            );
            if (groups === undefined) {
                // Create the program group map.
                groups = new Map<string, ProjectInput[]>();
                this.programProjectGroups.set(project.program, groups);
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
        for (const input of this.inputs.programs) {
            // Record the container under its validated identifier.
            this.programContainers.set(input.id, input);
        }
    }

    /** Validate every referenced or container-declared program. */
    private resolvePrograms(): void {
        // Read the programs declared by a container or a project reference.
        const declaredPrograms: readonly string[] = uniqueSorted([
            ...this.programContainers.keys(),
            ...this.programProjectGroups.keys(),
        ]);

        // Validate each program in identifier order.
        for (const program of declaredPrograms) {
            // Read the optional container and the project area groups.
            const container: ProgramInput | undefined = this.programContainers.get(program);
            const groups: Map<string, ProjectInput[]> =
                this.programProjectGroups.get(program) ?? new Map<string, ProjectInput[]>();

            // Read the declared areas and source paths of the program.
            const declared: readonly string[] = this.declaredAreas(container, groups);
            const sourcePaths: readonly string[] = this.programSourcePaths(container, groups);

            // Read the project count in the single declared area.
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
                    this.inputs.diagnostics.push(finding);
                } else {
                    // Raise the graph error from the blocking finding.
                    throw graphFailure(finding);
                }
            }

            // Use the single validated area and its coordinated projects.
            const area: string = declared[0] ?? "";
            const projects: readonly ProjectInput[] = groups.get(area) ?? [];

            // Store the validated program area and coordinated project list.
            this.programAreas.set(program, area);
            this.programProjects.set(
                program,
                projects.map((project: ProjectInput): string => project.id),
            );
            this.programIdentifiers.add(program);
        }
    }

    /** Read every area declared for one program. */
    private declaredAreas(
        container: ProgramInput | undefined,
        groups: ReadonlyMap<string, readonly ProjectInput[]>,
    ): readonly string[] {
        // Collect every area declared by a project or the container.
        const declaredAreas: Set<string> = new Set<string>(groups.keys());
        if (container !== undefined) {
            // Add the program container's declared area.
            declaredAreas.add(container.area);
        }

        // Return the declared areas in insertion order.
        return [...declaredAreas];
    }

    /** Read every source path that defines one program. */
    private programSourcePaths(
        container: ProgramInput | undefined,
        groups: ReadonlyMap<string, readonly ProjectInput[]>,
    ): readonly string[] {
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

        // Return the collected paths.
        return sourcePaths;
    }

    /** Assemble the area snapshots, membership sets, and container index. */
    private assemble(): BuiltGraph {
        // Group direct projects under their established areas.
        for (const area of this.areaValues) {
            // Start an empty direct project list for each area.
            this.directProjects.set(area, []);
        }

        // Add projects with no program relationship to their area's direct list.
        for (const project of this.inputs.projects) {
            // Skip projects coordinated by a program.
            if (project.program !== null) {
                // Continue with the next project.
                continue;
            }

            // Read or start the direct project list for the project area.
            const projects: string[] | undefined = this.directProjects.get(project.area);
            if (projects === undefined) {
                // Start the area's direct project list.
                this.directProjects.set(project.area, [project.id]);
                continue;
            }

            // Append the direct project.
            projects.push(project.id);
        }

        // Build the sorted area snapshots from every established area.
        const areas: readonly GraphArea[] = [...this.areaValues]
            .sort(compareCodePoints)
            .map(
                (area: string): GraphArea =>
                    buildArea(area, this.directProjects, this.programAreas, this.programProjects),
            );

        // Return the assembled graph data for the snapshot.
        return {
            areas,
            members: this.members(areas),
            containerPaths: this.containerPaths(),
            pendingSupports: this.inputs.pendingSupports,
            diagnostics: this.inputs.diagnostics,
        };
    }

    /** Build the typed membership sets from the assembled areas. */
    private members(areas: readonly GraphArea[]): Readonly<Record<CommitmentLevel, ReadonlySet<string>>> {
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

        // Return the membership set for each concept level.
        return {
            area: this.areaValues,
            program: this.programIdentifiers,
            project: projectIdentifiers,
        };
    }

    /** Index the explicit container source paths for file actions. */
    private containerPaths(): Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>> {
        // Start one empty source index per concept level.
        const containerPaths: Record<CommitmentLevel, Map<string, string>> = {
            area: new Map<string, string>(),
            program: new Map<string, string>(),
            project: new Map<string, string>(),
        };

        // Record each explicit area source path.
        for (const input of this.inputs.areas) {
            // Index the area container path.
            containerPaths.area.set(input.id, input.path);
        }

        // Record each explicit program source path.
        for (const input of this.inputs.programs) {
            // Index the program container path.
            containerPaths.program.set(input.id, input.path);
        }

        // Record each explicit project source path.
        for (const input of this.inputs.projects) {
            // Index the project container path.
            containerPaths.project.set(input.id, input.path);
        }

        // Return the source index by concept level.
        return containerPaths;
    }
}
