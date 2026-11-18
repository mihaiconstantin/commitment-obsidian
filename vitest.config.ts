import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    test: {
        environment: "happy-dom",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/support/dom.ts"],
    },
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL("./tests/stubs/obsidian.ts", import.meta.url)),
        },
    },
});
