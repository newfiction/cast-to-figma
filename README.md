![Cast to Figma](assets/cover.png)

# Cast to Figma

Local CLI, bridge, and agent skill for controlling Figma through the [Cast Figma plugin](https://www.figma.com/community/plugin/1398410342518853126).

### Cast lets AI agents inspect, generate, and edit designs using the context of your actual Figma file: including your edits, naming patterns, layout habits, and file-specific conventions.


**File skill.** Cast helps to build a file-local skill as you work. When you correct an agent’s output, those corrections become reusable learning guidance for future edits in the same file.

**Shorter prompts.** Agents remember recent file activity, so you can ask for changes without re-explaining the full design context every time.

**Real-time coworking.** Keep designing while the agent helps in the background: rename layers, assign tokens, clean up structure, adapt repeated elements, or apply feedback across the file.

**File tools.** Create procedural tools for the file: generate graphics, apply tokens, batch-edit layouts, adapt designs, and automate repeated tasks without running expensive inference for every single operation.

## Install

### 1. Open the Figma plugin

Install and open the [Cast plugin](https://www.figma.com/community/plugin/1398410342518853126) in Figma Desktop.

### 2. Install the CLI & skill

```bash
npm install -g github:newfiction/cast-to-figma
cast-to-figma install-cli-skill --folder {agent_skill_folder}
```

`{agent_skill_folder}` stands for agent skills reference folder, e.g:

```bash
cast-to-figma install-cli-skill --folder ~/.claude/skills
```

## Usage

```bash
cast-to-figma status
cast-to-figma ping
cast-to-figma inspect --depth 3 --scale 1
cast-to-figma get-memory --limit 10
cast-to-figma get-memory --trait-id event_123_trait_fills --detail
cast-to-figma get-variables --query accent
cast-to-figma get-components --query button
cast-to-figma update-text --node-id 12:34 --text "Hello"
cast-to-figma cowork
cast-to-figma cowork --instruction="Apply the same correction to the remaining cards" --timeout 600 --wait 3
```

The CLI auto-starts a local bridge on `127.0.0.1:7777`. Override the port when needed:

```bash
CAST_BRIDGE_PORT=7778 cast-to-figma status
```

## Commands

- `status` — check bridge/plugin connection
- `ping` — return page/file metadata
- `inspect` — inspect node architecture and save a screenshot artifact
- `get-variables` — list local variables with lean summaries and optional drill-down filters
- `get-components` — list local components/component sets with lean summaries and optional drill-down filters
- `list-pages` — list open file pages
- `get-skill`, `update-skill` — read/write file-local agent skill markdown
- `get-memory`, `clear-memory` — read/clear hyperlink-style file-local Cast memory
- `clear-agent-corrections` — clear pending agent correction summaries
- `update-properties`, `resize-node`, `update-fills`, `update-text`, `set-layout` — edit existing nodes
- `clone-node`, `clone-layout`, `clone-traits` — duplicate nodes or copy selected layout/style/history traits
- `create-node`, `move-node`, `delete-node`, `select-node` — manipulate nodes
- `list-user-tools`, `get-user-tools`, `get-user-tool` — inspect file-local procedural tools
- `add-user-tool`, `edit-user-tool`, `delete-user-tool`, `run-user-tool` — manage and execute file-local procedural tools
- `run-script` — execute scoped JavaScript in the Figma plugin context
- `undo` — undo the last Figma operation
- `cowork` — real-time coworking: wait for one designer cycle, print memory/corrections first, then exit
- `install-cli-skill --folder {agent_skill_folder}` — install the bundled CLI skill into an agent skill folder
- `debug` — developer probe

### Help

```bash
cast-to-figma help
```

## Memory

Cast memory is file-local and hyperlink-style:

- `user.nodes` — recent native Figma node IDs edited by the designer.
- `user.traits` — before → after changes such as fill, text, spacing, layout, styles, and variables.
- `user.events` — edit moments with compact node snapshots and linked trait IDs.
- `agent.nodes` — agent-touched nodes awaiting feedback, via `get-memory --source agent`.
- `agent.corrections` — designer corrections to agent-touched nodes, via `get-memory --source agent`.

Examples:

```bash
cast-to-figma get-memory --limit 10
cast-to-figma get-memory --node-id 12:34 --detail
cast-to-figma get-memory --trait-id event_123_trait_fills --detail
cast-to-figma get-memory --source all --detail
```

Common node-edit tools resolve targets as `nodeId → current selection → recent user-memory edited node`; destructive/broad tools still require explicit IDs.

`cowork` prints recent memory traits and edited node IDs first, then agent corrections and changed-layer inspect targets, so external agents can react to what the designer just changed.

## Agent skill

![Scheme](assets/scheme.png)

*The installed skill instructs agents to*:
- inspect selected nodes and screenshots before visual edits
- read file-local skill, hyperlink memory, user tools, and agent-memory context
- make small, verifiable design changes
- use wrapped Cast tools before raw scripts
- learn from designer corrections
- start coworking for designer change cycles after completing work

## License

MIT
