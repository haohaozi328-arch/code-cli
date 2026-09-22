# Agent Note: MCP 服务器配置与管理

Status: proposed

[English](2026-09-22-mcp-config-and-management.md) | 中文

## 问题

[`dsh-mcp-client`](../../../../packages/mcp/mcp-client/README.zh.md) 已经能把外部 Model Context Protocol 服务器的工具桥接进 `ctx.tools`，而且协议层面是可用级别的：stdio 与 Streamable HTTP、带次数预算的重连主管、按代次原子替换工具集、子进程环境清洗。缺的不是协议，而是"一台服务器最初怎么被接进来"。

一台服务器就是一行插件条目，得手写进 profile patch：

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

这个形态在三个方向上代价过高：

这座桥自身的决策记录在 [MCP 客户端插件](../../implemented/feature/2026-07-07-mcp-client-plugin.zh.md) 与 [自动重连](../../implemented/feature/2026-08-06-mcp-client-auto-reconnect.zh.md) 两则 Agent Note 里，本提案不推翻其中任何一条，只在它们前面补上缺失的那一层。

- **用户没法管理服务器。** 加一台要找 patch 文件、写带 `!!js` 转义的 YAML、重启。没有任何地方能看到当前有哪些服务器、是否连上、贡献了几个工具、某台为什么失败；服务器坏了除了日志没有别的表现。harness 里也没有任何东西认识生态里通用客户端都在用的 `mcpServers` 映射，所以已有配置复用不过来。
- **模型无法把它发现的东西固化下来。** [`tool-cordis`](../../../../packages/extensions/README.md) 允许模型定义并挂载动态 Cordis 包，而它的契约明确写着：定义只存在于进程内存，这里不写仓库文件也不写配置。于是模型决定需要某个数据库或工单 MCP 服务器时，只能给当前进程挂上，选择随进程一起消失：下一个会话要么重新推一遍，要么彻底丢失，用户也看不到"agent 自己接了一台服务器"的任何记录。
- **服务器能力被少用。** 这座桥只映射工具。服务器的 prompts —— 语义上是用户主动调用的指令，而不是模型自选的函数 —— 没有进入产品命令面的路径。

缺的契约是一份持久的、经过校验的、分作用域的"本 harness 接哪些 MCP 服务器"的描述，人和模型按同一套规则写，两边都能读，而且在单个项目里表达起来足够便宜。

## 提案

新增 `packages/mcp/mcp-registry`：一个插件，持有服务器列表、从两个作用域解析出有效集合、为每台有效服务器挂一个 `dsh-mcp-client` 条目，并把结果开放给三个使用方 —— 用户编辑的文件、终端里的 `/mcp`、以及一个面向模型的工具 `mcp_manage`。`dsh-mcp-client` 保持现在做的事不变，registry 是它唯一的新调用方。

| 部件 | 形态 |
|---|---|
| 用户作用域 | `~/.dsh/settings.yaml` 的 `mcp.servers` 段，经 settings 服务写入，因此注释、锚点和其他命名空间都不受影响 |
| 项目作用域 | `<projectRoot>/.dsh/mcp.json`，采用生态通用的 `mcpServers` 映射；仓库根的 `.mcp.json` 作为同一作用域读取 |
| 解析 | 按 rank 排序的作用域，`disabled`/被遮蔽情况照实上报，`${VAR}` 与 `${VAR:-fallback}` 只在挂载时从 `process.env` 展开 |
| 挂载 | 每台有效服务器一个 loader 条目 `mcp-<name>`，经条目组 API 创建，配置变更时做差异比对，删除时 dispose |
| 模型工具 | `mcp_manage`：`list` / `get` / `check` / `add` / `remove` / `enable` / `disable`，按批准策略写入两个作用域之一 |
| 终端 | `/mcp` 列出有效服务器并给出各自状态，`d` 停用或删除，`--filter` 参数沿用 `/skills` 的形状 |
| CLI | `dsh mcp list \| get <name> \| add <name> … \| remove <name> \| enable <name> \| disable <name>` |
| prompts | `dsh-mcp-client` 在 `tools/list` 旁一并读 `prompts/list`；registry 把每个 prompt 发布为命令 `/<server>__<prompt>` |

### 配置格式

一台服务器一行，按传输方式分形。字段名与 `dsh-mcp-client` 的[配置 schema](../../../../packages/mcp/mcp-client/src/index.ts) 对齐，所以映射是投影，不是翻译。

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

格式承诺的规则：

- `type` 接受 `stdio` 与 `http`；`streamable-http` 作为 `http` 的别名读入。既没有 `command` 也没有 `url` 的服务器是无效条目，在启动时上报而不是静默跳过。
- 服务器名必须满足客户端那条 `^[A-Za-z0-9_-]{1,32}$`；它就是工具命名空间，所以改名等于改工具名，registry 在写盘之前会先把这件事说清楚。
- `disabled: true` 保留这一行及其状态、但不挂载任何东西；删除是另一个显式动作。
- 未知键是错误而非警告：`command` 打错字不能悄悄变成"什么都没启动"。
- `${VAR}` 只在挂载时展开。落盘的文件保留的是引用形式，所以密钥不会以字面量进入被提交的项目文件；万一已经写进去了，`list` / `get` 会做脱敏。
- 每台服务器可以给一个 `reconnect` 块，原样透传；不给就用客户端默认值。

### 作用域解析

作用域按 rank 排序，与技能根目录一致，数字小者胜出，落选的那一行不会被悄悄丢掉。

| Rank | 来源 | 可写方 |
|---|---|---|
| 100 | `<projectRoot>/.dsh/mcp.json` | 用户，以及经批准的模型 |
| 200 | `<projectRoot>/.mcp.json` | 谁都不能写 —— 仅为兼容而读 |
| 400 | `~/.dsh/settings.yaml` 的 `mcp.servers` | 用户，以及经批准的模型 |

`projectRoot` 是最近的含 `.git` 祖先目录，否则取工作目录 —— 与技能根目录同一条规则。同一根目录下 `.dsh/mcp.json` 与 `.mcp.json` 两份项目文件都参与解析；同名时 `.dsh/mcp.json` 胜出，另一条上报为被遮蔽。只在 `.mcp.json` 里存在且会启动进程的条目，首次挂载前需要它自己的一次性批准，因为那份文件是随版本库共享的、并非出自本 harness。

### 挂载与热加载

registry 是普通插件，注入 `loader`、`settings`、`hmr`、`tools`。它为每台有效服务器创建条目 `mcp-<name>`，`name: '@deepseek-ai/dsh-mcp-client'`，config 为投影结果，然后调用 `entry.update()` —— 也就是 profile patch 已经在走的那条路径；`disabled` 映射到条目自己的 disabled 标志而不是直接移除。热加载是差异比对：投影结果不变（比较的是解析后的配置，不是文件文本）就完全不碰活动连接，变了就只 dispose 并重建那一个条目，名字消失就 dispose —— 所以在 `settings.yaml` 里改一台无关的服务器不会打断另一台正在工作的连接，某台启动失败也不会把 harness 拖垮（`failOnStartupError` 默认仍是 `false`）。

两个配置作用域都是活的。`~/.dsh/settings.yaml` 通过 settings 服务热加载；项目文件通过 `ctx.hmr.registerConfig` 监听，解析失败时保留上一份有效集合并把 `hmr/config-update-failed` 报出来，而不是把所有服务器清空。

### 面向模型的工具 `mcp_manage`

一个工具、七个参数，不做自由格式的文件编辑。它上报解析后的视图（名字、作用域、传输方式、是否启用、连接状态、工具数、最后一次错误、脱敏后的 env 键名 —— 绝不含值），并通过与用户编辑器完全相同的校验写入路径落盘，因此模型写不出让 harness 自己拒绝的文件。

`add` 需要一轮批准，批准提示里带上即将被启动的确切命令行或 URL；它是该工具唯一"对权限有破坏性"的动作。`remove`、`enable`、`disable` 每次调用同样问一次。这轮批准正是让"agent 给自己配了工具"变得可审计的地方：用户在条目存在之前就看到它，而持久记录只是 git 里一份普通的文件 diff。被拒绝时两个文件都保持逐字节不变。写入默认指向用户作用域的 `mcp.servers`，调用方显式给 `scope: "project"` 才写项目文件；并且当该路径在工作树里有未提交改动时，项目写入会拒绝创建文件，除非调用方确认覆盖。

`check` 只连接不挂载，列出工具与 prompts 并返回结果 —— 这就是人先验证一台服务器再信任它的做法，模型也可以在同一轮里先 `check` 再 `add`。

### 终端与 CLI

`/mcp` 打开一个有效服务器选择面板，带作用域与状态；页脚沿用 `/skills` 的筛选词回显方式，`/mcp <文本>` 预先收窄。选中后看详情 —— 解析后的传输方式、工具与 prompt 名称、原样给出的最后一次错误、这一行归哪个文件所有 —— 并可用按键启用、停用、删除、重新 `check`，其中每个写操作都走与工具相同的批准通道。终端里没有任何动作会悄悄写配置文件：写成功就打印它改动了哪个路径。

`dsh mcp …` 是同一批操作在会话还不存在时的版本，用于脚本化，也用于"服务器坏了、没有会话可以输入"的时刻。不带传输参数的 `dsh mcp add` 只记录这一行并打印下一条该跑的命令；它不会为了让模型的工具列表生效而去试探，因为那件事有 `check`。

### prompts 成为命令

客户端在 `tools/list` 旁边向每台服务器请求 `prompts/list`，把这份列表挂在连接代次上，registry 再把每个 prompt 发布为命令 `/mcp__<server>__<prompt>`，参数取该 prompt 声明的 arguments。调用时用给定参数执行 `prompts/get`，把返回的消息作为这一轮的输入提交，于是服务器提供的 prompt 表现得像内建命令，而不是模型可能选也可能不选的工具。不支持 `prompts/list` 的服务器一条都不贡献，`notifications/prompts/list_changed` 走与工具相同的替换流程。resources 仍在范围外：harness 里没有资源形态的输入面，凭空造一个是比这次更大的决定。

## 考虑过的替代方案

- **扩 `dsh-mcp-client` 让它接受服务器列表。** 拒绝：这个包的契约就是"一个插件实例一条连接"，正是这一点让它的重连预算、`serverName` 预留、按实例 dispose 变得可控。改成列表会把差异比对和部分失败处理压进传输层，还会改变 `failOnStartupError` 的含义。
- **让模型直接用 `tool-cordis`，到此为止。** 拒绝：它对插件代码而言"只在内存"的边界是有意为之且正确的，但这会让模型选服务器这件事不可复现也不可见，并且为了一个只需要一行数据的需求动用了完整的插件权限。
- **直接支持 `~/.claude.json` 等其他客户端的文件。** 拒绝：它们的布局编码了各自的作域与凭据存储方式。这里真正共享的是项目里的 `mcpServers` 映射这一部分，所以只兼容它；真有需求再考虑一次性的 `dsh mcp import <file>`。
- **只把服务器存进 `settings.yaml`。** 与用户"两个作用域都要"的决定冲突，因此拒绝：自带工具的仓库通常都要一份项目级服务器集合，只有全局列表会把每个项目的服务器强加给所有会话。
- **不运行时挂载，而是生成 profile patch 文件。** 拒绝：写 YAML 让另一个进程去读，会丢掉热加载，使"经批准的写入"与"手工编辑"无法区分，而且没有第二份状态文件就报不出每台服务器的状态。
- **模型写服务器配置不需要批准。** 拒绝：一行 stdio 条目意味着此后每次启动（包括无人值守的启动）都执行任意命令。批准的成本是每次改动一个提示，换来的是一次无界的执行授权。

## 验收标准

- 两个作用域中任一处描述的服务器，无需任何手写插件行就能以 `mcp__<name>__<tool>` 出现在模型的工具列表里；就地修改同一条目只会重连那一台服务器。
- 手工编辑 `~/.dsh/settings.yaml` 无需重启即生效；registry 的写入让所有无关注释、锚点和其他命名空间逐字节不变，并用带注释的 fixture 以测试断言。
- 项目文件解析失败时保留上一份有效集合，报出路径与解析错误，且不清掉正在工作的服务器。
- `mcp_manage` 的 `add` 在批准提示里展示确切的命令行；被拒绝时两个文件都不写入；批准后写入的行能在随后 `list` 的对应作用域里被读到。
- `env` 里的字面量密钥被接受、按原样存储，并在 `list`、`get`、`/mcp` 详情与工具卡片中全部脱敏。
- `dsh mcp list` 在无会话状态下可运行，且当任一有效服务器启动失败时以非零码退出；`--json` 的输出能被 `dsh mcp add` 原样回收。
- `/mcp` 保持 `/skills` 那套键盘行为：输入即筛选、工作进行中 Esc 可关、没有任何键位在悄悄写文件。
- 暴露 prompts 的服务器产生可从 composer 带参数调用的 `/mcp__<server>__<prompt>`；不支持 prompt 的服务器不产生任何条目也不报错。
- `pnpm run test:snapshot` 保持绿色：录制会话的工具列表只在 fixture 主动接入 MCP 服务器时变化。
- 文档：本则移入 `implemented/feature/`，`packages/mcp/README.md` 收录第二个包，两个包的 README 及其中文版落地，配置目录重新生成，`pnpm run doc-sync` 通过。

## 风险

- 启动时卡住的服务器会拖慢第一轮对话。客户端等待激活完成是有意为之 —— 工具必须在模型看到之前就存在 —— 本提案继承这一点，只靠"先 `check` 再 `add`"缓解，若确实值得再补每服务器超时。
- 每个被桥接的工具都会把它的定义加进每一次请求；`/mcp` 里的每服务器工具计数让代价可见，但并不设上界。启用一台服务器是 token 决策，不是免费的。
- 两个写入方、一份文件。settings 服务会合并并发编辑，项目 JSON 不会：模型写与人在同一份 `.dsh/mcp.json` 上竞争时是"后写者胜 + 各自校验"，`/mcp` 通过显示这一行归属的文件及其 mtime 让这件事可见。整份 JSON 文档加锁推迟到真出问题再做。
- 信任现在由文件位置表达：克隆来的仓库里的 `.mcp.json` 可以指名一个程序。对来自只读兼容文件的那一行做首次挂载批准，是防止它变成"自动执行陌生人的命令行"的关键，也是这套设计里唯一属于安全控制而非便利性的部分。
- prompts 桥要改动已发布且有测试的 `dsh-mcp-client`：某台服务器的 prompt 列表在轮次中途变化，会让一个排队中的消息对应的命令改名；处理方式是在提交时解析，失败就明显报错，而不是去跑另一个 prompt。
- 批准疲劳是真实的失败模式：一个每轮都重新添加服务器的模型，比一个不能添加的更糟。持久写入正是防止这一点的机制，并且工具描述里把 `list` 规定为必须先调的那一个，让 agent 先查再提。
