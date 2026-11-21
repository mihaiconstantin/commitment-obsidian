/**
 * Generic utility helpers shared across the plugin.
 */

/** Return one own property from an unknown object. */
export function ownValue(value: unknown, key: string): unknown {
    // Require an object before reading a property.
    if (typeof value !== "object" || value === null) {
        // Report no usable property.
        return undefined;
    }

    // Read only own properties, never the prototype chain.
    return Object.prototype.hasOwnProperty.call(value, key)
        ? (value as Record<string, unknown>)[key]
        : undefined;
}


/** Read a short message from any thrown value. */
export function describeFailure(error: unknown): string {
    // Prefer the error message and fall back to the plain value text.
    return error instanceof Error ? error.message : String(error);
}
