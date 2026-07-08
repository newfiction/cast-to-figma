---
name: cast-to-figma
description: Use Cast to execute Figma tools through a local bridge.
version: 0.1.0
requiresCli: ">=0.1.0"
cliPackage: "@newfiction/cast-to-figma"
cliBinary: "cast-to-figma"
---

# Cast to Figma

Cast is a local CLI + Figma plugin workflow for inspecting and editing the open Figma file. Prefer Cast for Figma canvas manipulation when the Cast plugin is connected. Fall back to other Figma tooling only when Cast is unavailable or lacks the needed capability.

## CLI

Use the npm binary:

```bash
cast-to-figma status
cast-to-figma inspect --depth 3 --scale 1
CAST_BRIDGE_PORT=7778 cast-to-figma status
```

The CLI auto-starts the local bridge when needed. The bridge defaults to port `7777`; override it with `CAST_BRIDGE_PORT`.

Pass `--agent <agent-id>` when useful so the Cast panel can show which harness is driving Figma. Suggested ids include `pi`, `openai`, `gpt`, `claude`, and `gemini`.

## Workflow

Use this workflow for every Cast design task:

1. **Read file context**
   - Run `get-skill`, `get-memory`, and `get-user-tools`.
   - If the user says “this”, “that”, “these”, “here”, “selected”, “current”, or “what I changed”, run default `inspect` before planning. It resolves `nodeUrl` → `nodeId` → current selection → recent user-memory edited nodes.
   - In fresh files or empty skills, target selected/recently edited frames first. If no selection exists, use `get-memory --limit 20`; do not search the whole file unless needed or asked.
   - If recalled correction summaries exist, treat them as background unless the user asks to learn from or clear them.

2. **Plan small steps**
   - Split the task into discrete, inspectable edits.
   - One step = one concrete Figma delivery, e.g. align one section, adapt one block, fix one typography group.
   - For reference-based edits, inspect reference and target, change only explicitly requested traits, and preserve everything else. Default to strict fidelity, not reinterpretation.
   - Prefer available user tools for repeated procedural tasks. Avoid large all-in-one `run-script` edits.

3. **Execute one step**
   - If changing existing frames, run `inspect` first.
   - Prefer wrapped tools: `get-variables`, `set-variables`, `set-styles`, `get-components`, `update-properties`, `resize-node`, `update-fills`, `update-text`, `set-layout`, `clone-node`, `clone-layout`, `clone-traits`, `create-node`, `move-node`, `delete-node`, `select-node`.
   - Use `run-user-tool` when a registered user tool matches the task. It runs a trusted script against a scoped `nodeId` plus `params`.
   - Use `run-script` only when wrapped tools and registered user tools are insufficient; keep it scoped to the current step and always pass a required short `--reason` label of 6 words or fewer, e.g. `--reason "Created 10 frames"`. For anything multiline or quote-heavy, write a temp `.js` file and call `run-script --source-file /tmp/name.js` instead of embedding code in the shell.
   - Inspect the screenshot after each visual edit. Screenshot verification is mandatory.
   - If wrong, fix the same step and inspect again. Use `undo` immediately for bad risky edits.

4. **Continue or finish**
   - Continue only after the current step passes visual verification.
   - After finishing any task or task bundle, analyze the workflow and decide whether any reusable process, correction, or file-specific pattern could improve the file skill.
   - Ask the user if they want to add that learning before calling `update-skill`; never update the skill automatically.
   - After the task is done, start coworking unless the user asked not to.

## Coworking

`cowork` is the default post-task loop around designer `change-cycle` events. The interface label is `Real-time coworking`.

External harness flow: Pi runs `cowork`, the CLI waits for one simple cowork event, prints recalled memory and correction summaries, then exits. Pi decides what to do and starts `cowork` again.

Internal harness flow: the in-plugin chat calls the `cowork` tool, waits for a cycle, runs one internal inference turn, acts, then resumes coworking if still active.

```bash
cast-to-figma cowork --agent pi
cast-to-figma cowork --agent pi --instruction="Apply the same correction to the remaining cards" --timeout 600 --wait 3 --target 12:34
```

Parameters: `--instruction`, `--timeout` (default 600 seconds), `--wait` (default 3 seconds after designer stops editing), `--target`, `--json`, and `--agent`.

On every completed cycle, Cast returns lightweight recalled context. There is no built-in correction-first plan; corrections are just pending context unless the user requests action.

## Tools

### status

Checks whether the bridge and Cast plugin are connected.

```bash
cast-to-figma status
```

### ping

Checks connection and returns page/file metadata.

```bash
cast-to-figma ping --agent <agent-id>
```

Returns `{ pong, pageName, fileKey, pluginVersion }`.

### get-skill

Reads file-local skill markdown from Cast shared plugin data: namespace `cast`, key `skill` (with legacy private-data fallback).

```bash
cast-to-figma get-skill --agent <agent-id>
```

### update-skill

Writes file-local skill markdown to Cast shared plugin data: namespace `cast`, key `skill`.

```bash
cast-to-figma update-skill --agent <agent-id> --skill-md-file /path/to/skill.md
```

### inspect

Returns node architecture plus a PNG screenshot. Use `inspect` to identify nodes and verify visual edits.

`inspect` emits a hard visual contract:

```txt
VISUAL_CHECK_REQUIRED
You must inspect the screenshot before making visual edits.
```

Honor this contract. Read the returned `screenshotPath` before editing whenever your harness supports local image reads. If `VISUAL_ARTIFACT_TOO_LARGE` appears, rerun the printed smaller-scale inspect command.

Target resolution order: `nodeUrl` → `nodeId` → current selection → recent user-memory edited nodes. When multiple nodes are selected or resolved from memory, `inspect` returns `nodes[]`, each with its own screenshot artifact. Common non-destructive/edit tools such as `update-text`, `update-fills`, `update-properties`, `resize-node`, `set-layout`, and `select-node` also resolve `nodeId` → current selection → recent user-memory edited node. Destructive or broad tools should still pass explicit ids.

```bash
cast-to-figma inspect --agent <agent-id> --node-id 12:34 --mode default --depth 3 --scale 1
```

Use `--mode deep` for more readable Figma properties. If a `nodeUrl` points to a different file, open that file in Figma first.

### get-variables

Lists local Figma variables with lean defaults: collection summaries, type counts, modes, and small samples. Drill down with filters before requesting values.

```bash
cast-to-figma get-variables --agent <agent-id>
cast-to-figma get-variables --agent <agent-id> --query accent --limit 20
cast-to-figma get-variables --agent <agent-id> --collection Theme --include-values
```

### set-variables

Creates or updates variable collections, modes, and variables generically. Upserts by name: reuses existing collections/variables, adds missing modes, and overwrites mode values. COLOR values accept a hex string or `{r,g,b,a}`; any type accepts an alias `{"alias":"Collection/Name"}`. Optional `scopes` and `description` per variable. If `modes` is omitted it is inferred from the first variable's value keys.

```bash
cast-to-figma set-variables --agent <agent-id> --data '{"collections":[{"name":"Theme","modes":["Light","Dark"],"variables":[{"name":"fill","type":"COLOR","description":"Surface background","values":{"Light":"#FFFFFF","Dark":"#000000"}},{"name":"content","type":"COLOR","values":{"Light":"#000000","Dark":"#FFFFFF"}}]},{"name":"Space","variables":[{"name":"gap","type":"FLOAT","scopes":["GAP"],"values":{"Mode 1":8}},{"name":"gap-alias","type":"FLOAT","values":{"Mode 1":{"alias":"Space/gap"}}}]}]}'
```

### set-styles

Creates or updates local text, paint, and effect styles generically. Upserts by name. Each style accepts an optional `description`.

- `text[]`: `{ name, fontFamily, fontStyle?, fontSize?, lineHeight?, letterSpacing?, paragraphSpacing?, textCase?, textDecoration?, description?, bind? }`. `lineHeight` number → `PIXELS`; `letterSpacing` number → `PERCENT`; or pass full `{unit,value}`. `bind` binds variables by path: `{ fontSize, lineHeight, letterSpacing }`.
- `paint[]`: `{ name, description?, paints: [ "#RRGGBB" | {r,g,b,a} | {variable:"Collection/Name"} ] }`.
- `effect[]`: `{ name, description?, effects: [ ...raw Figma Effect ] }`.

```bash
cast-to-figma set-styles --agent <agent-id> --data '{"text":[{"name":"Body","fontFamily":"Helvetica Neue","fontStyle":"Regular","description":"Default body text","bind":{"fontSize":"Typography/body","lineHeight":"Typography/body-leading"}}],"paint":[{"name":"Accent","description":"Brand accent","paints":[{"variable":"Theme/fill"}]}]}'
```

### get-components

Lists local components and component sets with lean defaults: page summaries and samples. Defaults to the current page; use `--all-pages` only when needed.

```bash
cast-to-figma get-components --agent <agent-id>
cast-to-figma get-components --agent <agent-id> --query button --details
cast-to-figma get-components --agent <agent-id> --all-pages --limit 50
```

### clone-node

Duplicates a node/frame with all content, layout, styling, variables, and optional parent/index/position/text overrides.

```bash
cast-to-figma clone-node --agent <agent-id> --node-id 12:34 --x 100 --y 200
```

### clone-layout

Copies only layout behavior from a reference node to a target node: auto-layout mode, padding, gap, sizing modes, alignment, constraints. It does not copy text, fills, effects, or imagery.

```bash
cast-to-figma clone-layout --agent <agent-id> --from-node-id 12:34 --to-node-id 56:78
```

### clone-traits

Copies selected traits from a reference node and/or applies memory history trait IDs to a target node. Node traits apply first; memory traits override matching properties. It never copies text content unless `text` is explicitly requested.

```bash
cast-to-figma clone-traits --agent <agent-id> --from-node-id 12:34 --to-node-id 56:78 --traits typography,fills,radius
cast-to-figma clone-traits --agent <agent-id> --to-node-id 56:78 --trait-id event_123_trait_fills
```

Supported traits include `typography`, `fills`, `strokes`, `effects`, `radius`, `spacing`, `layout`, `text-style`, `variables`, `opacity`, `geometry`, and `text`.

### cowork

Starts/stops real-time coworking.

```bash
cast-to-figma cowork --agent <agent-id> --timeout 600 --wait 3
cast-to-figma cowork --agent <agent-id> --instruction "Apply the same correction" --target 12:34
```

### undo

Undoes the last Figma operation.

```bash
cast-to-figma undo --agent <agent-id>
```

### list-pages

Lists open file pages.

```bash
cast-to-figma list-pages --agent <agent-id>
```

### update-properties

Updates common scalar properties: `name`, `x`, `y`, `width`, `height`, `opacity`, `visible`, `rotation`.

```bash
cast-to-figma update-properties --agent <agent-id> --node-id 12:34 --name Card --x 100
```

### resize-node

Resizes a node to exact dimensions.

```bash
cast-to-figma resize-node --agent <agent-id> --node-id 12:34 --width 320 --height 180
```

### update-fills

Replaces fills with solid colors. Accepted fill inputs:

- Simplified 0..1 RGBA: `{ "r": 1, "g": 0, "b": 0, "a": 1 }`
- Native Figma solid paint copied from `inspect`: `{ "type": "SOLID", "color": { "r": 1, "g": 0, "b": 0 }, "opacity": 1 }`
- Design-token variables: `{ "variable": "Collection/Name" }`, `{ "token": "Collection/Name" }`, `{ "variableId": "..." }`, `{ "variableKey": "..." }`, or `{ "binding": { "collection": "Collection", "variable": "Name" } }`

Prefer token/variable inputs when matching design-system colors. When copying fills from `inspect`, pass the paint object as-is; Cast accepts its nested `color.r/g/b` shape.

```bash
cast-to-figma update-fills --agent <agent-id> --node-id 12:34 --data '{"nodeId":"12:34","fills":[{"r":1,"g":0,"b":0,"a":1}]}'
cast-to-figma update-fills --agent <agent-id> --data '{"nodeId":"12:34","fills":[{"type":"SOLID","color":{"r":1,"g":0,"b":0},"opacity":1}]}'
cast-to-figma update-fills --agent <agent-id> --data '{"nodeId":"12:34","fills":[{"variable":"Colors/Accent"}]}'
```

### update-text

Updates text content and/or font size on a text node.

```bash
cast-to-figma update-text --agent <agent-id> --node-id 12:34 --text "Hello" --font-size 24
```

### set-layout

Sets common auto-layout properties on frame-like nodes.

```bash
cast-to-figma set-layout --agent <agent-id> --data '{"nodeId":"12:34","layoutMode":"VERTICAL","primaryAxisSizingMode":"AUTO","counterAxisSizingMode":"FIXED","paddingTop":16,"paddingRight":16,"paddingBottom":16,"paddingLeft":16,"itemSpacing":8}'
```

### create-node

Creates a `RECTANGLE`, `ELLIPSE`, `FRAME`, or `TEXT` node on the current page or inside `parentId`.

```bash
cast-to-figma create-node --agent <agent-id> --type FRAME --name Card --x 0 --y 0 --width 320 --height 180
```

### move-node

Moves a node to another parent, optionally at `index`.

```bash
cast-to-figma move-node --agent <agent-id> --node-id 12:34 --parent-id 56:78 --index 0
```

### delete-node

Deletes a node.

```bash
cast-to-figma delete-node --agent <agent-id> --node-id 12:34
```

### select-node

Selects a node and zooms to it unless `zoom` is `false`.

```bash
cast-to-figma select-node --agent <agent-id> --node-id 12:34 --data '{"nodeId":"12:34","zoom":true}'
```

### list-user-tools

Lists compact user tool manifests registered in the current Figma file.

```bash
cast-to-figma list-user-tools --agent <agent-id>
```

### get-user-tools

Returns launch-ready user tool context. Call with `get-skill` and `get-memory` at session start so the harness knows which file-local procedural tools exist.

```bash
cast-to-figma get-user-tools --agent <agent-id>
```

### get-user-tool

Reads one user tool manifest and source for inspection/editing.

```bash
cast-to-figma get-user-tool --agent <agent-id> --tool-id generate-quadtree
```

### add-user-tool

Adds a trusted file-local user tool. The source should define `async function run({ figma, node, params, tokens, log }) { ... }`.

```bash
cast-to-figma add-user-tool --agent <agent-id> --manifest-file ./tool.json --source-file ./tool.js
```

### edit-user-tool

Edits an existing user tool. Tool ids are immutable; delete and add a new tool to rename.

```bash
cast-to-figma edit-user-tool --agent <agent-id> --tool-id generate-quadtree --manifest-file ./tool.json --source-file ./tool.js
```

### delete-user-tool

Deletes a file-local user tool and its stored source.

```bash
cast-to-figma delete-user-tool --agent <agent-id> --tool-id generate-quadtree
```

### run-user-tool

Runs a trusted user tool script against a scoped node/subtree. Mode A passes raw `figma`, so the `nodeId` scope is intentional but not security-enforced.

```bash
cast-to-figma run-user-tool --agent <agent-id> --tool-id generate-quadtree --node-id 12:34 --params '{"depth":4}'
```

### run-script

Executes JavaScript inside the plugin Figma context. `source` is wrapped in `async function() { ... }`; use `return` to send JSON-safe data back.

```bash
cast-to-figma run-script --agent <agent-id> --reason "Checked page name" --source "return figma.currentPage.name;"
cast-to-figma run-script --agent <agent-id> --reason "Systemized button variants" --source-file /tmp/cast_button_systemize.js
```

Notes:
- `--reason` is required and appears in the Cast UI feed instead of a generic “Ran script” row. Write it as a concise completed activity: max 6 words and 64 characters, e.g. `"Created 10 frames"`.
- Prefer `--source-file` for multiline scripts, quote-heavy code, JSON literals, template strings, or any script longer than a one-liner. This avoids shell interpolation/quoting failures; write the JavaScript to `/tmp/...js` and pass the file path.
- `await` works inside `source` / `--source-file`.
- Return plain JSON data, not live node proxies.
- Use for discovery, reads, and targeted mutations.
- Moving children out of a group may delete/alter the group; do not remove stale nodes blindly.
- Set `layoutSizingHorizontal = "FILL"` only after the node is inside an auto-layout parent.
- Group-to-frame conversion can shift child coordinates; verify and fix after.

### get-memory

Reads hyperlink-style file-local Cast memory from Cast shared plugin data: namespace `cast`, key `memory` (with legacy private-data fallback). Default source is user/designer actions.

```bash
cast-to-figma get-memory --agent <agent-id> --limit 20
cast-to-figma get-memory --agent <agent-id> --node-id 12:34 --detail
cast-to-figma get-memory --agent <agent-id> --trait-id event_123_trait_fills --detail
cast-to-figma get-memory --agent <agent-id> --event-id event_123 --detail
cast-to-figma get-memory --agent <agent-id> --source agent
cast-to-figma get-memory --agent <agent-id> --source all
```

Memory is structured as:

- `user.nodes`: recent native Figma node IDs edited by the designer.
- `user.traits`: before → after property changes, e.g. fill, type, spacing, layout.
- `user.events`: full edit moments containing snapshots and linked trait IDs.
- `agent.nodes`: agent-touched nodes awaiting feedback.
- `agent.corrections`: designer corrections to agent-touched nodes.

**Digest format.** Compact memory returns one short, intentful line per change, with display times like `7:23PM`:

- **Created** — `7:23PM Created 12:34 "Ellipse 1" x -1713, y -12208, 1262×1262, #D9D9D9` (initial properties only, no `null`).
- **Deleted** — `7:23PM Deleted 12:34 "Ellipse 1"` (no property noise).
- **Edited** — `7:23PM 12:34 "Ellipse 2" fill #D9D9D9 → #FF0000 (traitId)`.

Colors render as hex (`#RRGGBB`). Bursts of `documentchange` events for the same node within a ~450ms quiet window are **coalesced** into one net line, so a duplicate-drag (create + drag + auto-rename) reads as a single `Created` line at its settled position/name instead of raw move/rename churn. Drill into full snapshots with `--detail` plus `--node-id`, `--trait-id`, or `--event-id`.


### clear-memory

Clears file-local Cast memory. Use only when the user explicitly asks.

```bash
cast-to-figma clear-memory --agent <agent-id>
```

### clear-chat

Clears stored internal harness chat history/context while preserving high-level context rebuilt from the system prompt, file skill, and edit history memory.

```bash
cast-to-figma clear-chat --agent <agent-id>
```

### clear-agent-corrections

Clears pending agent correction summaries when the user asks to discard or reset them.

```bash
cast-to-figma clear-agent-corrections --agent <agent-id>
```

### debug

Developer probe for plugin/Figma API capabilities.

```bash
cast-to-figma debug --agent <agent-id>
```

## Memory and recall

When Cast is open, it listens to `documentchange` and stores user/designer edits in Cast shared plugin data: namespace `cast`, key `memory`. Memory is byte-bounded (~90 kB) and evicts oldest details first when full.

Memory has three user layers:

- `user.events`: edit moments with absolute ISO timestamps, display times like `7:23PM`, page, selection context, changed nodes, and compact snapshots.
- `user.nodes`: recent native Figma node IDs edited by the designer; these can be used as default context when no selection exists.
- `user.traits`: extracted before → after changes such as fill, stroke, text, typography, spacing, layout, radius, geometry, styles, and variables.

Tool responses may include a compact `recall` envelope with memory and correction summaries only. Use `get-memory --detail` with a `nodeId`, `traitId`, or `eventId` to inspect full linked memory details.

The file skill is also stored in Cast shared plugin data: namespace `cast`, key `skill`. Both shared keys keep legacy private plugin-data fallbacks for older files.

Agent edits are tracked separately as agent memory. `get-memory --source agent` exposes them as `agent.nodes` and `agent.corrections`; default `get-memory` remains user/designer memory.
