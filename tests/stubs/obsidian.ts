/**
 * Minimal Obsidian runtime stub for unit tests.
 *
 * The plugin is compiled and type checked against the real `obsidian`
 * declarations; this module only supplies the runtime classes and functions
 * the tests exercise.
 */


export interface FrontMatterInfo {
    exists: boolean;
    frontmatter: string;
    from: number;
    to: number;
    contentStart: number;
}


export class TAbstractFile {
    path = "";
    name = "";
    parent: TFolder | null = null;
}


export class TFile extends TAbstractFile {
    basename = "";
    extension = "";
    stat = { ctime: 0, mtime: 0, size: 0 };
}


export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];
}


export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}


export function getFrontMatterInfo(content: string): FrontMatterInfo {
    const opening: RegExpExecArray | null = /^---\r?\n/.exec(content);
    if (opening === null) {
        return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
    }

    const bodyStart: number = opening[0].length;
    const rest: string = content.slice(bodyStart);
    const atStart: RegExpExecArray | null = /^---(?:\r?\n|$)/.exec(rest);
    const later: RegExpExecArray | null = atStart === null ? /\r?\n---(?:\r?\n|$)/.exec(rest) : null;
    const closing: RegExpExecArray | null = atStart ?? later;
    if (closing === null) {
        return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
    }

    const bodyEnd: number = bodyStart + (atStart === null ? (later?.index ?? 0) : 0);
    return {
        exists: true,
        frontmatter: content.slice(bodyStart, bodyEnd),
        from: bodyStart,
        to: bodyEnd,
        contentStart: bodyStart + closing[0].length,
    };
}


export class Notice {
    static instances: Notice[] = [];
    message: string;
    duration: number;

    constructor(message: string, duration = 5000) {
        this.message = message;
        this.duration = duration;
        Notice.instances.push(this);
    }
}


function createElement(tag: string): HTMLElement {
    return document.createElement(tag);
}


export class Modal {
    static instances: Modal[] = [];

    app: unknown;
    containerEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    opened = false;
    closed = false;

    constructor(app: unknown) {
        this.app = app;
        Modal.instances.push(this);
        this.containerEl = createElement("div");
        this.modalEl = createElement("div");
        this.titleEl = createElement("h2");
        this.contentEl = createElement("div");
        this.containerEl.append(this.modalEl);
        this.modalEl.append(this.titleEl, this.contentEl);
    }

    open(): void {
        this.opened = true;
        document.body.append(this.containerEl);
    }

    close(): void {
        this.closed = true;
        this.containerEl.remove();
    }

    setTitle(title: string): this {
        this.titleEl.textContent = title;
        return this;
    }

    setContent(content: string | DocumentFragment): this {
        if (typeof content === "string") {
            this.contentEl.textContent = content;
        } else {
            this.contentEl.replaceChildren(content);
        }
        return this;
    }
}


export interface Command {
    id: string;
    name: string;
    callback?: () => unknown;
    checkCallback?: (checking: boolean) => boolean | void;
}


export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    description: string;
    author: string;
    isDesktopOnly: boolean;
}


export class Workspace {
    private ready = false;
    private callbacks: Array<() => void> = [];

    onLayoutReady(callback: () => void): void {
        if (this.ready) {
            callback();
            return;
        }
        this.callbacks.push(callback);
    }

    triggerLayoutReady(): void {
        this.ready = true;
        const callbacks: (() => void)[] = this.callbacks;
        this.callbacks = [];
        for (const callback of callbacks) {
            callback();
        }
    }
}


/** Empty vault used when a test only needs presentation. */
class AppVault implements Vault {
    getFiles(): TFile[] {
        return [];
    }

    getAbstractFileByPath(): TAbstractFile | null {
        return null;
    }

    async read(): Promise<string> {
        return "";
    }

    async readBinary(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
    }

    async create(): Promise<TFile> {
        throw new Error("No vault is available.");
    }

    async process(): Promise<string> {
        throw new Error("No vault is available.");
    }
}


export interface Vault {
    getFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    read(file: TFile): Promise<string>;
    readBinary(file: TFile): Promise<ArrayBuffer>;
    create(path: string, data: string): Promise<TFile>;
    process(file: TFile, fn: (data: string) => string): Promise<string>;
}


export class App {
    vault: Vault;
    workspace = new Workspace();

    constructor(vault: Vault = new AppVault()) {
        this.vault = vault;
    }
}


export class Plugin {
    app: App;
    manifest: PluginManifest;
    commands: Command[] = [];

    constructor(app: App, manifest: PluginManifest) {
        this.app = app;
        this.manifest = manifest;
    }

    addCommand(command: Command): Command {
        this.commands.push(command);
        return command;
    }

    registerEvent(): void {
        // No registered events are used by the plugin.
    }

    onload(): Promise<void> | void {
        // Overridden by the plugin under test.
    }
}
