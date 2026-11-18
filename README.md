# Commitment Obsidian plugin

Obsidian plugin that derives the commitment graph from saved canonical
Markdown files in a vault. It provides exactly two commands:

- `Commitment: View graph` shows the graph without changing any file.
- `Commitment: Update graph` writes `commitment-graph.json` at the vault root.

Both commands run on Obsidian Desktop and Obsidian Mobile (iOS). The plugin
uses only Obsidian and browser APIs. It does not use Python, Node.js, Electron,
or files outside the vault.

## Install

1. Build the plugin, or use an existing `main.js`.
2. Create `<vault>/.obsidian/plugins/commitment-graph/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Enable `Commitment` in **Settings → Community plugins**.

The manifest declares `isDesktopOnly: false` and minimum app version `1.5.7`.

## Build

```bash
npm ci
npm test
npm run build
```

`npm run build` type checks the sources and tests, bundles `main.js` with
esbuild, and checks the bundle for Node or Electron runtime imports. The `yaml`
package is bundled from its browser entry.

## Saved-file semantics

- The plugin reads saved vault content through `Vault.read`. Unsaved editor
  changes and editor buffers are not read. The modal label states that the graph
  comes from saved files.
- Markdown discovery accepts `.md` and `.markdown` case-insensitively. Files
  with any hidden path segment are skipped. Files below a directory named
  exactly `Templates` are skipped. A file named `Templates.md` is read.
- Only exact canonical `type` values `area`, `program`, `project`, `meeting`,
  `note`, `task`, and `board` enter the graph. Tags, filenames, `context`,
  `key`, `state`, and `active` do not affect membership.
- `commitment-graph.json` is never an input. View recomputes the graph from the
  Markdown files.
- The JSON uses the direct projection, four-space indentation, literal Unicode,
  code-point ordering, and one trailing newline, matching
  `json.dumps(..., ensure_ascii=False, indent=4) + "\n"`.

## Update behavior

`Commitment: Update graph` re-enumerates and rereads every eligible saved file
after building the graph. It aborts and writes nothing when a path was added,
removed, changed, or became unreadable. It then:

- creates `commitment-graph.json` when the file is absent;
- reports `unchanged` and writes nothing when the bytes are identical; or
- replaces the file through `vault.process` when the content differs.

Update never modifies Markdown files.

## Warnings and errors

Blocking parse, read, or graph errors show one notice with the affected path.
No partial graph is shown and no output is written.

Nonblocking findings appear below the JSON in the modal. `unresolved_anchor`
names support containers without a usable target. `underfilled_program` names
programs with fewer than the recommended two projects.

## Known limits

- Real Obsidian Desktop and iOS behavior is not verified by this repository's
  unit tests. The modal, command registration, and vault APIs are exercised
  through stubs only.
- The YAML parser is configured to match graph-relevant Python behavior, but
  full `ruamel.yaml` equivalence is not established. The release gate in the
  parser decision record still requires a comparison against the Python parser
  on a real vault.
- A YAML `%YAML` directive inside a frontmatter block is rejected. A bounded
  frontmatter block cannot contain the document-start line a directive
  requires, and the Python parser also rejects such blocks. Saved frontmatter
  is parsed as YAML 1.2.
- Explicit `!!str` values are treated as strings. The Python round-trip parser
  returns a tagged scalar for that spelling and rejects it as an identifier.
- An unresolvable explicit `!!int`, `!!float`, or `!!bool` value on a
  graph-relevant field blocks the graph with a path-scoped error. The same
  value on unrelated metadata is retained as a placeholder and ignored.
- The alias limit is disabled, so valid vaults with many aliases load. Hostile
  or malformed YAML can consume excessive time or memory.
- Destination conflict detection is best effort, not a byte-level transaction.
  Distinct invalid UTF-8 sequences can decode alike, BOM handling can be lossy,
  and ABA changes can evade the checks. A physical write failure may not
  preserve the old file.
- Obsidian's public file model does not expose portable symlink detection, so
  symlink exclusion differs from the Python CLI. Hidden paths are skipped.
- The plugin sets no settings, configurable output path, automatic refresh, or
  extra commands.
