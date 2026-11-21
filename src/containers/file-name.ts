/**
 * Identifier styles for created container file names.
 *
 * This module owns the style types and the style catalog because every
 * supported style is an implementation detail of formatting a file name. The
 * default style stays application configuration.
 */

import { titleCase } from "../helpers/strings";


/** How the identifier text is capitalized inside a file name. */
export type IdStyle = "titleCase" | "none";


/** One supported style with its settings label and text transform. */
export interface IdStyleSpec {
    /** Label shown in the settings dropdown. */
    readonly label: string;

    /** Return the identifier text for the style. */
    readonly format: (id: string) => string;
}


/** Every supported identifier style with its label and text transform. */
export class IdStyleCatalog {
    /** Supported styles, keyed by the persisted style name. */
    private readonly styles: Readonly<Record<IdStyle, IdStyleSpec>>;

    /** Register each supported style; adding one costs one entry here and one union member. */
    public constructor() {
        // Register the title-case style with the shared title-case transform.
        this.styles = {
            titleCase: { label: "Title Case", format: titleCase },
            none: { label: "None", format: (id: string): string => id },
        };
    }

    /** Return whether a value is a supported identifier style. */
    public isStyle(value: unknown): value is IdStyle {
        // Require exact text that names an own style entry.
        return typeof value === "string" && Object.prototype.hasOwnProperty.call(this.styles, value);
    }

    /** Return the identifier text for one supported style. */
    public format(style: IdStyle, id: string): string {
        // Apply the style's text transform.
        return this.styles[style].format(id);
    }

    /** Return the settings label for one supported style. */
    public label(style: IdStyle): string {
        // Return the style's readable label.
        return this.styles[style].label;
    }

    /** Return every supported style in display order. */
    public keys(): readonly IdStyle[] {
        // Preserve the registration order used by the settings dropdown.
        return Object.keys(this.styles) as IdStyle[];
    }
}
