# Commitment Obsidian plugin

Obsidian plugin that derives the commitment graph from saved canonical
Markdown files in a vault. It provides two commands:

- `Commitment: View graph` shows the graph without changing any file.
- `Commitment: Update graph` writes `commitment-graph.json` at the vault root.

A setting selects how the graph is presented. JSON shows the exact projection
text. Tree shows the same graph as a foldable area, program, and project tree.

The structure is given by the `archive/domain/domain.md` file.
