# Commitment Obsidian plugin

Obsidian plugin that derives the commitment graph from saved canonical
Markdown files in a vault. It provides exactly two commands:

- `Commitment: View graph` shows the graph without changing any file.
- `Commitment: Update graph` writes `commitment-graph.json` at the vault root.

A setting selects how the graph is presented. JSON shows the exact projection
text. Tree shows the same graph as a foldable area, program, and project tree.
The setting changes presentation only; `Update graph` always writes the same
JSON. In tree mode, each area, program, and project row also has a pencil or
plus icon that opens its source file or creates the missing container file.

Both commands run on Obsidian Desktop and Obsidian Mobile (iOS). The plugin
uses only Obsidian and browser APIs. It does not use Python, Node.js, Electron,
or files outside the vault.

## Install

1. Run `npm ci` and `npm run build`.
2. Create `<vault>/.obsidian/plugins/commitment-graph/`.
3. Copy the three files from `dist/` into that folder: `main.js`,
   `manifest.json`, and `styles.css`.
4. Enable `Commitment` in **Settings → Community plugins**.

`dist/` is generated and ignored by git. The plugin directory must contain
exactly those three files.

The manifest declares `isDesktopOnly: false` and minimum app version `1.5.7`.

## Build

```bash
npm ci
npm test
npm run build
```

`npm run build` type checks the sources and tests, bundles `dist/main.js` with
esbuild, copies `manifest.json` and `assets/styles.css` into `dist/`, and checks
the bundle for Node or Electron runtime imports. The `yaml`
package is bundled from its browser entry.

`styles.css` ships at the plugin root because Obsidian loads it from the plugin
directory, not from the sources. The stylesheet source lives in `assets/`,
separate from the TypeScript tree.

## Source layout

```text
src/
├── main.ts              # Composition root: the two commands and their wiring.
├── plugin-failure.ts    # Structured plugin failures and diagnostics.
├── graph/               # Derivation: reading, construction, snapshot, store.
├── frontmatter/         # Markdown frontmatter parsing and canonical typing.
├── containers/          # Container identity, paths, templates, file actions.
├── ui/                  # Modal, presenter, foldable tree.
└── settings/            # Persisted settings and the settings tab.
```

`assets/` holds the stylesheet source that the build copies into `dist/`.

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

## Settings

The plugin stores one nested settings value:

```json
{
    "presentation": { "mode": "json" },
    "creation": {
        "idStyle": "none",
        "area": { "templatePath": "", "folderPath": "", "pattern": "Area - {{id}}" },
        "program": { "templatePath": "", "folderPath": "", "pattern": "Program - {{id}}" },
        "project": { "templatePath": "", "folderPath": "", "pattern": "Project - {{id}}" }
    }
}
```

`presentation.mode` is `json` or `html`. For compatibility, an existing
top-level `"mode"` value still loads when the nested value is absent. New
writes always use the nested shape.

For each kind, `templatePath` names a vault Markdown file, `folderPath` names a
vault folder, and `pattern` is the created file name without the `.md`
extension. `{{id}}` in `pattern` is replaced by the identifier. Trimmed empty
strings mean unset, and an empty `pattern` falls back to the default for its
kind. The vault root is the default folder when `folderPath` is empty. Absolute
paths, drive-letter paths, UNC paths, and any path segment equal to `..` are
dropped during read, so they behave as unset. Unknown kind keys and malformed
values are ignored.

`creation.idStyle` controls how `{{id}}` is written in created file names.
`none` keeps the exact identifier; `titleCase` splits on `-` and capitalizes
each word (`some-long-id` → `Some Long Id`). The identifier inside the file
stays exact in both cases. An unknown value reads as `none`. Data files written
before this setting existed gain `none` and the default patterns.

## Container creation

The file icons exist only in tree presentation. A pencil opens the indexed
source file of an explicit area, program, or project. A plus creates the file
for an area or program that exists only through relationships.

The created path is `<folderPath>/<pattern>.md` with `{{id}}` substituted, where
the default pattern is `<Kind> - {{id}}`. An empty folder places the file at the
vault root and creates no folder. Missing parent folders are created.

The exact identifier stays in frontmatter. Only the file name is sanitized:
path separators, `< > : " / \ | ? *`, and control characters become `-`;
consecutive replacement dashes collapse; trailing dots and spaces are
trimmed. If the sanitized identifier is empty, creation aborts without a
write.

Identity frontmatter is plugin-owned. Creation overrides `type`, `id`, and
`area`; sets `program` for a project that has one and removes a stale template
`program` otherwise. For programs and projects, it sets `state: active` when
the template state has no value: absent, null, or an empty string. A real state
value such as `paused` is kept. For an area only, it sets `active: true` when
the template has no `active` value; an explicit boolean is kept. Programs and
projects never gain an `active` key. Every other key and comment is kept.

### Template contract

`templatePath` must point at a vault file. A configured but missing, non-file,
or unreadable template aborts with a notice naming the template path. An unset
template is valid: the plugin writes a frontmatter-only document and opens it.

Placeholders are replaced across the whole template text before the identity
override:

- `{{title}}` becomes the exact identifier.
- `{{date}}` becomes the current local date as `YYYY-MM-DD`.
- `{{time}}` becomes the current local time as `HH:mm`.
- `{{date:FMT}}` and `{{time:FMT}}` use the given `moment` format.
- Any other `{{...}}` text stays literal.

Output uses `\n` line endings. A template without frontmatter gets a canonical
identity block, one blank line, then the body. An empty template produces only
the canonical block. Frontmatter-only output ends with a single newline. A
template body keeps its text except that the separator after the frontmatter
becomes exactly one blank line.

### Creation failures

Creation writes nothing and shows one notice naming the affected path when:

- an existing file or folder already occupies the derived target path;
- a parent path is occupied by a file;
- the configured template is missing, is not a file, or cannot be read;
- the composed document fails canonical validation;
- folder creation or file creation fails.

Creation never overwrites an existing path, including a file that already has
the expected identity.

Template files must live outside graph discovery, either below a hidden path
or a directory named `Templates`, or they must be non-canonical. A canonical
template is itself a graph input and can block graph construction with an empty
or conflicting identity.

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
- The plugin sets no configurable output path, automatic refresh, or extra
  commands. Settings select the presentation shape and the per-kind template
  and folder used by tree file creation.
- Container file creation is not a transaction across folder creation, file
  creation, and opening the file. A later failure does not roll back folders or
  a file that was already created.
