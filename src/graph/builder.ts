/**
 * Derive and validate the canonical commitment graph from saved frontmatter.
 *
 * Construction normalizes every sorted input in one scan, rejects duplicate
 * containers, resolves programs from the collected references, and projects the
 * area snapshots. The normalized read model stays available for later analysis.
 */

import type { CanonicalField } from "../frontmatter/canonical-field";
import { appendGrouped, uniqueSorted } from "../helpers/collections";
import { compareText, isValidIdentifier } from "../helpers/strings";
import { CommitmentGraph } from "./commitment-graph";
import type {
    AreaEntry,
    DuplicateContainers,
    IdentifiedEntry,
    NormalizedInputs,
    ProgramEntry,
    ProjectEntry,
    ResolvedProgram,
    SupportAssociation,
    SupportEntry,
} from "./model";
import { isProjectState, type ProjectState } from "./project-state";
import type {
    CanonicalInput,
    CommitmentKind,
    CommitmentLevel,
    GraphArea,
    GraphProgram,
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


/** One optional state field with its presence. */
interface StateField {
    /** Whether the container declared a state field. */
    readonly present: boolean;

    /** Recognized state, or null when absent or invalid. */
    readonly state: ProjectState | null;
}


/** One optional area active field with its presence. */
interface ActiveField {
    /** Whether the container declared an active field. */
    readonly present: boolean;

    /** Recognized boolean, or null when absent or invalid. */
    readonly active: boolean | null;
}


/** A graph snapshot and the read model from the same construction pass. */
export interface GraphBuild {
    /** Immutable graph snapshot. */
    readonly graph: CommitmentGraph;

    /** Normalized local data used to build the graph. */
    readonly normalized: NormalizedInputs;

    /** Validated programs used to build the graph. */
    readonly programs: readonly ResolvedProgram[];
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

    /** Return one commitment kind with its first letter capitalized. */
    private kindLabel(kind: CommitmentKind): string {
        // Capitalize the kind for the start of an error message.
        return kind.charAt(0).toUpperCase() + kind.slice(1);
    }

    /** Throw when an identifier is absent or invalid for a required field. */
    private requiredIdentifier(input: CanonicalInput, field: CanonicalField, kind: CommitmentKind): string {
        // Reject an absent required field.
        if (!input.frontmatter.has(field)) {
            // Report the missing field with its source path.
            throw new Error(
                `${this.kindLabel(kind)} \`${input.path}\` is missing \`${field}\`.`,
            );
        }

        // Read the supplied value without changing it.
        const value: unknown = input.frontmatter.get(field);

        // Reject a present value that is not a valid identifier.
        if (!isValidIdentifier(value)) {
            // Report the invalid field with its source path.
            throw new Error(
                `${this.kindLabel(kind)} \`${input.path}\` has invalid \`${field}\`.`,
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
        if (!isValidIdentifier(value)) {
            // Report the invalid optional relationship.
            throw new Error(`Project \`${input.path}\` has invalid \`program\`.`);
        }

        // Return the validated program identifier.
        return value;
    }

    /** Read one optional project or program state with its presence. */
    private commitmentState(input: CanonicalInput): StateField {
        // Record whether the state field exists.
        const present: boolean = input.frontmatter.has("state");

        // Read the raw value without normalization.
        const value: unknown = input.frontmatter.get("state");

        // Accept only one exact recognized state.
        return { present, state: isProjectState(value) ? value : null };
    }

    /** Read one optional area active flag with its presence. */
    private areaActive(input: CanonicalInput): ActiveField {
        // Record whether the active field exists.
        const present: boolean = input.frontmatter.has("active");

        // Read the raw value without normalization.
        const value: unknown = input.frontmatter.get("active");

        // Accept only a real boolean.
        return { present, active: typeof value === "boolean" ? value : null };
    }

    /** Read one support association from its exact dependent fields. */
    private supportAssociation(input: CanonicalInput): SupportAssociation | null {
        // Read the dependent level and anchor fields as exact text.
        const level: string | null = this.textField(input, "level");
        const anchor: string | null = this.textField(input, "anchor");

        // Reject a missing or malformed level or anchor.
        if (level === null || anchor === null || SUPPORT_LEVELS[level] !== true) {
            // Report no valid association.
            return null;
        }

        // Reject an invalid anchored identifier.
        if (!isValidIdentifier(anchor)) {
            // Report no valid association.
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
        const supports: SupportEntry[] = [];

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

            // Skip a document without a canonical kind.
            if (kind === null) {
                // Continue with the next input.
                continue;
            }

            // Group a canonical area container's required identity.
            if (kind === "area") {
                // Read the optional active field with its presence.
                const active: ActiveField = this.areaActive(input);

                // Require a valid typed area identifier.
                const entry: AreaEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                    active: active.active,
                    activePresent: active.present,
                };

                // Establish the area container identifier.
                areaIds.add(entry.id);

                // Insert the area container and record a duplicate representation.
                this.insertContainer(areas, duplicates.area, entry);
                continue;
            }

            // Group a canonical program container's required identity and area.
            if (kind === "program") {
                // Read the optional state field with its presence.
                const state: StateField = this.commitmentState(input);

                // Require valid program identity and area references.
                const entry: ProgramEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                    area: this.requiredIdentifier(input, "area", kind),
                    state: state.state,
                    statePresent: state.present,
                };

                // Establish the area declared by the program container.
                areaIds.add(entry.area);

                // Insert the program container and record a duplicate representation.
                this.insertContainer(programs, duplicates.program, entry);
                continue;
            }

            // Group a canonical project's identity, area, and optional program.
            if (kind === "project") {
                // Read the optional state field with its presence.
                const state: StateField = this.commitmentState(input);

                // Require valid project identity and area references.
                const entry: ProjectEntry = {
                    path: input.path,
                    id: this.requiredIdentifier(input, "id", kind),
                    area: this.requiredIdentifier(input, "area", kind),
                    program: this.optionalProjectProgram(input),
                    state: state.state,
                    statePresent: state.present,
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

                // Create the group map when the program is new.
                if (groups === undefined) {
                    // Create the program group map.
                    groups = new Map<string, ProjectEntry[]>();
                    programProjects.set(entry.program, groups);
                }

                // Read or start the area's project list.
                let coordinated: ProjectEntry[] | undefined = groups.get(entry.area);

                // Create the project list when the area is new.
                if (coordinated === undefined) {
                    // Create the area project list.
                    coordinated = [];
                    groups.set(entry.area, coordinated);
                }

                // Add the project under its program and area.
                coordinated.push(entry);
                continue;
            }

            // Read the support association and optional state.
            const association: SupportAssociation | null = this.supportAssociation(input);
            const state: StateField = this.commitmentState(input);

            // Record every support container for diagnostic checks.
            const support: SupportEntry = {
                path: input.path,
                kind,
                association,
                state: state.state,
                statePresent: state.present,
            };
            supports.push(support);

            // Skip a support container with no valid level or anchor.
            if (association === null) {
                // Continue with the next input.
                continue;
            }

            // Establish an explicit area-level support anchor directly.
            if (association.level === "area") {
                // Add the referenced area without inventing a graph node.
                areaIds.add(association.identifier);
                continue;
            }
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
            supports,
            duplicate,
        };
    }

    /** Insert one container and record a duplicate when another source path exists. */
    private insertContainer<Entry extends IdentifiedEntry>(groups: Map<string, Entry[]>, duplicates: Set<string>, entry: Entry): void {
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
    private firstDuplicate<Entry extends IdentifiedEntry>(level: CommitmentLevel, groups: ReadonlyMap<string, readonly Entry[]>, identifiers: ReadonlySet<string>): DuplicateContainers | null {
        // Order the duplicated identifiers by code unit.
        const ordered: readonly string[] = [...identifiers].sort(
            (left: string, right: string): number => compareText(left, right),
        );

        // Read the first duplicated identifier.
        const identifier: string | undefined = ordered[0];

        // Stop when no identifier is duplicated.
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
            .map((path: string): string => `\`${path}\``)
            .join(", ");

        // Build the message with the concept level, identifier, and sources.
        return new Error(
            `Duplicate ${duplicate.level} \`${duplicate.identifier}\` at ${rendered}.`,
        );
    }

    /** Validate every program declared by a container or project reference. */
    private resolvePrograms(normalized: NormalizedInputs): readonly ResolvedProgram[] {
        // Read the programs declared by a container or a project reference.
        const identifiers: readonly string[] = uniqueSorted([
            ...normalized.programs.keys(),
            ...normalized.programProjects.keys(),
        ]);

        // Start the validated programs.
        const programs: ResolvedProgram[] = [];

        // Validate each program in identifier order.
        for (const identifier of identifiers) {
            // Read the first container and the project area groups.
            const container: ProgramEntry | undefined = normalized.programs.get(identifier)?.[0];
            const groups: Map<string, ProjectEntry[]> =
                normalized.programProjects.get(identifier) ?? new Map<string, ProjectEntry[]>();

            // Collect every area declared for the program.
            const declaredAreas: Set<string> = new Set<string>(groups.keys());

            // If the program has a container, include its declared area.
            if (container !== undefined) {
                // Add the program container's declared area.
                declaredAreas.add(container.area);
            }

            // Read the stable area declarations.
            const stableAreas: readonly string[] = uniqueSorted(declaredAreas);

            // Reject contradictory area declarations instead of selecting a winner.
            if (stableAreas.length > 1) {
                // Render the readable area list.
                const rendered: string = stableAreas
                    .map((area: string): string => `\`${area}\``)
                    .join(", ");
                const message: string = `Program \`${identifier}\` has conflicting areas ${rendered}.`;

                // Raise the blocking structural error directly.
                throw new Error(message);
            }

            // Collect every source path that defines the program.
            const sourcePaths: string[] = [];

            // If the program has a container.
            if (container !== undefined) {
                // Include the program container path.
                sourcePaths.push(container.path);
            }

            // For each group of projects.
            for (const projects of groups.values()) {
                // Include each project path that names the program.
                sourcePaths.push(...projects.map((project: ProjectEntry): string => project.path));
            }

            // Read the single validated area and its coordinated projects.
            const area: string = stableAreas[0] ?? "";
            const coordinated: readonly ProjectEntry[] = groups.get(area) ?? [];

            // Store the validated program with its state and coordinated project identifiers.
            programs.push({
                id: identifier,
                area,
                state: container?.state ?? null,
                projects: coordinated.map((project: ProjectEntry): string => project.id),
                containerPath: container?.path ?? null,
                paths: uniqueSorted(sourcePaths),
            });
        }

        // Return the validated programs.
        return programs;
    }

    /** Build one sorted area snapshot from the normalized local data. */
    private buildArea(area: string, projects: ReadonlyMap<string, readonly ProjectEntry[]>, programs: readonly ResolvedProgram[], areas: ReadonlyMap<string, readonly AreaEntry[]>): GraphArea {
        // Read the explicit area relevance, or null for an implicit area.
        const active: boolean | null = areas.get(area)?.[0]?.active ?? null;

        // Start the direct project list and the state index.
        const directProjects: string[] = [];
        const projectStates: Map<string, ProjectState> = new Map<string, ProjectState>();

        // Visit every project container.
        for (const entries of projects.values()) {
            // Read every container for this project identifier.
            for (const project of entries) {
                // Index every recognized state in this area, direct or coordinated.
                if (project.area === area && project.state !== null) {
                    // Record the project state.
                    projectStates.set(project.id, project.state);
                }

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

        // Start the area's program list.
        const areaPrograms: GraphProgram[] = [];

        // Collect the programs declared under the area.
        for (const program of programs) {
            // Skip a program declared under another area.
            if (program.area !== area) {
                // Continue with the next program.
                continue;
            }

            // Add the program with its state and sorted project identifiers.
            areaPrograms.push({
                id: program.id,
                state: program.state,
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
        return { id: area, active, projects: directProjects, programs: areaPrograms, projectStates };
    }

    /** Index the first explicit container source path per concept level. */
    private containerPaths(normalized: NormalizedInputs): Readonly<Record<CommitmentLevel, ReadonlyMap<string, string>>> {
        // Start one empty source index per concept level.
        const paths: Record<CommitmentLevel, Map<string, string>> = {
            area: new Map<string, string>(),
            program: new Map<string, string>(),
            project: new Map<string, string>(),
        };

        // Record the first explicit area source path for each identifier.
        for (const [identifier, entries] of normalized.areas) {
            const entry: AreaEntry | undefined = entries[0];

            // If an explicit area exists, record its path.
            if (entry !== undefined) {
                paths.area.set(identifier, entry.path);
            }
        }

        // Record the first explicit program source path for each identifier.
        for (const [identifier, entries] of normalized.programs) {
            const entry: ProgramEntry | undefined = entries[0];

            // If an explicit program exists, record its path.
            if (entry !== undefined) {
                paths.program.set(identifier, entry.path);
            }
        }

        // Record the first explicit project source path for each identifier.
        for (const [identifier, entries] of normalized.projects) {
            const entry: ProjectEntry | undefined = entries[0];

            // If an explicit project exists, record its path.
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
    public build(): GraphBuild {
        // Scan every sorted input once and collect the normalized local data.
        const normalized: NormalizedInputs = this.normalize();

        // Reject duplicate representations before validating any program.
        if (normalized.duplicate !== null) {
            throw this.duplicateError(normalized.duplicate);
        }

        // Validate every declared program after normalization.
        const programs: readonly ResolvedProgram[] = this.resolvePrograms(normalized);

        // Build the sorted area snapshots from every established area.
        const areas: readonly GraphArea[] = [...normalized.areaIds]
            .sort((left: string, right: string): number => compareText(left, right))
            .map(
                (area: string): GraphArea =>
                    this.buildArea(area, normalized.projects, programs, normalized.areas),
            );

        // Create the immutable snapshot from the graph data alone.
        const graph: CommitmentGraph = new CommitmentGraph(
            areas,
            this.containerPaths(normalized),
        );

        // Return the graph and the read model from the same construction pass.
        return { graph, normalized, programs };
    }
}
