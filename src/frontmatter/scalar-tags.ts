/**
 * YAML scalar tags matching the graph-relevant typing of the repository's
 * Python parser. The tags replace the version-selected numeric and timestamp
 * tags and add explicit-tag handling for booleans and nulls.
 *
 * Resolution order follows the installed ruamel resolver: booleans, floats,
 * integers, nulls, then timestamps. The repository's parser keeps timestamps
 * as their original text, so date-like identifiers stay strings.
 */

import type { ScalarTag, Tags } from "yaml";


/** Supported YAML versions. */
export type YamlVersion = "1.1" | "1.2";

/**
 * Value for an explicit standard tag whose scalar cannot be resolved.
 *
 * The Python parser rejects the document, but a frontmatter field that no
 * canonical rule reads must not block the graph. The parser reports this value
 * only when it reaches an effective canonical field.
 */
export const INVALID_SCALAR: Readonly<{ invalidScalar: true }> = Object.freeze({
    invalidScalar: true,
});


/** Build the scalar tags for one YAML version. */
export function createScalarTags(version: YamlVersion): (tags: Tags) => Tags {
    // Return the schema customizer for the requested version.
    return (tags: Tags): Tags => {
        // Remove the base numeric and timestamp tags that use other rules.
        const retained: Tags = tags.filter(
            (tag): boolean =>
                !(tag && typeof tag === "object" && isReplacedTag(tag.tag)),
        );

        // Add explicit tags, then the version-specific implicit tags in
        // resolver precedence order.
        return [
            ...retained,
            explicitBoolTag(),
            explicitIntegerTag(version),
            explicitFloatTag(version),
            explicitNullTag(),
            explicitTimestampTag(),
            ...implicitFloatTags(version),
            ...implicitIntegerTags(version),
            implicitTimestampTag(),
        ];
    };
}


/** Return whether a standard tag is replaced by the targeted rules. */
function isReplacedTag(tag: string): boolean {
    // Replace only the standard numeric and timestamp tags.
    return (
        tag === "tag:yaml.org,2002:int" ||
        tag === "tag:yaml.org,2002:float" ||
        tag === "tag:yaml.org,2002:timestamp"
    );
}


/** Build the explicit boolean tag matching the Python constructor. */
function explicitBoolTag(): ScalarTag {
    // Accept the documented YAML 1.1 boolean spellings for an explicit tag.
    return {
        tag: "tag:yaml.org,2002:bool",
        default: false,
        resolve: (value: string): boolean | Readonly<{ invalidScalar: true }> => {
            // Normalize only the spelling lookup, not the stored scalar.
            const lowered: string = value.toLowerCase();

            // Accept every spelling recognized by the Python constructor.
            if (["y", "yes", "true", "on"].includes(lowered)) {
                // Report the true value.
                return true;
            }

            // Accept every false spelling recognized by the Python constructor.
            if (["n", "no", "false", "off"].includes(lowered)) {
                // Report the false value.
                return false;
            }

            // Record the unresolved explicit boolean for canonical-field checks.
            return INVALID_SCALAR;
        },
    };
}


/** Build the explicit integer tag matching the Python constructor. */
function explicitIntegerTag(version: YamlVersion): ScalarTag {
    // Resolve every explicit integer through the shared Python-compatible rule.
    return {
        tag: "tag:yaml.org,2002:int",
        default: false,
        resolve: (value: string): bigint | Readonly<{ invalidScalar: true }> =>
            parseInteger(value, version),
    };
}


/** Build the explicit float tag matching the Python constructor. */
function explicitFloatTag(version: YamlVersion): ScalarTag {
    // Resolve every explicit float through the shared Python-compatible rule.
    return {
        tag: "tag:yaml.org,2002:float",
        default: false,
        resolve: (value: string): number | Readonly<{ invalidScalar: true }> =>
            parseFloatValue(value, version, true),
    };
}


/** Build the explicit null tag matching the Python constructor. */
function explicitNullTag(): ScalarTag {
    // Treat every explicit null scalar as null, as the Python parser does.
    return {
        tag: "tag:yaml.org,2002:null",
        default: false,
        resolve: (): null => null,
    };
}


/** Build the explicit timestamp tag that preserves the original text. */
function explicitTimestampTag(): ScalarTag {
    // Return the decoded scalar text instead of a date value.
    return {
        tag: "tag:yaml.org,2002:timestamp",
        default: false,
        resolve: (value: string): string => value,
    };
}


/** Build the implicit integer tags for one YAML version. */
function implicitIntegerTags(version: YamlVersion): ScalarTag[] {
    // Use the resolver patterns from the installed ruamel resolver.
    const patterns: RegExp[] =
        version === "1.1"
            ? [
                  /^[-+]?0b[0-1_]+$/,
                  /^[-+]?0?[0-7_]+$/,
                  /^[-+]?(?:0|[1-9][0-9_]*)$/,
                  /^[-+]?0x[0-9a-fA-F_]+$/,
                  /^[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+$/,
              ]
            : [
                  /^[-+]?0b[0-1_]+$/,
                  /^[-+]?0o?[0-7_]+$/,
                  /^[-+]?[0-9_]+$/,
                  /^[-+]?0x[0-9a-fA-F_]+$/,
              ];

    // Create one default tag per accepted implicit spelling.
    return patterns.map(
        (test: RegExp): ScalarTag => ({
            tag: "tag:yaml.org,2002:int",
            default: true,
            test,
            resolve: (value: string): bigint | Readonly<{ invalidScalar: true }> =>
                parseInteger(value, version),
        }),
    );
}


/** Build the implicit float tags for one YAML version. */
function implicitFloatTags(version: YamlVersion): ScalarTag[] {
    // Use the resolver patterns from the installed ruamel resolver.
    const patterns: RegExp[] =
        version === "1.1"
            ? [
                  /^[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?$/,
                  /^[-+]?(?:[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)$/,
                  /^\.[0-9_]+(?:[eE][-+][0-9]+)?$/,
                  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
                  /^[-+]?\.(?:inf|Inf|INF)$/,
                  /^\.(?:nan|NaN|NAN)$/,
              ]
            : [
                  /^[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+]?[0-9]+)?$/,
                  /^[-+]?(?:[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)$/,
                  /^[-+]?\.[0-9_]+(?:[eE][-+][0-9]+)?$/,
                  /^[-+]?\.(?:inf|Inf|INF)$/,
                  /^\.(?:nan|NaN|NAN)$/,
              ];

    // Create one default tag per accepted implicit spelling.
    return patterns.map(
        (test: RegExp): ScalarTag => ({
            tag: "tag:yaml.org,2002:float",
            default: true,
            test,
            resolve: (value: string): number | Readonly<{ invalidScalar: true }> =>
                parseFloatValue(value, version, false),
        }),
    );
}


/** Build the implicit timestamp tag that preserves the original text. */
function implicitTimestampTag(): ScalarTag {
    // Match the date and datetime shapes from the installed ruamel resolver.
    return {
        tag: "tag:yaml.org,2002:timestamp",
        default: true,
        test: /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4} -[0-9]{1,2} -[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)$/,
        resolve: (value: string): string => value,
    };
}


/** Parse one integer with the Python constructor's version rules. */
function parseInteger(
    value: string,
    version: YamlVersion,
): bigint | Readonly<{ invalidScalar: true }> {
    // Remove grouping underscores and read the optional sign.
    const cleaned: string = value.replace(/_/g, "").trim();
    let sign: bigint = 1n;
    let body: string = cleaned;

    // Separate a leading sign from the numeric body.
    if (body.startsWith("-")) {
        // Record the negative sign.
        sign = -1n;
        body = body.slice(1);
    } else if (body.startsWith("+")) {
        // Remove the positive sign.
        body = body.slice(1);
    }

    // Reject a value with no digits after the sign.
    if (body === "") {
        // Record the unresolved explicit integer.
        return INVALID_SCALAR;
    }

    // Parse the accepted numeric body with arbitrary precision.
    try {
        // Read the zero value directly.
        if (body === "0") {
            // Return the exact zero.
            return 0n;
        }

        // Read a binary prefix.
        if (body.startsWith("0b")) {
            // Return the signed binary value.
            return sign * BigInt(`0b${body.slice(2)}`);
        }

        // Read a hexadecimal prefix.
        if (body.startsWith("0x")) {
            // Return the signed hexadecimal value.
            return sign * BigInt(`0x${body.slice(2)}`);
        }

        // Read an explicit octal prefix.
        if (body.startsWith("0o")) {
            // Return the signed octal value.
            return sign * BigInt(`0o${body.slice(2)}`);
        }

        // Read a YAML 1.1 octal value with a leading zero.
        if (version === "1.1" && body.startsWith("0")) {
            // Return the signed octal value.
            return sign * BigInt(`0o${body.slice(1)}`);
        }

        // Read a YAML 1.1 sexagesimal integer.
        if (version === "1.1" && body.includes(":")) {
            // Return the signed base-60 value.
            return sign * parseSexagesimalInteger(body);
        }

        // Read a decimal value with leading zeros removed for BigInt.
        return sign * BigInt(body.replace(/^0+(?=[0-9])/, ""));
    } catch {
        // Record the unresolved explicit integer.
        return INVALID_SCALAR;
    }
}


/** Parse one base-60 integer the way the Python constructor does. */
function parseSexagesimalInteger(value: string): bigint {
    // Read each colon-separated digit.
    const digits: string[] = value.split(":");
    let result: bigint = 0n;

    // Combine the digits in base 60.
    for (const digit of digits) {
        // Advance the accumulated value and add the next digit.
        result = result * 60n + BigInt(digit);
    }

    // Return the combined value.
    return result;
}


/** Parse one float with the Python constructor's version rules. */
function parseFloatValue(
    value: string,
    version: YamlVersion,
    explicit: boolean,
): number | Readonly<{ invalidScalar: true }> {
    // Remove grouping underscores and normalize for comparisons.
    const cleaned: string = value.replace(/_/g, "");
    const lowered: string = cleaned.toLowerCase();
    let sign: number = 1;
    let body: string = lowered;

    // Separate a leading sign from the numeric body.
    if (body.startsWith("-")) {
        // Record the negative sign.
        sign = -1;
        body = body.slice(1);
    } else if (body.startsWith("+")) {
        // Remove the positive sign.
        body = body.slice(1);
    }

    // Read the infinity and not-a-number spellings.
    if (body === ".inf") {
        // Return the signed infinity.
        return sign * Number.POSITIVE_INFINITY;
    }
    if (body === ".nan") {
        // Return the quiet not-a-number value.
        return Number.NaN;
    }

    // Read a YAML 1.1 sexagesimal float.
    if (version === "1.1" && body.includes(":")) {
        // Return the signed base-60 value.
        return sign * parseSexagesimalFloat(body);
    }

    // Read the broader explicit spellings accepted by the Python constructor.
    if (explicit) {
        // Trim the whitespace Python accepts around an explicit float.
        const trimmed: string = body.trim();

        // Read the Python spellings of infinity and not-a-number.
        if (trimmed === "inf" || trimmed === "infinity") {
            // Return the signed infinity.
            return sign * Number.POSITIVE_INFINITY;
        }
        if (trimmed === "nan") {
            // Return the quiet not-a-number value.
            return Number.NaN;
        }

        // Require the Python decimal float grammar.
        if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[-+]?[0-9]+)?$/.test(trimmed)) {
            // Record the unresolved explicit float.
            return INVALID_SCALAR;
        }

        // Return the signed explicit float.
        return sign * Number(trimmed);
    }

    // Read an ordinary decimal or exponent float.
    const parsed: number = Number(body);
    if (Number.isNaN(parsed)) {
        // Record the unresolved implicit float.
        return INVALID_SCALAR;
    }

    // Return the signed numeric value.
    return sign * parsed;
}


/** Parse one base-60 float the way the Python constructor does. */
function parseSexagesimalFloat(value: string): number {
    // Read each colon-separated digit.
    const digits: number[] = value.split(":").map((part: string): number => Number(part));
    let result: number = 0;

    // Combine the digits in base 60.
    for (const digit of digits) {
        // Advance the accumulated value and add the next digit.
        result = result * 60 + digit;
    }

    // Return the combined value.
    return result;
}
