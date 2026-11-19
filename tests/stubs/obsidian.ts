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


/** Deterministic local moment used by container creation tests. */
const MOMENT_NOW: Date = new Date(2026, 0, 2, 3, 4, 5);


/** Minimal moment value with the tokens the plugin uses. */
export interface Moment {
    /** Format the held date with the supported tokens. */
    format(format: string): string;
}


/** Return one deterministic moment value. */
export function moment(input?: string | number | Date): Moment {
    // Use the supplied date, or the fixed test date.
    const date: Date = input === undefined ? MOMENT_NOW : new Date(input);

    // Return the formatter for the supported tokens.
    return {
        format(format: string): string {
            // Read the local date parts used by the token set.
            const year: number = date.getFullYear();
            const month: number = date.getMonth() + 1;
            const day: number = date.getDate();
            const hour: number = date.getHours();
            const minute: number = date.getMinutes();
            const second: number = date.getSeconds();

            // Replace the longest tokens first in one pass.
            return format.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s/g, (token: string): string => {
                switch (token) {
                    case "YYYY":
                        return String(year);
                    case "YY":
                        return String(year).slice(-2);
                    case "MM":
                        return String(month).padStart(2, "0");
                    case "M":
                        return String(month);
                    case "DD":
                        return String(day).padStart(2, "0");
                    case "D":
                        return String(day);
                    case "HH":
                        return String(hour).padStart(2, "0");
                    case "H":
                        return String(hour);
                    case "mm":
                        return String(minute).padStart(2, "0");
                    case "m":
                        return String(minute);
                    case "ss":
                        return String(second).padStart(2, "0");
                    default:
                        return String(second);
                }
            });
        },
    };
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


export class Scope {
    handlers: Array<{ modifiers: string[] | null; key: string | null; func: () => unknown }> = [];

    register(modifiers: string[] | null, key: string | null, func: () => unknown): { modifiers: string[] | null; key: string | null; func: () => unknown } {
        const handler = { modifiers, key, func };
        this.handlers.push(handler);
        return handler;
    }

    unregister(handler: { modifiers: string[] | null; key: string | null; func: () => unknown }): void {
        this.handlers = this.handlers.filter((entry) => entry !== handler);
    }
}


export class Modal {
    static instances: Modal[] = [];

    app: App;
    scope: Scope = new Scope();
    containerEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    opened = false;
    closed = false;

    constructor(app: App) {
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
        // Match Obsidian by building the modal body on open.
        void this.onOpen();
    }

    onOpen(): void {
        // Overridden by modal subclasses under test.
    }

    close(): void {
        this.closed = true;
        this.onClose();
        this.containerEl.remove();
    }

    onClose(): void {
        // Overridden by the presenter under test.
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



/** Dropdown control used by the settings stub. */
export interface DropdownComponent {
    /** Add one selectable option. */
    addOption(value: string, label: string): DropdownComponent;
    /** Select one option without firing the change handler. */
    setValue(value: string): DropdownComponent;
    /** Register the change handler. */
    onChange(handler: (value: string) => void): DropdownComponent;
}


/** Text control used by the settings stub. */
export class TextComponent {
    /** Underlying input element. */
    readonly inputEl: HTMLInputElement = createElement("input") as HTMLInputElement;

    /** Current control value. */
    value = "";

    /** Registered change handler. */
    change: ((value: string) => void) | null = null;

    /** Set the current value without firing the handler. */
    setValue(value: string): TextComponent {
        // Store the value on the control and the input.
        this.value = value;
        this.inputEl.value = value;
        return this;
    }

    /** Set the input placeholder. */
    setPlaceholder(value: string): TextComponent {
        // Store the placeholder on the input.
        this.inputEl.placeholder = value;
        return this;
    }

    /** Register the change handler without replacing an earlier one. */
    onChange(handler: (value: string) => void): TextComponent {
        // Chain the new handler after any registered handler.
        const previous: ((value: string) => void) | null = this.change;
        this.change = (value: string): void => {
            previous?.(value);
            handler(value);
        };
        return this;
    }
}


export class Setting {
    static instances: Setting[] = [];

    settingEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    value = "";
    change: ((value: string) => void) | null = null;

    constructor(containerEl: HTMLElement) {
        Setting.instances.push(this);
        this.settingEl = createElement("div");
        this.settingEl.classList.add("setting");
        this.nameEl = createElement("div");
        this.descEl = createElement("div");
        this.controlEl = createElement("div");
        this.settingEl.append(this.nameEl, this.descEl, this.controlEl);
        containerEl.append(this.settingEl);
    }

    setName(name: string): this {
        this.nameEl.textContent = name;
        return this;
    }

    setDesc(desc: string): this {
        this.descEl.textContent = desc;
        return this;
    }

    addDropdown(build: (dropdown: DropdownComponent) => void): this {
        const control: DropdownComponent = {
            addOption: (): DropdownComponent => control,
            setValue: (value: string): DropdownComponent => {
                this.value = value;
                return control;
            },
            onChange: (handler: (value: string) => void): DropdownComponent => {
                this.change = handler;
                return control;
            },
        };
        build(control);
        return this;
    }

    addText(build: (text: TextComponent) => void): this {
        const control: TextComponent = new TextComponent();
        build(control);
        this.value = control.value;
        const handler: ((value: string) => void) | null = control.change;
        this.change = handler === null
            ? null
            : (value: string): void => {
                this.value = value;
                handler(value);
            };
        return this;
    }
}


export abstract class PluginSettingTab {
    app: App;
    plugin: unknown;
    containerEl: HTMLElement;

    constructor(app: App, plugin: unknown) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = createElement("div");
    }

    abstract display(): void;
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


/** Workspace leaf that records opened files. */
export class WorkspaceLeaf {
    /** Workspace that owns the leaf. */
    private readonly workspace: Workspace;

    /** File most recently opened in the leaf. */
    file: TFile | null = null;

    /** Construct the leaf for one workspace. */
    constructor(workspace: Workspace) {
        // Retain the owning workspace for recording.
        this.workspace = workspace;
    }

    /** Record and open one file. */
    async openFile(file: TFile): Promise<void> {
        // Record the opened file.
        this.file = file;
        this.workspace.opened.push(file);
    }
}


export class Workspace {
    private ready = false;
    private callbacks: Array<() => void> = [];

    /** Files opened through workspace leaves in order. */
    readonly opened: TFile[] = [];

    /** Leaves created through getLeaf. */
    readonly leaves: WorkspaceLeaf[] = [];

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

    getLeaf(_newLeaf?: boolean | "split"): WorkspaceLeaf {
        // Create and record a leaf.
        const leaf: WorkspaceLeaf = new WorkspaceLeaf(this);
        this.leaves.push(leaf);
        return leaf;
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

    getFileByPath(): TFile | null {
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

    async createFolder(): Promise<TFolder> {
        throw new Error("No vault is available.");
    }

    async process(): Promise<string> {
        throw new Error("No vault is available.");
    }
}


export interface Vault {
    getFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    getFileByPath(path: string): TFile | null;
    read(file: TFile): Promise<string>;
    readBinary(file: TFile): Promise<ArrayBuffer>;
    create(path: string, data: string): Promise<TFile>;
    createFolder(path: string): Promise<TFolder>;
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
    settingTabs: PluginSettingTab[] = [];
    data: unknown = null;

    constructor(app: App, manifest: PluginManifest) {
        this.app = app;
        this.manifest = manifest;
    }

    addCommand(command: Command): Command {
        this.commands.push(command);
        return command;
    }

    addSettingTab(tab: PluginSettingTab): void {
        this.settingTabs.push(tab);
    }

    async loadData(): Promise<unknown> {
        return this.data;
    }

    async saveData(data: unknown): Promise<void> {
        this.data = data;
    }

    registerEvent(): void {
        // No registered events are used by the plugin.
    }

    onload(): Promise<void> | void {
        // Overridden by the plugin under test.
    }
}
