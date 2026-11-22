# `Commitment`

`Commitment` is an [Obsidian] plugin that builds a commitment graph from the
`YAML` frontmatter of saved Markdown files in a vault. It is my minimal system
for organizing work using text files.

The plugin provides three commands:

- `Commitment: View graph` displays the graph without changing any file.
- `Commitment: Update graph` writes a `JSON` representation of the graph in the
  vault.
- `Commitment: Doctor` lists system diagnostics and points to affected files.

Settings control how the graph is displayed and sorted. The `JSON` view of the
graph shows the projection text. The `Tree` view shows a dynamic `HTML` foldable
tree of areas, programs, and projects. Both views sort areas by name or by
project count.

## Concepts

In a nutshell, the system organizes work using three concepts:

- An `area` is an ongoing responsibility or practice. It has no completion
  condition.
- A `project` is a commitment in an `area` that ends when you reach a defined
  completion condition. Every `project` belongs to one `area` and _may_ belong
  to one `program`.
- A `program` is an optional commitment in an `area`. It coordinates two or more
  related projects that share a broader completion condition.

```txt
area
  ├── program
  │     ├── project
  │     └── project
  └── project
```

## Containers

A **container** is a Markdown file that starts with a `YAML` frontmatter block
on the first line. The plugin ignores files without a recognized `type` field.

There are two categories of containers:

- _Commitment containers_ represent an `area`, `program`, or `project` directly.
- _Support containers_ organize related material for one commitment. The
  recognized support types are `meeting`, `note`, `task`, and `board`.

Every `project` in the graph requires its own `project` container file. `area`
and `program` container files are optional, and the plugin derives them from
fields in other containers. Each `area`, `program`, or `project` identifier can
have at most one container file.

### Commitment containers

#### Project

A `project` container represents one project and belongs to one `area`.

```yaml
---
type: project
id:
area:
program:
state:
start:
end:
group:
storage:
---
```

| Field     | Required | Description                                                                                                                |
| :-------- | :------: | :------------------------------------------------------------------------------------------------------------------------- |
| `type`    |   yes    | Set this field to `project`.                                                                                               |
| `id`      |   yes    | Give the project a unique identifier, such as `paper-heterogeneity`.                                                       |
| `area`    |   yes    | Enter the identifier of the parent `area`.                                                                                 |
| `program` |    no    | Enter the identifier of the parent `program`. Leave this field empty or omit it when the project is not part of a program. |
| `state`   |   yes    | Set the current state of the project (i.e., see below).                                                                    |
| `start`   |    no    | Record the date when the project becomes active.                                                                           |
| `end`     |    no    | Record the date when the project ends.                                                                                     |
| `group`   |    no    | Assign a display label to group the project in dashboards (e.g., [Obsidian] [Bases]).                                      |
| `storage` |    no    | Specify the path to a folder that stores non-text files for the project.                                                   |

#### Area

An `area` container is optional. Create it when an ongoing responsibility needs
its own file (e.g., for storing meetings, notes, strategic plans, or other
supporting material that is not directly part of a project). The plugin also
adds an `area` to the graph when a `project`, `program`, or support container
references its identifier.

```yaml
---
type: area
id:
active:
group:
---
```

| Field    | Required | Description                                                                                                                                  |
| :------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`   |   yes    | Set this field to `area`.                                                                                                                    |
| `id`     |   yes    | Give the area a unique identifier.                                                                                                           |
| `active` |   yes    | State whether the area is currently relevant. An area has no completion condition, so it uses `active` as a boolean flag instead of `state`. |
| `group`  |    no    | Assign a display label to group the area in dashboards.                                                                                      |

#### Program

A `program` container is optional. Create it when a program needs its own file
(e.g., managing a set of closely related projects). The plugin also adds a
`program` to the graph when a `project` names it in the `program` field.

Every project in a program must declare the same `area` as the program. If a
program coordinates fewer than two projects, `Commitment: Doctor` reports a
warning.

```yaml
---
type: program
id:
area:
state:
start:
end:
group:
---
```

| Field   | Required | Description                                                |
| :------ | :------: | :--------------------------------------------------------- |
| `type`  |   yes    | Set this field to `program`.                               |
| `id`    |   yes    | Give the program a unique identifier.                      |
| `area`  |   yes    | Enter the identifier of the parent `area`.                 |
| `state` |   yes    | Set the current state of the program.                      |
| `start` |    no    | Record the date when the program becomes active.           |
| `end`   |    no    | Record the date when the program ends.                     |
| `group` |    no    | Assign a display label to group the program in dashboards. |

#### States

Use these values for the `state` field in `project`, `program`, and `task`
containers:

- `triage` means the commitment awaits evaluation or acceptance.
- `planned` means you accepted the commitment, but work has not started.
- `active` means work is in progress.
- `paused` means work is on hold.
- `done` means the commitment met its completion condition.
- `dropped` means the commitment ended before completion.

### Support containers

Support containers attach supporting information to one commitment instance.
Every support container requires two dependent fields:

- `level` names the concept type of the target commitment. Valid values are
  `area`, `program`, and `project`.
- `anchor` names the `id` of that target commitment.

When a support container sets `level: area`, the plugin includes that `area` in
the graph even if no other file declares it. In other words, nothing in the
system can exist outside an `area`. When a support container sets `level:
program` or `level: project`, the target `program` or `project` must exist in
the graph. If `level` or `anchor` is missing, invalid, or points to an unknown
`program` or `project`, the plugin omits the file from the graph and
`Commitment: Doctor` reports it.

#### Meeting

A `meeting` container holds information for a scheduled conversation that
supports one commitment.

```yaml
---
type: meeting
level:
anchor:
scheduled:
location:
---
```

| Field       | Required | Description                                                          |
| :---------- | :------: | :------------------------------------------------------------------- |
| `type`      |   yes    | Set this field to `meeting`.                                         |
| `level`     |   yes    | Set the target concept type to `area`, `program`, or `project`.      |
| `anchor`    |   yes    | Enter the identifier of the target commitment.                       |
| `scheduled` |   yes    | Record the date and time of the meeting, such as `2026-03-15 14:00`. |
| `location`  |    no    | Record the room or online link for the meeting.                      |

#### Note

A `note` container holds supplementary information for one commitment. Notes
that do not belong to a commitment should omit `type: note`.

```yaml
---
type: note
level:
anchor:
date:
---
```

| Field    | Required | Description                                                       |
| :------- | :------: | :---------------------------------------------------------------- |
| `type`   |   yes    | Set this field to `note`.                                         |
| `level`  |   yes    | Set the target concept type to `area`, `program`, or `project`.   |
| `anchor` |   yes    | Enter the identifier of the target commitment.                    |
| `date`   |   yes    | Record the creation date of the note, such as `2026-03-15 09:30`. |

#### Task

A `task` container holds one actionable piece of work for a commitment.

```yaml
---
type: task
level:
anchor:
state:
date:
---
```

| Field    | Required | Description                                                       |
| :------- | :------: | :---------------------------------------------------------------- |
| `type`   |   yes    | Set this field to `task`.                                         |
| `level`  |   yes    | Set the target concept type to `area`, `program`, or `project`.   |
| `anchor` |   yes    | Enter the identifier of the target commitment.                    |
| `state`  |   yes    | Set the current state of the task.                                |
| `date`   |   yes    | Record the creation date of the task, such as `2026-03-15 09:30`. |

#### Board

A `board` container holds a task board for one commitment. You can add
plugin-specific fields such as `kanban-plugin: board` when needed.

```yaml
---
type: board
level:
anchor:
---
```

| Field    | Required | Description                                                     |
| :------- | :------: | :-------------------------------------------------------------- |
| `type`   |   Yes    | Set this field to `board`.                                      |
| `level`  |   Yes    | Set the target concept type to `area`, `program`, or `project`. |
| `anchor` |   Yes    | Enter the identifier of the target commitment.                  |

## License

- The plugin source code in this repository is licensed under the [MIT
  license](https://opensource.org/license/mit).
- <p class="license-cc" xmlns:cc="https://creativecommons.org/ns" xmlns:dct="https://purl.org/dc/terms/"><a property="dct:title" rel="cc:attributionURL" href="https://github.com/mihaiconstantin/commitment-obsidian">The documentation and other materials</a> by <a rel="cc:attributionURL dct:creator" property="cc:attributionName" href="https://mihaiconstantin.com">Mihai Constantin</a> are licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">CC BY 4.0</a>.</p>

<!-- Links. -->
[Obsidian]: https://obsidian.md
[Bases]: https://obsidian.md/help/bases
