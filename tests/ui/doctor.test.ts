import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("obsidian", async () => await import("../stubs/obsidian"));

import { App, Modal, Notice, WorkspaceLeaf } from "obsidian";
import { CONFIG } from "../../src/constants";
import { createDiagnostic } from "../../src/helpers/diagnostics";
import { ModalDoctorPresenter } from "../../src/ui/modal-doctor-presenter";
import { FakeVault } from "../support/fake-vault";


/** Return the most recently opened Doctor modal. */
function currentModal(): Modal {
    // Read the last modal created by the presenter.
    const modal: Modal | undefined = Modal.instances[Modal.instances.length - 1];
    if (modal === undefined) {
        // Fail the test when no modal opened.
        throw new Error("No Doctor modal opened");
    }

    // Return the current modal.
    return modal;
}


beforeEach(() => {
    // Reset the modal and notice registries and the document body.
    Modal.instances = [];
    Notice.instances = [];
    document.body.replaceChildren();
});


afterEach(() => {
    // Restore prototype spies so one test cannot affect the next.
    vi.restoreAllMocks();
});


describe("Doctor presenter", () => {
    it("shows the healthy state without findings", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([]);

        // Require the titled, healthy modal and no source actions.
        expect(currentModal().titleEl.textContent).toBe(CONFIG.DOCTOR_TITLE);
        expect(currentModal().modalEl.classList.contains("commitment-modal")).toBe(true);
        expect(currentModal().modalEl.classList.contains("mod-lg")).toBe(true);
        expect(currentModal().contentEl.querySelector(":scope > .commitment-doctor")).not.toBeNull();
        expect(document.querySelector(".cd-empty")?.textContent).toContain(
            "No issues found.",
        );
        expect(document.querySelector(".cd-summary")).toBeNull();
        expect(document.querySelector(".cd-path")).toBeNull();
    });

    it("groups findings and lists every source path", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic(
                "unresolved_anchor",
                "Support container has no valid `level` or `anchor`. Omitted from graph.",
                ["notes/unanchored.md"],
            ),
            createDiagnostic(
                "underfilled_program",
                "Program `phd` in area `work` has 1 project. 2 or more expected.",
                ["programs/phd.md", "projects/alpha.md"],
            ),
        ]);

        // Require the issue and file totals.
        expect(document.querySelector(".cd-summary")?.textContent).toBe(
            "2 issues in 3 files.",
        );

        // Require deterministic groups with their counts.
        const groups: readonly (string | null)[] = Array.from(
            document.querySelectorAll(".cd-group__title"),
            (element: Element): string | null => element.textContent,
        );
        expect(groups).toEqual([
            "Unresolved anchors 1",
            "Underfilled programs 1",
        ]);

        // Require the shared scroll region.
        expect(
            document.querySelector(".cd-list")?.classList.contains("commitment-modal__scroll"),
        ).toBe(true);

        // Require every path as a labeled file action.
        const actions: readonly (string | null)[] = Array.from(
            document.querySelectorAll(".cd-path"),
            (element: Element): string | null => element.getAttribute("aria-label"),
        );
        expect(actions).toEqual([
            "Open notes/unanchored.md",
            "Open programs/phd.md",
            "Open projects/alpha.md",
        ]);
    });

    it("counts unique files and orders paths deterministically", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic(
                "unresolved_anchor",
                "Support container has a repeated path.",
                ["b.md", "a.md", "b.md"],
            ),
        ]);

        // Require the deduplicated file total and ordered actions.
        expect(document.querySelector(".cd-summary")?.textContent).toBe(
            "1 issue in 2 files.",
        );
        const actions: readonly (string | null)[] = Array.from(
            document.querySelectorAll(".cd-path"),
            (element: Element): string | null => element.getAttribute("aria-label"),
        );
        expect(actions).toEqual(["Open a.md", "Open b.md"]);
    });

    it("uses the singular issue and file nouns", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic("unresolved_anchor", "One issue.", ["a.md", "b.md"]),
        ]);

        expect(document.querySelector(".cd-summary")?.textContent).toBe(
            "1 issue in 2 files.",
        );

        // Render multiple findings in one file from the same presenter.
        presenter.show([
            createDiagnostic("unresolved_anchor", "First.", ["a.md"]),
            createDiagnostic("unresolved_anchor", "Second.", ["a.md"]),
        ]);

        expect(document.querySelector(".cd-summary")?.textContent).toBe(
            "2 issues in 1 file.",
        );
    });

    it("reports findings without paths without a file count", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([createDiagnostic("unresolved_anchor", "No path.", [])]);

        expect(document.querySelector(".cd-summary")?.textContent).toBe("1 issue.");
        expect(document.querySelector(".cd-path")).toBeNull();
    });

    it("renders messages and paths as text only", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic(
                "unresolved_anchor",
                "Support <b>markup</b> stays text.",
                ["<img src=x>.md"],
            ),
        ]);

        // Require no injected elements.
        expect(document.querySelector("b")).toBeNull();
        expect(document.querySelector("img")).toBeNull();
        expect(document.body.textContent).toContain("Support <b>markup</b> stays text.");
        expect(document.querySelector(".cd-path")?.textContent).toContain(
            "<img src=x>.md",
        );
    });

    it("opens a source file and closes the modal", async () => {
        // Create an in-memory vault with the diagnostic source.
        const vault: FakeVault = new FakeVault({ "notes/unanchored.md": "# Note\n" });
        const app: App = new App(vault);
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic(
                "unresolved_anchor",
                "Support container has no valid `level` or `anchor`.",
                ["notes/unanchored.md"],
            ),
        ]);
        const modal: Modal = currentModal();

        // Activate the source path.
        (document.querySelector(".cd-path") as HTMLButtonElement).click();
        await vi.waitFor(() => {
            // Require the modal to close after the open settles.
            expect(modal.closed).toBe(true);
        });

        // Require the source file to open and no failure notice.
        expect(app.workspace.opened.map((file) => file.path)).toEqual([
            "notes/unanchored.md",
        ]);
        expect(Notice.instances).toEqual([]);
    });

    it("reports a missing source and keeps the modal open", async () => {
        // Create an empty vault and the presenter.
        const app: App = new App(new FakeVault());
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic("unresolved_anchor", "Missing source.", ["notes/missing.md"]),
        ]);
        const modal: Modal = currentModal();

        // Activate the vanished source.
        (document.querySelector(".cd-path") as HTMLButtonElement).click();
        await vi.waitFor(() => {
            // Require one path-specific failure notice.
            expect(Notice.instances).toHaveLength(1);
        });

        // Require the failure to name the path and keep the modal open.
        expect(Notice.instances[0]?.message).toBe(
            "Cannot open `notes/missing.md`, file is missing.",
        );
        expect(modal.closed).toBe(false);
        expect(app.workspace.opened).toEqual([]);
    });

    it("reports a folder source and keeps the modal open", async () => {
        // Create a vault whose path is a folder.
        const vault: FakeVault = new FakeVault({ "notes/child.md": "# Child\n" });
        const app: App = new App(vault);
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic("unresolved_anchor", "Folder source.", ["notes"]),
        ]);
        const modal: Modal = currentModal();

        // Activate the folder path.
        (document.querySelector(".cd-path") as HTMLButtonElement).click();
        await vi.waitFor(() => {
            // Require one source-shape failure notice.
            expect(Notice.instances).toHaveLength(1);
        });

        // Require the failure reason and the open modal.
        expect(Notice.instances[0]?.message).toBe(
            "Cannot open `notes`, not a file.",
        );
        expect(modal.closed).toBe(false);
        expect(app.workspace.opened).toEqual([]);
    });

    it("reports an open failure and releases the guard", async () => {
        // Create two in-memory sources and the presenter.
        const vault: FakeVault = new FakeVault({
            "notes/first.md": "# First\n",
            "notes/second.md": "# Second\n",
        });
        const app: App = new App(vault);
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic(
                "unresolved_anchor",
                "Open failure.",
                ["notes/first.md", "notes/second.md"],
            ),
        ]);
        const modal: Modal = currentModal();

        // Let every open fail after the guard is acquired.
        const open: MockInstance = vi
            .spyOn(WorkspaceLeaf.prototype, "openFile")
            .mockRejectedValue(new Error("locked"));

        // Activate the first source.
        const paths: readonly HTMLButtonElement[] = Array.from(
            document.querySelectorAll(".cd-path"),
            (element: Element): HTMLButtonElement => element as HTMLButtonElement,
        );
        paths[0]?.click();
        await vi.waitFor(() => {
            // Require one path-specific failure notice.
            expect(Notice.instances).toHaveLength(1);
        });

        // Require the failure message and the open modal.
        expect(Notice.instances[0]?.message).toBe("Cannot open `notes/first.md`, locked");
        expect(modal.closed).toBe(false);

        // Activate the second source after the first failure released the guard.
        paths[1]?.click();
        await vi.waitFor(() => {
            // Require the second failure to produce its notice.
            expect(Notice.instances).toHaveLength(2);
        });

        // Require both opens and the still-open modal.
        expect(open).toHaveBeenCalledTimes(2);
        expect(Notice.instances[1]?.message).toBe("Cannot open `notes/second.md`, locked");
        expect(modal.closed).toBe(false);
    });

    it("guards one source open at a time", async () => {
        // Create an in-memory vault with the diagnostic source.
        const vault: FakeVault = new FakeVault({ "notes/unanchored.md": "# Note\n" });
        const app: App = new App(vault);
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([
            createDiagnostic("unresolved_anchor", "Pending source.", ["notes/unanchored.md"]),
        ]);
        const modal: Modal = currentModal();

        // Let the open settle after the synchronous double activation.
        const open: MockInstance = vi
            .spyOn(WorkspaceLeaf.prototype, "openFile")
            .mockResolvedValue();

        // Activate the path twice before the first open settles.
        const button: HTMLButtonElement = document.querySelector(".cd-path") as HTMLButtonElement;
        button.click();
        button.click();

        // Require the second activation to be ignored.
        expect(open).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => {
            // Require the successful open to close the modal.
            expect(modal.closed).toBe(true);
        });
    });

    it("keeps one Doctor modal open at a time", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        // Present findings twice.
        presenter.show([createDiagnostic("unresolved_anchor", "First.", [])]);
        const first: Modal = currentModal();
        presenter.show([createDiagnostic("unresolved_anchor", "Second.", [])]);
        const second: Modal = currentModal();

        // Require the older modal to close and the newer one to stay open.
        expect(first.closed).toBe(true);
        expect(second.closed).toBe(false);
    });

    it("releases the rendered content when the modal closes", () => {
        // Create the stub app and presenter.
        const app: App = new App();
        const presenter: ModalDoctorPresenter = new ModalDoctorPresenter(app);

        presenter.show([createDiagnostic("unresolved_anchor", "Rendered.", [])]);
        const modal: Modal = currentModal();
        expect(modal.contentEl.querySelector(".cd-list")).not.toBeNull();

        // Close the modal and require its content to be released.
        modal.close();
        expect(modal.contentEl.children).toHaveLength(0);
    });

    it("keeps the issue list and path targets usable on narrow screens", () => {
        // Read the shipped stylesheet.
        const styles: string = readFileSync("assets/styles.css", "utf8");

        // The shared scroll region scrolls inside the modal.
        expect(styles).toMatch(
            /\.commitment-modal__scroll\s*{[^}]*overflow-y:\s*auto;/s,
        );
        // Long paths wrap instead of overflowing.
        expect(styles).toMatch(
            /\.commitment-doctor \.cd-path\s*{[^}]*overflow-wrap:\s*anywhere;/s,
        );
        // The shared shell owns the fixed bottom inset outside the scrollport.
        expect(styles).toMatch(
            /\.modal\.commitment-modal\s*{[^}]*--commitment-modal-bottom-inset:\s*20px;/s,
        );
        expect(styles).toMatch(
            /\.modal\.commitment-modal\s*{[^}]*padding-bottom:\s*0;/s,
        );
        expect(styles).toMatch(
            /\.commitment-modal__body\s*{[^}]*padding-bottom:\s*max\(\s*var\(--commitment-modal-bottom-inset\),\s*var\(--safe-area-inset-bottom,\s*0px\)\s*\);/s,
        );
        // The Doctor list must not impose its own scroll height or end gap.
        const doctorStyles: string = styles.slice(
            styles.indexOf("/* Doctor diagnostics. */"),
        );
        const listRule: string = doctorStyles.match(
            /\.commitment-doctor \.cd-list\s*{([^}]*)}/s,
        )?.[1] ?? "";
        expect(listRule).not.toContain("max-height");
        expect(listRule).not.toContain("padding-bottom");
        // Narrow screens give every path a touch-sized target.
        expect(doctorStyles).toMatch(
            /@media \(max-width: 560px\)[\s\S]*?\.commitment-doctor \.cd-path\s*{[^}]*min-height:\s*40px;/s,
        );
    });
});
