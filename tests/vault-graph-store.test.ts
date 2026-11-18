import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async () => await import("./stubs/obsidian"));

import { VaultGraphStore, GRAPH_PATH } from "../src/vault-graph-store";
import type { CanonicalInput, InputSnapshot } from "../src/graph-types";
import { FakeVault } from "./support/fake-vault";


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

        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();

        expect(snapshot.documents.map((document) => document.path)).toEqual([
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

        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();

        expect(snapshot.documents.map((document) => document.path)).toEqual([
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

        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();

        // Read the parsed project input.
        const project: CanonicalInput | undefined = snapshot.inputs.find(
            (input) => input.path === "projects/alpha.md",
        );
        // Read the parsed plain input.
        const plain: CanonicalInput | undefined = snapshot.inputs.find(
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
            /Could not read 'broken\.md': disk failure/,
        );
    });

    it("accepts an unchanged snapshot", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ "page.md": "Page.\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();

        await expect(store.assertUnchanged(snapshot)).resolves.toBeUndefined();
    });

    it("rejects an added eligible file", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ "page.md": "Page.\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();
        // Change the saved vault state.
        vault.put("added.md", "Added.\n");

        await expect(store.assertUnchanged(snapshot)).rejects.toThrowError(
            /Saved source 'added\.md' changed/,
        );
    });

    it("rejects a removed eligible file", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ "page.md": "Page.\n", "other.md": "Other.\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();
        // Remove the saved vault file.
        vault.remove("other.md");

        await expect(store.assertUnchanged(snapshot)).rejects.toThrowError(
            /Saved source 'other\.md' changed/,
        );
    });

    it("rejects changed saved text", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ "page.md": "Page.\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the saved-input snapshot.
        const snapshot: InputSnapshot = await store.readInputs();
        // Change the saved vault state.
        vault.put("page.md", "Changed.\n");

        await expect(store.assertUnchanged(snapshot)).rejects.toThrowError(
            /Saved source 'page\.md' changed/,
        );
    });

    it("creates a missing destination", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault();
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("written");
        expect(vault.calls.creates).toEqual([GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(GRAPH_PATH))).toBe("{}\n");
    });

    it("leaves identical bytes untouched", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: "{}\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("unchanged");
        expect(vault.calls.processes).toEqual([]);
        expect(vault.calls.creates).toEqual([]);
    });

    it("replaces different derived output", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).resolves.toBe("written");
        expect(vault.calls.processes).toEqual([GRAPH_PATH]);
        expect(new TextDecoder().decode(vault.files.get(GRAPH_PATH))).toBe("{}\n");
    });

    it("rejects a folder at the destination", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault();
        vault.createFolder(GRAPH_PATH);
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Graph destination 'commitment-graph\.json' is a folder/,
        );
    });

    it("rejects a destination change between the byte reads", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the original vault method.
        const original = vault.readBinary.bind(vault);
        let count: number = 0;
        vi.spyOn(vault, "readBinary").mockImplementation(async (file) => {
            count += 1;
            if (count === 2) {
                // Change the saved vault state.
                vault.put(GRAPH_PATH, '{"changed": true}\n');
            }
            return original(file);
        });

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Graph destination 'commitment-graph\.json' changed/,
        );
        expect(vault.calls.processes).toEqual([]);
    });

    it("does not write when the process text differs", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Capture the original vault method.
        const original = vault.process.bind(vault);
        vi.spyOn(vault, "process").mockImplementation(async (file, fn) => {
            await original(file, () => '{"intervening": true}\n');
            return original(file, fn);
        });

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Graph destination 'commitment-graph\.json' changed/,
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
            /Could not create graph destination 'commitment-graph\.json': disk full/,
        );
    });

    it("reports a destination read failure with the path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: "{}\n" });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "readBinary").mockRejectedValueOnce(new Error("locked"));

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Could not read graph destination 'commitment-graph\.json': locked/,
        );
    });

    it("reports a process write failure with the path", async () => {
        // Create the in-memory vault.
        const vault: FakeVault = new FakeVault({ [GRAPH_PATH]: '{"manual": true}\n' });
        // Compose the store over the vault.
        const store: VaultGraphStore = new VaultGraphStore(vault);
        // Replace the vault behavior for the case.
        vi.spyOn(vault, "process").mockRejectedValueOnce(new Error("read only"));

        await expect(store.writeGraph("{}\n")).rejects.toThrowError(
            /Could not write graph destination 'commitment-graph\.json': read only/,
        );
    });
});
