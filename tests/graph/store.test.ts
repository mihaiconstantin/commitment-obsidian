import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("../stubs/obsidian"));

import { CONFIG } from "../../src/constants";
import { VaultGraphStore } from "../../src/graph/store";
import type { CanonicalInput } from "../../src/graph/types";
import { FakeVault } from "../support/fake-vault";


const markdown = (type: string, fields: string): string =>
    `---\ntype: ${type}\n${fields}---\n\nBody.\n`;

describe("vault graph store", () => {
    it("discovers visible markdown extensions case-insensitively", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({
            "top.MD": "Top.\n",
            "nested/deep/page.markdown": "Deep.\n",
            "nested/other.md": "Other.\n",
        });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        // Read the saved inputs.
        const inputs: readonly CanonicalInput[] = await store.readInputs();

        expect(inputs.map((input) => input.path)).toEqual([
            "nested/deep/page.markdown",
            "nested/other.md",
            "top.MD",
        ]);
    });

    it("excludes hidden paths and template directories", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({
            "page.md": "Page.\n",
            "Templates.md": "Ordinary.\n",
            "Templates/project.md": "Template.\n",
            "nested/Templates/meeting.md": "Template.\n",
            ".hidden.md": "Hidden.\n",
            ".hidden/inside.md": "Hidden.\n",
        });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        // Read the saved inputs.
        const inputs: readonly CanonicalInput[] = await store.readInputs();

        expect(inputs.map((input) => input.path)).toEqual([
            "Templates.md",
            "page.md",
        ]);
    });

    it("parses canonical inputs for every saved file", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({
            "projects/alpha.md": markdown("project", "id: alpha\narea: work\nstate: active\n"),
            "notes/plain.md": "Plain body.\n",
        });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        // Read the saved inputs.
        const inputs: readonly CanonicalInput[] = await store.readInputs();

        // Read the parsed project input.
        const project: CanonicalInput | undefined = inputs.find(
            (input) => input.path === "projects/alpha.md",
        );
        // Read the parsed plain input.
        const plain: CanonicalInput | undefined = inputs.find(
            (input: CanonicalInput): boolean => input.path === "notes/plain.md",
        );
        expect(project?.frontmatter.get("id")).toBe("alpha");
        expect(plain?.frontmatter.size).toBe(0);
    });

    it("reports unreadable saved content with its path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ "broken.md": "Body.\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "read").mockRejectedValueOnce(new Error("disk failure"));

        await expect(store.readInputs()).rejects.toThrowError(
            /Cannot read `broken\.md`, disk failure/,
        );
    });

    it("creates a missing destination", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault();
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("written");
        expect(vault.calls.creates).toEqual([CONFIG.GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(CONFIG.GRAPH_PATH))).toBe("{}\n");
    });

    it("leaves identical text untouched", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [CONFIG.GRAPH_PATH]: "{}\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("unchanged");
        expect(vault.calls.processes).toEqual([]);
        expect(vault.calls.creates).toEqual([]);
    });

    it("replaces different derived output", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [CONFIG.GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("written");
        expect(vault.calls.processes).toEqual([CONFIG.GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(CONFIG.GRAPH_PATH))).toBe("{}\n");
    });

    it("rejects a folder at the destination", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault();
        vault.createFolder(CONFIG.GRAPH_PATH);
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /`commitment-graph\.json` is a folder/,
        );
    });

    it("reports a creation failure with the destination path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault();
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "create").mockRejectedValueOnce(new Error("disk full"));

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Cannot create `commitment-graph\.json`, disk full/,
        );
    });

    it("reports a destination read failure with the path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [CONFIG.GRAPH_PATH]: "{}\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "read").mockRejectedValueOnce(new Error("locked"));

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Cannot read `commitment-graph\.json`, locked/,
        );
    });

    it("reports a process write failure with the path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [CONFIG.GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "process").mockRejectedValueOnce(new Error("read only"));

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Cannot write `commitment-graph\.json`, read only/,
        );
    });
});
