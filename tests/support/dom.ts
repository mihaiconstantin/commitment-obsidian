/**
 * Minimal Obsidian DOM extension polyfill for tests.
 *
 * Obsidian adds these helpers to `HTMLElement` at runtime; happy-dom does not.
 */


export interface DomElementInfo {
    text?: string;
    cls?: string | string[];
}


declare global {
    interface HTMLElement {
        createEl(tag: string, info?: DomElementInfo): HTMLElement;
        createDiv(info?: DomElementInfo): HTMLDivElement;
        empty(): void;
        setText(text: string): void;
        addClass(...classes: string[]): void;
    }
}

HTMLElement.prototype.createEl = function createEl(
    this: HTMLElement,
    tag: string,
    info: DomElementInfo = {},
): HTMLElement {
    // Create the requested element.
    const element: HTMLElement = document.createElement(tag);

    // Apply the supplied text content.
    if (info.text !== undefined) {
        // Set the element text.
        element.textContent = info.text;
    }

    // Apply the supplied classes.
    if (info.cls !== undefined) {
        // Normalize one class or a class list.
        const classes: string[] = Array.isArray(info.cls) ? info.cls : [info.cls];

        // Add every supplied class.
        element.classList.add(...classes);
    }

    // Append the element to its parent.
    this.append(element);

    // Return the created element.
    return element;
};

HTMLElement.prototype.createDiv = function createDiv(
    this: HTMLElement,
    info: DomElementInfo = {},
): HTMLDivElement {
    return this.createEl("div", info) as HTMLDivElement;
};

HTMLElement.prototype.empty = function empty(this: HTMLElement): void {
    // Remove every child node.
    this.replaceChildren();
};

HTMLElement.prototype.setText = function setText(this: HTMLElement, text: string): void {
    // Replace the element text.
    this.textContent = text;
};

HTMLElement.prototype.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
    // Add every supplied class.
    this.classList.add(...classes);
};

export {};
