# Agent Note: MCP server configuration and management

Status: proposed

English | [中文](2026-09-22-mcp-config-and-management.zh.md)

## Problem

[`dsh-mcp-client`](../../../../packages/mcp/mcp-client/README.md) already bridges an external Model Context Protocol server's tools into `ctx.tools`, and it is production-quality on the wire: stdio and Streamable HTTP, a reconnect supervisor with a bounded attempt budget, generation-wise atomic tool-set swaps, and scrubbed child environments. The gap is not the protocol. It is how a server gets connected in the first place.

One server is one plugin row, written by hand into a profile patch:

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

That shape costs more than it should, in three directions:

The bridge's own decisions are recorded in the [MCP client plugin](../../implemented/feature/2026-07-07-mcp-client-plugin.md) and [auto-reconnect](../../implemented/feature/2026-08-06-mcp-client-auto-reconnect.md) Agent Notes, and none of them is reopened here; this proposal adds the layer in front of them.

- **A user cannot manage servers.** Adding one means finding a patch file, writing YAML with a `!!js` escape, and restarting. There is no place to see which servers exist, whether they are connected, how many tools they contributed, or why one failed; a broken server is silent except in the logs. Nothing in the harness speaks the `mcpServers` mapping that every other client in the ecosystem uses, so an existing configuration cannot be reused.
- **The model cannot persist what it discovers.** [`tool-cordis`](../../../../packages/extensions/README.md) lets the model define and mount dynamic Cordis packages, and its contract is explicit that definitions live in process memory and nothing here writes repository files or configuration. So an agent that decides it needs a database or issue tracker MCP server can mount one for the current process, and the choice dies with it: the next session re-derives it or loses it, and no user sees a record of which server the agent attached.
- **Server capability is under-used.** The bridge maps tools only. A server's prompts, which are meant to be user-invoked instructions rather than model-chosen functions, have no path into the product's command surface.

The missing contract is one durable, validated, scoped description of "which MCP servers this harness attaches", writable by a person or by the model through the same rules, readable by both, and cheap enough to state per project.

## Proposal

Add `packages/mcp/mcp-registry`: a plugin that owns the server list, resolves it from two scopes, mounts one `dsh-mcp-client` entry per effective server, and republishes the result to three consumers — a file the user edits, `/mcp` in the terminal, and one model-facing tool `mcp_manage`. `dsh-mcp-client` keeps doing exactly what it does today; the registry is its only new caller.

| Piece | Shape |
|---|---|
| User scope | `mcp.servers` section of `~/.dsh/settings.yaml`, written through the settings service so comments, anchors, and other namespaces survive |
| Project scope | `<projectRoot>/.dsh/mcp.json` with the ecosystem `mcpServers` mapping; a repo-root `.mcp.json` is read as the same scope |
| Resolution | ranked scopes, `disabled`/shadowing reported, `${VAR}` and `${VAR:-fallback}` expanded from `process.env` at mount time only |
| Mounting | one loader entry `mcp-<name>` per effective server, created through the entry group API, diffed on config change, disposed on removal |
| Model tool | `mcp_manage`: `list` / `get` / `check` / `add` / `remove` / `enable` / `disable`, writing to either scope under the approval policy |
| Terminal | `/mcp` list with per-server detail, `d` to disable or remove, and a `--filter` argument matching the `/skills` shape |
| CLI | `dsh mcp list \| get <name> \| add <name> … \| remove <name> \| enable <name> \| disable <name>` |
| Prompts | `dsh-mcp-client` reads `prompts/list` alongside `tools/list`; the registry publishes each prompt as a command `/<server>__<prompt>` |

### Configuration format

One server row, per transport. Field names match `dsh-mcp-client`'s [config schema](../../../../packages/mcp/mcp-client/src/index.ts) so the mapping is a projection, not a translation.

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "cwd": "packages/web",
      "disabled": false
    },
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headers": { "Authorization": "Bearer ${LINEAR_KEY}" },
      "toolCallTimeoutMs": 30000
    }
  }
}
```

Rules the format commits to:

- `type` accepts `stdio` and `http`; `streamable-http` is read as an alias for `http`. A server with neither `command` nor `url` is invalid and reported at startup rather than skipped.
- A server name must satisfy the client's `^[A-Za-z0-9_-]{1,32}$`; it is the tool namespace, so renaming a server renames its tools, and the registry says so before it writes.
- `disabled: true` keeps the row and its state visible while mounting nothing; deleting is a separate, explicit act.
- Unknown keys are errors, not warnings: a typo in `command` must not silently launch nothing.
- `${VAR}` expands only at mount time. Written files keep the reference, so a secret never lands in a committed project file as a literal, and `list`/`get` redact any value that did.
- A `reconnect` block may be given per server and is passed through; omission keeps the client's defaults.

### Scope resolution

Scopes rank the way skill roots do, lowest number winning, and a losing row is never dropped silently.

| Rank | Source | Writable by |
|---|---|---|
| 100 | `<projectRoot>/.dsh/mcp.json` | the user, and the model with approval |
| 200 | `<projectRoot>/.mcp.json` | nobody — read for compatibility |
| 400 | `mcp.servers` in `~/.dsh/settings.yaml` | the user, and the model with approval |

`projectRoot` is the nearest ancestor holding `.git`, falling back to the working directory — the same rule the skill roots use. Two project files at one root, `.dsh/mcp.json` and `.mcp.json`, both contribute; on a name clash `.dsh/mcp.json` wins and the other row is reported as shadowed. A row that only exists in `.mcp.json` and launches a process needs its own one-time approval before its first mount, because that file is shared through version control and did not come from this harness.

### Mounting and reload

The registry is a normal plugin that injects `loader`, `settings`, `hmr`, and `tools`. For each effective server it creates entry `mcp-<name>` with `name: '@deepseek-ai/dsh-mcp-client'` and the projected config, then calls `entry.update()`, which is the path the profile patch already uses; `disabled` maps to the entry's own disabled flag rather than to removal. Reload is a diff: an unchanged projection (compared as the resolved config, not the file text) leaves the live connection alone, a changed one disposes and recreates that single entry, and a vanished name disposes it — so editing an unrelated server in `settings.yaml` never bounces a working connection, and one server that cannot start does not take the harness down (`failOnStartupError` stays `false` by default).

Both config scopes are live. `~/.dsh/settings.yaml` reloads through the settings service; the project files are watched through `ctx.hmr.registerConfig`, and a parse failure keeps the last good set and surfaces `hmr/config-update-failed` rather than clearing every server.

### `mcp_manage`, the model-facing tool

One tool, seven arguments, no free-form file editing. It reports the resolved view (name, scope, transport, enabled, connection state, tool count, last error, redacted env keys — never values), and writes through the same validated path the user's editor goes through, so the model cannot produce a file the harness would then reject.

`add` requires an approval round-trip carrying the exact command line or URL that will be launched, and it is the tool's only destructive-to-authority action; `remove`, `enable`, and `disable` ask the same way once per call. The approval prompt is what makes "the agent configured its own tools" auditable: the user sees the row before it exists, and the durable record is an ordinary file diff in git. Denial leaves both files byte-identical. Writes target `mcp.servers` in user settings unless the call names `scope: "project"`, and a project write refuses to create the file when the working tree is dirty for that path unless the caller acknowledges the overwrite.

`check` connects without mounting, lists tools and prompts, and returns the result — the way a person verifies a server before trusting it, usable by the model in the same turn it adds one.

### Terminal and CLI

`/mcp` opens a picker of effective servers with their scope and status; the footer carries the same filter echo pattern as `/skills`, and `/mcp <text>` pre-narrows it. Selection shows detail — resolved transport, tool and prompt names, the last error verbatim, which file owns the row — with keys to enable, disable, remove, and re-check, each of which routes through the same approval the tool uses. Nothing in the terminal writes a config file silently: a successful write prints the path it touched.

`dsh mcp …` is the same operations before a session exists, for scripting and for the moment a server is broken and there is no session to type in. `dsh mcp add` with no transport flags records the row and prints the next command to run; it does not fetch the model's tool list to decide validity, because `check` exists for that.

### Prompts as commands

The client asks each server for `prompts/list` next to `tools/list`, keeps the list per connection generation, and the registry republishes each prompt as a command `/mcp__<server>__<prompt>` with the prompt's declared arguments. Invoking one fetches `prompts/get` with the given values and submits the returned messages as the turn's input, so a server-provided prompt behaves like a built-in command rather than a tool the model may or may not pick. A server without `prompts/list` support contributes none, and `notifications/prompts/list_changed` re-runs the same swap used for tools. Resources stay out of scope: the harness has no resource-shaped input surface, and inventing one is a larger decision than this one.

## Alternatives considered

- **Extend `dsh-mcp-client` to accept a list of servers.** Rejected: that package's contract is one connection per plugin instance, which is what makes its reconnect budget, its `serverName` reservation, and its per-instance disposal tractable. A list would push diffing and partial failure into the transport layer and change the meaning of `failOnStartupError`.
- **Teach the model to use `tool-cordis` and stop there.** Rejected: its memory-only boundary is deliberate and correct for plugin code, but it makes an agent's server choice unrepeatable and invisible, and it puts full plugin authority behind a task that needs a data row.
- **Support `~/.claude.json` and other clients' files directly.** Rejected: their layouts encode their own scoping and credential storage. The compatible surface here is the project `mcpServers` mapping, which is the part that is shared, plus a one-time `dsh mcp import <file>` if demand appears.
- **Store servers only in `settings.yaml`.** Rejected against the user's decision to have both scopes: a per-project server set is the common case for repositories that ship their own tooling, and a single global list would force every project's servers onto every session.
- **Generate the profile patch file instead of mounting at runtime.** Rejected: writing YAML rows that another process then reads loses live reload, makes an approval-driven write indistinguishable from an edit, and cannot report per-server status without a second state file.
- **Let the model write server config without approval.** Rejected: a stdio row is arbitrary command execution at every future startup, including unattended ones. The approval cost is one prompt per change, against an unbounded execution grant.

## Acceptance criteria

- A server described in either scope appears as `mcp__<name>__<tool>` in the model's tool list with no hand-written plugin row, and the same entry edited in place reconnects that server only.
- `~/.dsh/settings.yaml` edited by hand takes effect without a restart; a registry write leaves every unrelated comment, anchor, and namespace byte-identical, asserted by test on a fixture with comments.
- A malformed project file keeps the last good set, reports the path and the parse error, and never clears working servers.
- `mcp_manage` `add` shows the exact command line in the approval prompt, and a denial writes nothing to either file; an approval writes a row that a subsequent `list` reports in the scope chosen.
- A literal secret in an added `env` value is accepted, stored as written, and redacted by `list`, `get`, `/mcp` detail, and the tool card.
- `dsh mcp list` runs with no session and exits non-zero when any effective server failed at startup; `--json` output round-trips into `dsh mcp add`.
- `/skills`-shaped keyboard behavior holds in `/mcp`: typing filters, Esc closes while work is in flight, and no key silently writes a file without printing the path.
- A server exposing prompts yields `/mcp__<server>__<prompt>` invokable from the composer with arguments, and a server without prompt support yields none without an error.
- `pnpm run test:snapshot` stays green: the recorded sessions' tool lists change only where a fixture opts into an MCP server.
- Docs: this note moves to `implemented/feature/`, `packages/mcp/README.md` maps the second package, both package READMEs and their Chinese counterparts land, the config catalog regenerates, and `pnpm run doc-sync` passes.

## Risks

- A server that hangs at startup delays the first turn. The client's activation await is deliberate — tools must exist before the model sees them — and this proposal inherits it, mitigated only by `check` before `add` and by a per-server timeout later if it earns one.
- Every bridged tool adds its definition to every request; a per-server tool count in `/mcp` makes the cost visible but does not bound it. Enabling a server is a token decision, not a free one.
- Two writers, one file. The settings service merges concurrent edits, the project JSON file does not: a model write and a person's edit racing on `.dsh/mcp.json` is last-writer-wins with validation, and `/mcp` shows which file owns a row plus its mtime to make that visible. Locking a whole-file JSON document is deferred until it bites.
- Trust is now expressed by file location: a cloned repository's `.mcp.json` can name a program. The first-mount approval for rows that came from the read-only compatibility file is what keeps this from being automatic execution of a stranger's command line, and it is the one part of this design that is a security control rather than convenience.
- The prompts bridge touches `dsh-mcp-client`, which is shipped and tested; a server whose prompt list changes mid-turn can rename a command under a queued message, handled by resolving at submit time and failing visibly rather than running a different prompt.
- Approval fatigue is a real failure mode: a model that re-adds a server every turn is worse than one that cannot. The durable write is what prevents it, and `list` is documented as the required first call in the tool description so the agent checks before proposing.
