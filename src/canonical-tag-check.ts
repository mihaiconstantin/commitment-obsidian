/**
 * Reject unresolved YAML tags that supply a canonical commitment field.
 *
 * Unknown tags on unrelated metadata are allowed. A tag on `type`, `id`,
 * `area`, `program`, `level`, or `anchor` would make the field's value
 * unreliable, including when a merge or alias supplies that value.
 */

import { isAlias, isMap, isScalar, isSeq, type Document, type Node, type YAMLMap, type YAMLSeq } from "yaml";

import { INVALID_SCALAR } from "./scalar-tags";


/** Field names that drive canonical recognition or graph relationships. */
const CANONICAL_FIELDS: Readonly<Record<string, true>> = {
    type: true,
    id: true,
    area: true,
    program: true,
    level: true,
    anchor: true,
};


/** Return whether a value is a node from the parsed document. */
function isNodeValue(value: unknown): value is Node {
    // Require a value that the YAML node guards recognize.
    return isScalar(value) || isMap(value) || isSeq(value) || isAlias(value);
}


/** Return whether one mapping key selects YAML merge semantics. */
function isMergeKey(key: unknown): boolean {
    // Accept a scalar merge key whether it stores text or a merge symbol.
    return isScalar(key) && (key.value === "<<" || typeof key.value === "symbol");
}


/** Return whether a node carries an unresolved non-standard tag. */
function hasUnresolvedTag(value: unknown): boolean {
    // Require a node with an explicit tag outside the standard set.
    if (!isNodeValue(value) || typeof value.tag !== "string") {
        // Report no unresolved tag.
        return false;
    }

    // Treat only standard YAML tags as resolved.
    return !value.tag.startsWith("tag:yaml.org,2002:");
}


/** Resolve an alias to its anchor node when the anchor is available. */
function resolveAlias(value: unknown, document: Document): Node | null {
    // Require an alias node to resolve.
    if (!isAlias(value)) {
        // Report the original node for a non-alias value.
        return isNodeValue(value) ? value : null;
    }

    // Resolve the alias against the parsed document.
    return value.resolve(document) ?? null;
}


/** Return whether a node holds an unresolvable explicit tag value. */
function isInvalidScalar(node: Node | null): boolean {
    // Require a scalar that the tag resolver marked invalid.
    return node !== null && isScalar(node) && node.value === INVALID_SCALAR;
}


/** Return whether one value node is unusable for a canonical field. */
function isUnusableValue(
    value: unknown,
    document: Document,
    visited: Set<Node>,
): boolean {
    // Resolve aliases before inspecting the supplied value.
    const resolved: Node | null = resolveAlias(value, document);

    // Detect an unresolved tag on the effective scalar.
    if (hasUnresolvedTag(resolved)) {
        // Report the unusable value.
        return true;
    }

    // Detect an explicit standard tag whose scalar could not be resolved.
    if (isInvalidScalar(resolved)) {
        // Report the unresolved explicit scalar.
        return true;
    }

    // Require a sequence to inspect its items.
    if (resolved === null || !isSeq(resolved)) {
        // Accept every other value shape; later type checks reject it.
        return false;
    }

    // Skip a sequence already inspected through a cyclic alias.
    if (visited.has(resolved)) {
        // Report no new finding for the repeated node.
        return false;
    }

    // Remember the inspected sequence.
    visited.add(resolved);

    // Check every sequence item.
    return (resolved as YAMLSeq).items.some(
        (item: unknown): boolean => isUnusableValue(item, document, visited),
    );
}


/** Inspect one mapping's canonical fields for unresolved tags. */
function inspectMap(map: YAMLMap, document: Document, visited: Set<YAMLMap>): void {
    // Skip a mapping already inspected through another merge source.
    if (visited.has(map)) {
        // Continue without repeating findings.
        return;
    }

    // Remember the inspected mapping.
    visited.add(map);

    // Inspect every key/value pair in the mapping.
    for (const pair of map.items) {
        // Read the pair key text when it is a scalar.
        const key: unknown = pair.key;
        const keyText: string | null =
            isScalar(key) && typeof key.value === "string" ? key.value : null;
        const hasTaggedKey: boolean =
            hasUnresolvedTag(key) &&
            keyText !== null &&
            CANONICAL_FIELDS[keyText] === true;

        // Reject a tagged key that spells a canonical field.
        if (hasTaggedKey) {
            // Report the field whose key cannot be trusted.
            throw new Error(
                `Unresolved tag on canonical field key '${keyText}'.`,
            );
        }

        // Resolve merge keys by inspecting their source mappings.
        if (isMergeKey(key)) {
            // Inspect each merge source mapping.
            inspectMergeSources(pair.value, document, visited);
            continue;
        }

        // Ignore non-canonical field names.
        if (keyText === null || CANONICAL_FIELDS[keyText] !== true) {
            // Continue with the next pair.
            continue;
        }

        // Reject an unresolved tag on the effective canonical value.
        if (isUnusableValue(pair.value, document, new Set<Node>())) {
            // Read the resolved effective value.
            const resolved: Node | null = resolveAlias(pair.value, document);

            // Distinguish an unresolved explicit scalar from an unknown tag.
            if (isInvalidScalar(resolved)) {
                // Report the field whose explicit scalar cannot be read.
                throw new Error(
                    `Invalid explicit tag value on canonical field '${keyText}'.`,
                );
            }

            // Read the offending unknown tag.
            const tag: string =
                resolved !== null && typeof resolved.tag === "string"
                    ? resolved.tag
                    : "unresolved tag";

            // Report the field whose value cannot be trusted.
            throw new Error(`Unresolved tag '${tag}' on canonical field '${keyText}'.`);
        }
    }
}


/** Inspect one merge value for mappings whose canonical fields are tagged. */
function inspectMergeSources(
    value: unknown,
    document: Document,
    visited: Set<YAMLMap>,
): void {
    // Resolve the merge value through any alias.
    const resolved: Node | null = resolveAlias(value, document);

    // Inspect each mapping in a merge sequence.
    if (isSeq(resolved)) {
        // Inspect every source mapping in order.
        for (const item of (resolved as YAMLSeq).items) {
            // Recurse into the source mapping.
            inspectMergeSources(item, document, visited);
        }
        return;
    }

    // Inspect a single merge source mapping.
    if (isMap(resolved)) {
        // Check the merged mapping's canonical fields.
        inspectMap(resolved, document, visited);
    }
}


/** Throw when an effective canonical field carries an unresolved tag. */
export function assertCanonicalTagsResolved(document: Document, contents: Node): void {
    // Inspect only a mapping document root.
    if (!isMap(contents)) {
        // Report no tag finding for another root shape.
        return;
    }

    // Inspect the complete mapping once.
    inspectMap(contents, document, new Set<YAMLMap>());
}
