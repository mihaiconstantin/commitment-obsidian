/**
 * Obsidian modal that presents nonblocking commitment diagnostics.
 *
 * The modal groups findings by their stable code, makes every source path a
 * file action, and closes after a successful open so the user can fix the file
 * and rerun the Doctor command.
 */

import { Notice, setIcon, type App } from "obsidian";

import { CONFIG } from "../constants";
import { VaultFileOpener, type VaultFileOpenResult } from "../containers/vault-file-opener";
import type { Diagnostic, DiagnosticCode } from "../graph/types";
import { uniqueSorted } from "../helpers/collections";
import { countLabel } from "../helpers/strings";
import { describeFailure } from "../helpers/utils";
import { CommitmentModal } from "./commitment-modal";


/** Readable group labels for every diagnostic code. */
const GROUP_LABELS: Readonly<Record<DiagnosticCode, string>> = {
    unresolved_anchor: "Unresolved anchors",
    underfilled_program: "Underfilled programs",
};


/** Modal showing the nonblocking findings from one graph build. */
export class DoctorModal extends CommitmentModal {
    /** Findings shown by this modal. */
    private readonly diagnostics: readonly Diagnostic[];

    /** Called after the modal released its content, or null when unused. */
    private readonly released: (() => void) | null;

    /** Shared policy for resolving and opening a source path. */
    private readonly opener: VaultFileOpener;

    /** Keep the base modal from focusing its first input when opened. */
    public hasInitialInputFocus: boolean = false;

    /** Whether one source file is already opening. */
    private opening = false;

    /** Render the summary and the grouped findings. */
    private renderDiagnostics(content: HTMLElement): void {
        // Count the distinct source files across every finding.
        const files: readonly string[] = uniqueSorted(
            this.diagnostics.flatMap((diagnostic: Diagnostic): readonly string[] =>
                diagnostic.paths,
            ),
        );

        // Render the issue and file totals.
        const issues: string = countLabel(this.diagnostics.length, "issue");
        const summary: string = files.length === 0
            ? `${issues}.`
            : `${issues} in ${countLabel(files.length, "file")}.`;
        content.createEl("p", { cls: "cd-summary", text: summary });

        // Start the scrolling list of finding groups.
        const list: HTMLElement = content.createDiv({
            cls: "cd-list commitment-modal__scroll",
        });

        // Group findings by their stable code in first-appearance order.
        const groups: Map<DiagnosticCode, Diagnostic[]> = new Map<DiagnosticCode, Diagnostic[]>();
        for (const diagnostic of this.diagnostics) {
            // Read the existing group.
            const entries: Diagnostic[] | undefined = groups.get(diagnostic.code);

            // Start a group on its first finding.
            if (entries === undefined) {
                // Record the first finding under its code.
                groups.set(diagnostic.code, [diagnostic]);
                continue;
            }

            // Append the finding to its existing group.
            entries.push(diagnostic);
        }

        // Render every group and its cards.
        for (const [code, entries] of groups) {
            // Add the group heading and its count.
            const section: HTMLElement = list.createEl("section", { cls: "cd-group" });
            const heading: HTMLElement = section.createEl("h3", { cls: "cd-group__title" });
            heading.append(
                document.createTextNode(GROUP_LABELS[code]),
                document.createTextNode(" "),
            );
            heading.createEl("span", {
                cls: "cd-group__count",
                text: String(entries.length),
            });

            // Render one card per finding.
            for (const diagnostic of entries) {
                // Render the finding message as text.
                const card: HTMLElement = section.createDiv({ cls: "cd-issue" });
                card.createEl("p", {
                    cls: "cd-issue__message",
                    text: diagnostic.message,
                });

                // Deduplicate and order every source path.
                const paths: readonly string[] = uniqueSorted(diagnostic.paths);

                // Leave a finding without paths as a message-only card.
                if (paths.length === 0) {
                    // Continue with the next finding.
                    continue;
                }

                // Render the source label and its path actions.
                const pathRow: HTMLElement = card.createDiv({ cls: "cd-paths" });
                pathRow.createEl("span", {
                    cls: "cd-paths__label",
                    text: paths.length === 1 ? "Source" : "Sources",
                });
                const actions: HTMLElement = pathRow.createDiv({ cls: "cd-paths__actions" });
                for (const path of paths) {
                    // Add one file action for the path.
                    actions.append(this.pathButton(path));
                }
            }
        }
    }

    /** Render the healthy state when the build reported no findings. */
    private renderEmpty(content: HTMLElement): void {
        // Add the healthy message.
        const empty: HTMLElement = content.createDiv({ cls: "cd-empty" });
        empty.createEl("h3", { text: "No issues found." });
        empty.createEl("p", { text: "The commitment graph is healthy." });
    }

    /** Build one source path action with its file icon. */
    private pathButton(path: string): HTMLButtonElement {
        // Create a native button so keyboard and focus behavior stay standard.
        const button: HTMLButtonElement = document.createElement("button");
        button.type = "button";
        button.className = "cd-path";
        button.setAttribute("aria-label", `Open ${path}`);
        button.title = `Open ${path}`;

        // Add the file icon.
        const icon: HTMLElement = document.createElement("span");
        icon.className = "cd-path__icon";
        setIcon(icon, "file-text");
        button.append(icon, document.createTextNode(path));

        // Open the path through the guarded action.
        button.addEventListener("click", (): void => {
            // Start the guarded source open.
            void this.openPath(path);
        });

        // Return the completed action.
        return button;
    }

    /** Open one source path and close the modal when it succeeds. */
    private async openPath(path: string): Promise<void> {
        // Ignore repeated activation while one open is pending.
        if (this.opening) {
            // Keep the current modal state.
            return;
        }

        // Acquire the single in-flight guard.
        this.opening = true;
        try {
            // Resolve and open the source through the shared policy.
            const result: VaultFileOpenResult = await this.opener.open(path);
            if (result === "missing") {
                // Report the vanished source and keep the modal open.
                new Notice(`Cannot open \`${path}\`, file is missing.`);
                return;
            }

            // Reject a folder that occupies the source path.
            if (result === "not-file") {
                // Report the unsupported source shape and keep the modal open.
                new Notice(`Cannot open \`${path}\`, not a file.`);
                return;
            }

            // Close the modal only after the file opened.
            this.close();
        } catch (error) {
            // Report exactly one path-specific failure and keep the modal open.
            new Notice(`Cannot open \`${path}\`, ${describeFailure(error)}`);
        } finally {
            // Release the in-flight guard.
            this.opening = false;
        }
    }

    /** Construct the modal without touching the DOM. */
    public constructor(app: App, diagnostics: readonly Diagnostic[], released: (() => void) | null = null) {
        // Initialize the Obsidian modal and retain its inputs.
        super(app);
        this.diagnostics = diagnostics;
        this.released = released;

        // Create the shared opener for source paths.
        this.opener = new VaultFileOpener(app);
    }

    /** Build the modal body when Obsidian opens it. */
    public override onOpen(): void {
        // Apply the shared title, shell, and phone sizing classes.
        this.configureCommitmentModal(CONFIG.DOCTOR_TITLE, "commitment-doctor-modal");

        // Read the modal content and replace any previous body.
        const content: HTMLElement = this.contentEl;
        content.empty();

        // Create the body column for the Doctor layout.
        const body: HTMLElement = content.createDiv({
            cls: "commitment-doctor commitment-modal__body",
        });

        // Render the healthy state or the grouped findings.
        if (this.diagnostics.length === 0) {
            // Show the healthy state.
            this.renderEmpty(body);
            return;
        }

        // Show the summary and findings.
        this.renderDiagnostics(body);
    }

    /** Release the rendered content when Obsidian closes the modal. */
    public override onClose(): void {
        // Release the rendered content so a closed modal retains no rows.
        this.contentEl.empty();

        // Notify the owner so it can drop its reference to this modal.
        this.released?.();
    }
}
