/**
 * Fail the build when the production bundle acquires a Node built-in or
 * Electron runtime import, which would break Obsidian Mobile.
 */

import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

// Read the production bundle as text.
const bundle = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

// Collect every runtime module specifier that the bundle requests.
const SPECIFIER_PATTERN = /(?:require\(\s*|from\s*)["']([^"']+)["']/g;
const specifiers = new Set();
for (const match of bundle.matchAll(SPECIFIER_PATTERN)) {
    // Record the requested module specifier.
    specifiers.add(match[1]);
}

// Build the full set of Node built-in names, including the `node:` forms.
const builtins = new Set();
for (const name of builtinModules) {
    // Record the bare and prefixed built-in names.
    builtins.add(name);
    builtins.add(`node:${name}`);
}

// Reject each Node built-in or Electron runtime import.
for (const specifier of specifiers) {
    // Skip the Obsidian API, which the host supplies.
    if (specifier === "obsidian") {
        // Continue with the next specifier.
        continue;
    }

    // Detect the Electron runtime and every Node built-in.
    if (specifier === "electron" || builtins.has(specifier)) {
        // Report the forbidden import and fail the build.
        console.error(`Forbidden runtime import in dist/main.js: ${specifier}`);
        process.exit(1);
    }
}

// Report that the bundle is safe for the mobile sandbox.
console.log("Bundle contains no Node or Electron runtime import.");
