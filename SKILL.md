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
   - Run `get-skill`, `get-memory`, `get-user-tools`, and `get-supervision`.
   - If supervision backlog has items, learn from them first: inspect affected nodes when needed, update file skill with reusable lessons, then call `clear-supervision-backlog`.

2. **Plan small steps**
   - Split the task into discrete, inspectable edits.
   - One step = one concrete Figma delivery, e.g. align one section, adapt one block, fix one typography group.
   - Prefer available user tools for repeated procedural tasks. Avoid large all-in-one `run-script` edits.

3. **Execute one step**
   - If changing existing frames, run `inspect` first.
   - Prefer wrapped tools: `get-variables`, `get-components`, `update-properties`, `resize-node`, `update-fills`, `update-text`, `set-layout`, `create-node`, `move-node`, `delete-node`, `select-node`.
   - Use `run-user-tool` when a registered user tool matches the task. It runs a trusted script against a scoped `nodeId` plus `params`.
   - Use `run-script` only when wrapped tools and registered user tools are insufficient; keep it scoped to the current step.
   - Inspect the screenshot after each visual edit. Screenshot verification is mandatory.
   - If wrong, fix the same step and inspect again. Use `undo` immediately for bad risky edits.

4. **Continue or finish**
   - Continue only after the current step passes visual verification.
   - At the end, call `update-skill` only if there is reusable file-specific learning.
   - After the task is done, start watching unless the user asked not to.

## Watching

Watching is the default post-task loop around designer `change-cycle` events. It is harness-visible and may block the session: tell the user that the agent is watching and they must cancel watching to converse or give a new instruction.

```bash
cast-to-figma watch
cast-to-figma watch --instruction="Apply the same correction to the remaining cards"
```

By default, `watch` exits after 5 seconds without Cast activity. Use `--idle-timeout=N` to change this or `--no-idle-timeout` for a blocking loop.

On every `change-cycle`, the Cast plugin classifies the next action: inspect changed layers first, supervision second, optional instruction third. For actionable cycles, the plan includes highest-level changed-layer inspect targets derived from selection/change ancestry, and the CLI prints ready-to-run `cast-to-figma inspect --node-id ...` commands. Complete them, restart the printed watch command, and keep looping until cancelled. Exit watching automatically when the Cast plugin disconnects, when the user cancels, or when the idle timeout elapses.

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

Reads file-local skill markdown from `figma.root.getPluginData("skill")`.

```bash
cast-to-figma get-skill --agent <agent-id>
```

### update-skill

Writes file-local skill markdown to `figma.root.setPluginData("skill", skillMd)`.

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

Target resolution order: `nodeUrl` → `nodeId` → current selection. When multiple nodes are selected, `inspect` returns `nodes[]`, each with its own screenshot artifact.

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

### get-components

Lists local components and component sets with lean defaults: page summaries and samples. Defaults to the current page; use `--all-pages` only when needed.

```bash
cast-to-figma get-components --agent <agent-id>
cast-to-figma get-components --agent <agent-id> --query button --details
cast-to-figma get-components --agent <agent-id> --all-pages --limit 50
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
cast-to-figma run-script --agent <agent-id> --reason "Read current page name" --source "return figma.currentPage.name;"
```

Notes:
- `await` works inside `source`.
- Return plain JSON data, not live node proxies.
- Use for discovery, reads, and targeted mutations.
- Moving children out of a group may delete/alter the group; do not remove stale nodes blindly.
- Set `layoutSizingHorizontal = "FILL"` only after the node is inside an auto-layout parent.
- Group-to-frame conversion can shift child coordinates; verify and fix after.

### get-memory

Reads rolling file-local Cast memory from `figma.root.getPluginData("memory")`.

```bash
cast-to-figma get-memory --agent <agent-id> --limit 20
```

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

### get-supervision

Reads file-local supervision state: `unsupervised` agent outputs awaiting designer feedback and `backlog` designer corrections awaiting learning.

```bash
cast-to-figma get-supervision --agent <agent-id>
```

### clear-supervision-backlog

Clears supervision backlog after reusable lessons have been written to file skill. Do not call before `update-skill` unless the user explicitly asks to discard corrections.

```bash
cast-to-figma clear-supervision-backlog --agent <agent-id>
```

### clear-supervision

Clears all supervision state. Use only for explicit manual reset.

```bash
cast-to-figma clear-supervision --agent <agent-id>
```

### debug

Developer probe for plugin/Figma API capabilities.

```bash
cast-to-figma debug --agent <agent-id>
```

## Memory and supervision

When Cast is open, it listens to `documentchange` and stores the last ~100 user entries in root plugin data key `memory`. Entries include timestamps, page, current selection, changed nodes, and compact node snapshots with geometry, layout, alignment, appearance, effects, styles, tokens, and fonts where applicable. The feed is byte-bounded (~90 kB) and evicts oldest entries first when full.

When an agent mutates nodes, Cast adds those nodes to `supervision.unsupervised`. When the designer later edits one of those nodes or its descendants, Cast moves it into `supervision.backlog` and writes a `supervision-correction` entry to memory. Memory is continuity; supervision backlog is the actionable learning queue.
