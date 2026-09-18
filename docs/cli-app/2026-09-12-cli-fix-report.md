# dsh-cli 2026-09-12 修复与验证报告

## 1. 本次问题

1. 放大/调整终端窗口后界面变黑、内容消失。
2. `/sessions` 切换会话后出现空内容。
3. `/perm` 只能在 `ask/never` 之间切换，无法完整控制沙箱与审批策略。
4. 缺少 `/connect` 模型商连接能力，无法在 CLI 中配置主流模型商及自定义 URL/API Key/API 格式。

## 2. 修改前代码定位

- `packages/bundle/cli-app/src/index.ts`
  - `code` 使用手工 `?1049h` alternate screen。
  - 生命周期切换复用同一个 Ink root。
- `packages/bundle/cli-app/src/ui/App.tsx`
  - resize 监听器主动执行 `\x1b[2J\x1b[H`。
  - 完成消息使用 `<Static>`，但 resize 时清屏会把 Static 已写入的内容一起清掉。
  - ChoicePicker 原先一次性渲染全部选项。
- `packages/bundle/cli-app/src/ui/state.ts`
  - `/perm` 仅调用 approval policy `ask/never`。
  - `/model` 只查询当前 provider。
  - 没有 provider connect wizard。
- `packages/llm/llm-pi-ai/src/config.ts` / `provider.ts`
  - 已存在可配置 provider、credential-ref、baseURL、models、API protocol 基础设施，可直接复用。
- `packages/interaction/permission-presets/src/index.ts`
  - 已存在完整权限预设：sandbox + approval，可以作为 `/perm` 的真实控制面。

## 3. 已执行修改

### 3.1 Resize 黑屏

- 删除 App 层 resize 时主动全屏清除。
- 保留 Ink 自己的 resize/layout 处理。
- `index.ts` 只在 session 生命周期切换时清理当前可见面，不在 resize 时清理。
- 继续使用正常 terminal screen，而不是 alternate screen，以保留 scrollback。

### 3.2 Session 切换

- App root 增加 `key={vm.getState().sessionId}`，不同 session 强制形成新的 React 子树。
- 生命周期 rerender 时清理旧可见帧，避免旧 session 的 Static 内容残留。
- Static transcript 因 session key 改变而重新建立，恢复会话后会重新从 durable log 投影内容。

### 3.3 权限

`/perm` 现在优先使用已有 `permissionPresets` 服务，而不是只操作 approval policy。

支持完整预设，例如：

- `read-only`
- `workspace-write`
- `danger-full-access`
- 以及项目当前 permission-presets 服务注册的其他预设

同时保留 `ask` / `never` 兼容路径。

状态栏从单纯的“询问/禁止”改为显示当前 permission preset。

### 3.4 `/connect` 模型商

新增交互式 `/connect`：

1. 从现有 LLM configurable-provider directory 读取主流 provider。
2. 支持选择“自定义模型商”。
3. 主流 provider：输入 API Key → 可选 Base URL → 保存。
4. 自定义 provider：输入 provider ID → API Key → Base URL → API 格式 → Model ID。
5. API 格式支持：
   - `openai-completions`
   - `openai-responses`
   - `anthropic-messages`
6. API Key 只进入 credentials 服务，不进入 UI snapshot 或 settings 明文。
7. provider 配置通过 `llm-pi-ai` settings namespace 持久化。
8. `/model` 现在会同时读取当前 provider 与已配置 provider，可以选择新连接的模型。
9. ChoicePicker 增加最大可见项数量，provider/model 数量较多时通过上下键滚动，不再把终端撑爆。

### 3.5 依赖/锁文件

- 更新 `packages/bundle/cli-app/package.json`。
- 同步 `pnpm-lock.yaml` workspace importer。

## 4. 验证

### 已完成

- `git diff --check`：通过。
- `package.json` JSON 解析：通过。
- 检查了 llm-pi-ai 的 provider schema：custom provider 的 models/api/baseURL/apiKeyEnv 均与现有 schema 对齐。
- 检查了 permission-presets 与 user-approval 实现：确认权限预设同时覆盖 sandbox 与 approval。
- 检查了 Ink resize/Static/alternate-screen 机制，并据此移除导致黑屏的手工 resize 清屏。

### 未完成的本机运行验证

当前 ShunCode 执行环境没有 `node.exe`，因此无法在该执行环境中运行：

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm dsh --profile code`

此前直接执行 TypeScript 检查时确认失败原因是执行环境缺少 `node.exe`，不是编译错误。

因此本报告中的“功能验证”目前属于代码路径验证，仍需要在用户本机 Node 24.19.0 环境进行最终 TUI 回归。

## 5. 建议的最终回归步骤

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm dsh --profile code
```

然后依次验证：

1. 启动后拖大/缩小终端，确认不黑屏。
2. AI 输出超过一屏，用鼠标滚轮查看上方历史。
3. `/sessions` 进入旧会话，Enter 后确认历史消息重新出现。
4. `/perm` 选择 `read-only / workspace-write / danger-full-access`，实际执行工具分别验证。
5. `/connect` → OpenAI/DeepSeek/其他主流 provider → API Key → Base URL。
6. `/connect` → 自定义 → provider ID → API Key → URL → API format → Model ID。
7. `/model` 检查新 provider/model 是否出现并可切换。

## 6. 风险与后续

- 当前仍基于 Ink；Ink 在极端 terminal resize、Static 内容超过 viewport 等场景存在已知渲染边界，因此这次修复重点是去掉本项目额外制造的清屏/alternate-screen 冲突。
- 如果最终回归仍存在 resize 残影，下一阶段应考虑把动态区域进一步缩小，或迁移到 OpenTUI/OpenCode 同类 retained renderer。
- `/connect` 当前 custom model 使用默认 context window/max tokens；后续可以增加可选字段让用户精确配置模型能力。

## 2026-09-12 实机反馈：`/sessions` 切换问题复查

### 现象
实机截图确认切换/重绘后终端直接显示了字面量 `\\x1b[H\\x1b[2J`，说明此前用于清屏的 ANSI 序列被二次转义，终端没有执行清屏控制码，而是把控制码文本当普通字符输出。

### 根因
此前会话切换复用了同一个 Ink 实例并调用 `rerender()`。当前 opencode UI 使用 `<Static>` 保存已提交 transcript；跨 session 继续复用同一棵 Static 树存在旧 session 内容生命周期残留/新 session 内容未正确建立的问题。

### 本次修复
- `/sessions`、`/resume` 选中会话后，不再复用旧 Ink 树。
- 先 `ink.unmount()`，再清理当前可见画面，最后 `internals.render(element)` 挂载新 session。
- 清屏序列改为运行时通过 `String.fromCharCode(27)` 构造，避免 PowerShell/源码编辑过程再次产生 `\\x1b` 字面量。
- 终端 resize 路径不执行清屏，因此不会回归“放大终端黑屏/空屏”问题。

### 复验状态
- 已检查切换代码块结构，当前实现为“旧树卸载 → 清屏 → 新树 render”。
- `git diff --check` 针对 cli-app 相关源码无 whitespace error。
- 已确认源码中不存在本次截图所示的 `\\x1b` 字面量清屏序列。
- 当前执行环境仍没有可用的 `node` 命令，因此无法在此环境直接启动真实 TUI 做第二次实机操作；需要在用户本机执行最终 `/sessions` 回归。

## 2026-09-12 复查整改：结构性修复（本机已跑通门禁）

上一轮的「unmount → 清屏 → 重新 render」只是把症状挪了个位置，仍有三类问题：会话切换整棵树重建、`\\x1b` 字面量风险、resize/滚动被 app 额外干预；另外 App.tsx 的文案在编辑过程中被二次编码成乱码。本轮按 Ink 的常规做法重写渲染层。

### 根因

1. **会话切换**：复用同一个 Ink 实例 `rerender` 并给根元素换 key 就够了；旧实现却 `unmount()` + 写清屏序列 + 重新 `render()`，清屏序列还被写成两次转义的字符串（终端把它当普通文本打印）。
2. **滚动/resize 黑屏**：open `code` 布局进入备用屏（`?1049h`）并开启鼠标上报（`?1000h/?1006h`），再叠加 App 层的手工 `scrollOffset`/清屏；这些都在和终端自身的能力较劲。
3. **文案乱码**：App.tsx 部分中文字符串是「UTF-8 字节被按 GBK 解读后再编码」的产物（如 `浼氳瘽` = `会话`、`鉂?` = `❯`、`馃悮` = `🐚`）。

### 修法

- **Static 转录**：`splitTranscript` 以「第一条未定稿行」为界，前缀交给 Ink `<Static>`（写入一次即进入终端 scrollback），后缀（流式行/浮层/输入）每次重绘。resize 不再重排历史，scrollback 由终端原生接管。
- **单 Ink 实例**：会话循环里 `ink === null ? render(element) : ink.rerender(element)`，根元素 key = 会话 id；删除 `unmount + 清屏 + render` 与手动 ANSI 转义。
- **删掉备用屏与鼠标上报**：不抢占滚轮、不切屏，滚动交给终端。
- **`/clear`**：只清当前视口（`CLEAR_VIEWPORT` 常量）并 bump `transcriptEpoch` 让静态列表重建；scrollback 保留。常量有单测钉住「必须是真 ESC 字节」。
- **文案单一来源**：新增 `ui/copy.ts`，App/overlays/state/connect 不再内联用户可见字符串；乱码按原字节恢复为正确中文/emoji。
- **投影合一**：`transcript.ts` 的 `projectEvent` 同时服务 replay 与 live `session/event`，删掉两份重复的投影分支；删除 `trimTranscript` （Static 写入后行即离开 React 树，截断不再需要）。
- **模块拆分**：`state.ts` 1137 行拆为 model / transcript / connect / copy / state；App.tsx 796 行拆为 App / messages / overlays；纯 markdown 投影拆到 `markdown.ts`，Ink 渲染留在 `markdown-view.tsx`。
- **测试同步**：修掉 6 个既有失败用例（/help 文案、/perm 标题、pickModel 后关闭、unmount vs rerender、composition 三例），补 transcript/terminal/app 三个新用例文件。`pnpm exec vitest run packages/bundle/cli-app/tests` →**71/71 绿**（REAL-composition 3 例从超时 45s 降到 ~0.5s）；oxlint 0；`tsc -b tsconfig.host.json` 0。
- **接线**：`packages/bundle/cli-app/tsconfig.json` 补齐实际依赖的项目引用（permission-presets / credentials / settings / brand / values），`scripts/verify-package-readme-model-experience.ts` 增加 cli-app 的间接条目（与 `packages/bundle/base` 同理由）。merge upstream 时需连同 root `package.json`、`tsconfig.base.json`、`tsconfig.host.json` 一起保留。

### 仍需人工确认

真机 TTY 的滚轮/窗口缩放/`/clear` 视觉表现无法在无 TTY 的 CI 环境断言，按 `manual-acceptance.md` 走查即可。

## 2026-09-12 二次反馈：`/new` 两个问题

### 现象

1. 在旧会话里 `/new`，屏幕上仍保留旧对话内容（新输入框接在旧内容下方）。
2. 每次 `/new` 且不输入任何内容，也会被当成一次对话，`/sessions` 里堆积大量空会话。

### 根因

1. Static 转录写入终端 scrollback 后无法撤印；上一轮为了修 resize 黑屏又删掉了所有清屏路径，于是会话切换时旧会话的静态行留在屏幕上。
2. `/new` 直接 `exitFn({type:'new'})` → glue 立刻 `agents.create` 新会话，同时 `dispose()` 旧 handle；官方 persistence 的 handle 关闭会 drain durably，于是每个从未输入的会话都被落盘，成为一个空会话。

### 修法

- **会话边界清屏**：`InkSurface` 增加 `clearViewport()`（`instance.clear()` + `CLEAR_VIEWPORT`），glue 在非首次挂载的 `rerender` 前调用；`/clear` 与 `/new` 复用同一路径。scrollback 保留。
- **`/new` 复用未开始的会话**：新增 `transcript.ts#hasConversation`（只认 user-origin `user/message` 与 `assistant/message`，注入上下文不算），VM 侧再用 `promptSubmitted` 盖住「乐观发送后 durable 事件尚未落地」的窗口。当前会话未开始时，`/new` 走 `resetTranscriptView()`（清屏 + bump `transcriptEpoch`），既不创建也不落盘新会话。
- **测试**：VM 用例覆盖「未开始会话 `/new` 在本机重置、`done` 不 resolve」与「已有内容 `/new` 仍发 `new`」；index.spec 覆盖「重置调用 clearViewport、不再 `create`」与「切换会话先 clearViewport 再 rerender」；transcript.spec 覆盖 `hasConversation` 对注入上下文返回 false。`vitest run packages/bundle/cli-app/tests` → **74/74 绿**；oxlint 0；`tsc -b tsconfig.host.json` 0。

### 已知残余

官方 `sessionPersistence` 没有删除接口，所以「从一个已使用的会话 `/new` 到一个从未输入的新会话、然后离开」仍会留下 1 个空会话（不是每个 `/new` 一个）。要彻底归零需要懒创建（首次输入才 `agents.create`）或官方提供删除/GC 接口，已登记为后续工作。

## 2026-09-12 三次反馈：状态行改为计量读数

### 需求

1. 输入框底部的 `/model` 等命令提示行，换成 `token xx/s` 与 token 使用量。
2. 圆圈的上下文占用读数，放在权限右侧。
3. 上下文压缩要自动降低显示的上下文使用量。

### 修法

- **`ui/status.ts`（新）**：唯一的数字→文本去处。`tokensPerSecond` / `estimateLiveTokens`（固定 4 char/token 密度，与 token-meter 同尺度）/ `formatTokenRate` / `formatTokenCount` / `contextOccupancy` / `contextRing` / `contextBand`。
- **吞吐**：`state.ts` 在该 attempt 首个 chunk 上锚定窗口，流式期间按已到字符数估算，`usage` 帧到达后用 provider `outputTokens` 覆盖；窗口 <100ms 不出数，显示 `—`。读数保留到下一轮。
- **上下文环**：分子 `ctx.tokenMeter.measure(session).totalTokens`（下一次请求的 prompt 压力），分母 `session.requestContext()?.contextWindow`。每条已提交 `session/event` 重读一次，因此 `compaction/*` 的 shadow price 落地即降档——**不必等下一次请求上报 usage**。`○/◔/◑/◕/●` 五档环，<60% ok、<85% warn、其余 error。
- **布局**：opencode 布局把环接在 `权限 <preset>` 右侧，输入框下方那一行改为右对齐的 `token 42.5/s · 使用量 12.3K`；classic 布局在会话标签后放环、右侧同一计量行。`COPY.classicHints` / `COPY.opencodeHints` 删除；`/` 面板与输入占位符仍承担命令发现。
- **依赖**：新增 `@deepseek-ai/dsh-token-meter`（peer + dev）与 tsconfig 项目引用；`pnpm install --lockfile-only` 只新增 3 行 importer 条目。
- **测试**：新增 `tests/status.spec.ts`（6 例）；`state.spec.ts` 覆盖吞吐估算→provider 采样替换、以及「压缩事件后占用从 80% 降到 20%」；`app.spec.ts` 覆盖两种布局的读数与环、以及无测量时的 `—`；REAL-composition 挂载真实 `TokenMeter` 并断言真实帧出现 `使用量` 与 `上下文 ○ 0%`。`vitest run packages/bundle/cli-app/tests` → **85/85 绿**；oxlint 0；`tsc -b tsconfig.host.json` 0；`verify-package-dependencies` 通过。

### 已知残余

流式吞吐的前半段是字符密度估算，不是 provider 计数；只有 attempt 结束的 `usage` 帧给出真值。要全过程精确需要 provider 增量上报 usage。

## 2026-09-12 四次反馈：拖动/缩放终端出现多份输入框

### 现象

拖动窗口边缘改宽度、或放大/缩小终端时，输入框（及状态行）在屏幕上出现多份，拖一次多一份。

### 根因

Ink 用 `eraseLines(previousLineCount)` 擦除上一帧，而这个行数是**上一帧写下来时的宽度**下算出的逻辑行数。终端在变窄时会把屏幕上的内容按新宽度**重新软折行**，那一帧因此占用了更多物理行；`eraseLines` 只擦到旧行数就停了，帧顶（输入框/状态行）留在屏上。下一次渲染再写一份，于是每缩窄一次就多一份。另：本进程同时有 Ink 自己的 `resize` 监听和 App 的 `useTerminalDims` 状态更新两条渲染路径，都会带着这个错误计数渲染，残留在拖动过程中会叠加。

### 修法

- **`ui/resize.ts`（新）**：在 Ink 之前包装 `stdout.write`（先注册 `resize` 监听，因此早于 Ink 自己的 `resized` 跑）。记住上一帧原文；缩窄时把接下来那次带 erase 前缀的写改写为「该帧按新宽度重排后的物理行数」——按 grapheme 逐字贪心装行（宽字符 2 格，`string-width`），加 Ink 附带的游标行。只改这一个重复计数：不清屏、不动 scrollback、不额外重绘。
- 变宽/同宽取消待用值（重排后行数变少，再放大就会擦进已提交的 scrollback）；擦除数已 ≥ 目标时不动手；一次缩窄只放大一次。Ink 的静态提交突发（`log.clear()` → 静态行裸写 → 活动帧裸写）与首帧裸写都建模（burst 以微任务为界，取最后一次裸写）；`\u001b[2J` 全屏重放丢弃模型，等下一次带 erase 前缀的渲染重新锚定。
- **接线**：`internals.render` 的实现抽成导出的 `renderApp(element, streams)`（stdout + 可选 stdin），在其中 `installResizeReflow` → `inkRender` → `unmount` 时 `restore()`。
- **依赖**：新增 `string-width`（宽字符/emoji 与 ANSI 剥离，避免按码点计数低估 CJK 行的物理行数）。
- **测试**：新增 `tests/resize.spec.ts`（13 例）。11 例用假流复现 Ink 的字节形状（放大、一次性、变宽取消、不缩短、静态突发、游离裸写、全屏重放、restore）；1 例用真实 Ink 渲染 App：缩窄后断言 Ink 写出的擦除数正是重排后的行数（实测 27 → 41）并在 unmount 后 `stdout.write` 复原。`vitest run packages/bundle/cli-app/tests` → **98/98 绿**；oxlint 0；`tsc -b tsconfig.host.json` 0。

### 已知残余

只在**缩窄**方向校正：变宽是否合并折行取决于终端实现（xterm/Windows Terminal 会，其它不一定），放大方向不做改写以免在「不合并」的终端上擦过头。活动区之外的裸写（第三方插件直接写 stdout）可能被误当作待校正的帧；只影响擦除数，不影响内容。真机拖动走查见 `manual-acceptance.md` ⓪-2。

## 2026-09-13 /sessions �� /new ʵ�������޸�

### ������������
1. �� `/sessions` ����ʷ�Ự��ִ�� `/new`���ɻỰ�����Բ������»Ự�����ϡ�
2. ����ִ�� `/new` ����������ջỰ��`/sessions` �б������û���δ��������ݵ� Session��
3. Session �б�������ʱ�����򣬶����ǰ����һ���û�����ʱ������

### �޸�����
- `/new` ��Ϊ�������� Session lifecycle �� `ExitRequest({ type: 'new' })`���� Session dispose �����������´��� fresh Session���������� viewport������� Static/transcript ������
- ��ǰ Session �����δ�����û����룬�� `/new` �������� Session�����Ǹ��õ�ǰ�� Session��
- `/sessions` �б���ȡ `sessionListMetadata` projection��ֻ�� `blank === false` �� Session �Ž����б���Ҳ���Ǳ�������Ѿ��ύ���û���Ϣ���� `/new` �����Ŀ� Session ����ʾ��
- �б����� `updatedAt`��ʹ�� `lastPromptAt` ��Ϊ�ʱ�䣻�б��� `updatedAt` �������С�
- Session picker ��ʱ����ʾͬ������ `updatedAt`��

### ��֤
- cli-app �ؼ� TS/TSX �ļ�ʹ�òֿ��� esbuild 0.28.1 �ֱ���� transform ��飬��ǰ���Ϊ 0 ���﷨ʧ�ܡ�
- `git diff --check` δ���� whitespace ����
- `pnpm exec tsc --noEmit` �ڵ�ǰ����ִ�л����޷������������û����� `pnpm.ps1` �Ҳ��� `node.exe`����˲��ܰ� TypeScript ȫ���������Ϊͨ����

### ����ʵ���ع�·��
```text
1. ���� code profile
2. ���롰�Ự A�����ȴ����
3. /sessions -> ѡ��Ự A
4. /new
   Ԥ�ڣ�����ֻ���µĿ��������������� A ����ʷ����
5. ����ִ�� /new 2~3 �Σ����������κ�����
6. /sessions
   Ԥ�ڣ���Щ�� Session ���������б���
7. �ص��Ự A������ڶ�����Ϣ
8. /sessions
   Ԥ�ڣ��Ự A ��ʱ����£����ƶ����б����
```
