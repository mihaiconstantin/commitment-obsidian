/**
 * In-memory vault used to exercise the store and command callbacks without a
 * real Obsidian installation.
 */

import { normalizePath, TFile, TFolder, type TAbstractFile, type Vault } from "obsidian";


/** Recorded calls made against the fake vault. */
export interface VaultCalls {
    reads: string[];
    binaries: string[];
    creates: string[];
    processes: string[];
}


/** In-memory vault with the methods the plugin uses. */
export class FakeVault implements Vault {
    readonly calls: VaultCalls = { reads: [], binaries: [], creates: [], processes: [] };
    readonly files = new Map<string, Uint8Array>();
    readonly folders = new Map<string, TFolder>();
    private readonly abstractFiles = new Map<string, TAbstractFile>();

    constructor(initial: Record<string, string | Uint8Array> = {}) {
        for (const [path, content] of Object.entries(initial)) {
            this.put(path, content);
        }
    }

    put(path: string, content: string | Uint8Array): TFile {
        const normalized: string = normalizePath(path);
        const bytes: Uint8Array =
            typeof content === "string" ? new TextEncoder().encode(content) : content;
        this.files.set(normalized, bytes);
        const file: TFile = new TFile();
        file.path = normalized;
        const segments: string[] = normalized.split("/");
        file.name = segments[segments.length - 1] ?? "";
        const dot: number = file.name.lastIndexOf(".");
        file.basename = dot === -1 ? file.name : file.name.slice(0, dot);
        file.extension = dot === -1 ? "" : file.name.slice(dot + 1);
        this.abstractFiles.set(normalized, file);
        return file;
    }

    remove(path: string): void {
        const normalized: string = normalizePath(path);
        this.files.delete(normalized);
        this.abstractFiles.delete(normalized);
    }

    getFiles(): TFile[] {
        return [...this.abstractFiles.values()].filter((entry): entry is TFile => entry instanceof TFile);
    }

    getAbstractFileByPath(path: string): TAbstractFile | null {
        return this.abstractFiles.get(normalizePath(path)) ?? null;
    }

    createFolder(path: string): TFolder {
        const normalized: string = normalizePath(path);
        const folder: TFolder = new TFolder();
        folder.path = normalized;
        this.folders.set(normalized, folder);
        this.abstractFiles.set(normalized, folder);
        return folder;
    }

    async read(file: TFile): Promise<string> {
        this.calls.reads.push(file.path);
        const bytes: Uint8Array | undefined = this.files.get(file.path);
        if (bytes === undefined) {
            throw new Error(`Missing file: ${file.path}`);
        }
        return new TextDecoder().decode(bytes);
    }

    async readBinary(file: TFile): Promise<ArrayBuffer> {
        this.calls.binaries.push(file.path);
        const bytes: Uint8Array | undefined = this.files.get(file.path);
        if (bytes === undefined) {
            throw new Error(`Missing file: ${file.path}`);
        }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    async create(path: string, data: string): Promise<TFile> {
        this.calls.creates.push(path);
        const normalized: string = normalizePath(path);
        if (this.abstractFiles.has(normalized)) {
            throw new Error(`File already exists: ${normalized}`);
        }
        return this.put(normalized, data);
    }

    async process(file: TFile, fn: (data: string) => string): Promise<string> {
        this.calls.processes.push(file.path);
        const bytes: Uint8Array | undefined = this.files.get(file.path);
        if (bytes === undefined) {
            throw new Error(`Missing file: ${file.path}`);
        }
        const data: string = new TextDecoder().decode(bytes);
        const next: string = fn(data);
        this.put(file.path, next);
        return next;
    }
}
