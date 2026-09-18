# cli-app 人工真机走查清单

自动化侧（oxlint / vitest 71 / `tsc -b tsconfig.host.json` / REAL-composition）全部通过；以下链路依赖真实 TTY（滚轮、窗口缩放、控制键注入），自动化通道覆盖不到，需**人工在终端执行**。建议在 `D:\workspace\DeepSeek\dsh-cli` 目录启动：

```sh
pnpm dsh --profile cli --theme deep-forest
```

## 前置

- 确认状态栏出现 `空闲 · DeepSeek V4 Flash · <会话>`
- 凭证复用 `~/.dsh`，真实模型调用会产生少量 token 消耗

---

## ⓪ 渲染层回归（本轮修复重点）

1. **窗口缩放不黑屏**：让 agent 输出超过一屏，随意拉大/缩小终端窗口。**预期**：已写入的历史保持不动，只有底部的流式行/输入行重排；不出现黑屏、不出现字面量 `\x1b[2J` 之类的控制码文本。
2. **缩窄不残留输入框**：按住窗口边缘**连续缓慢缩窄**（每次几个字符宽），再按住拉宽回原样。**预期**：屏幕始终只有一份输入框/状态行；拖动过程中不堆积重复的输入框或状态行，松手后画面自动收敛干净（擦除数按新宽度重算）。若出现多份，记录终端程序与版本（校正按缩窄前的帧重排计算，终端若不重排软换行行则无需校正）。
3. **终端原生滚动**：鼠标滚轮向上滚动查看被顶出屏幕的历史。**预期**：由终端自身滚动，app 不拦截滚轮、不进入备用屏；滚轮选择文本不被鼠标上报干扰。
4. **会话切换重放历史**：`/sessions`（或 `/resume`）→ ↑↓ 选择另一个会话 →Enter。**预期**：先清空视口，再出现新会话的完整历史；屏幕上**不再残留** 旧会话内容（旧内容仍可向上滚动查看）；状态栏会话标签随之更新。
5. **切换后继续对话**：在新会话里追问一句。**预期**：历史上下文正确，流式输出落在新会话历史之后。
6. **`/clear`**：发送 `/clear`。**预期**：当前视口被清空并显示空屏 + 输入行；向上滚动仍能看到被清除前的 scrollback（设计如此）。
7. **`/new` 清屏**：在一个有内容的会话里 `/new`。**预期**：屏幕清空，旧会话内容不再显示在输入框上方。
8. **反复 `/new` 不产生空会话**：新会话里**什么都不输入**，连续 `/new` 多次，再 `/quit`，然后 `/sessions` 看目录。**预期**：目录**没有**多出一串空会话（最多只有你最后所在的那个未使用会话）。
9. **`/new` → 输入 → `/new`**：`/new` 后发一条消息，再 `/new`。**预期**：第二次 `/new` 正常开新会话（当前会话已有对话内容）。

---

## ① code profile（opencode 布局）

```sh
pnpm dsh --profile code --theme deep-forest
```

1. **空会话首屏**：居中 wordmark（`𝗖𝗢𝗗𝗘`）+ `DeepSeek 终端助手` + 居中输入面板（`> ` 提示 + 模型/权限/上下文行）+ 右下计量行 `token —/s · 使用量 0`
2. 发一条消息（如 `say ok`）：消息与输入区**靠左全宽**（不再居中），agent 回复流式靠左，**无 `你`/`● 助手` 前缀**；流式期间右下 `token` 出现真实速率（首个 chunk 后约 0.1s 起有数），结束后保留该读数
3. 窄终端（~80 列）空态内容仍水平居中、不溢出；拉宽后输入栏宽封顶
4. `Esc`/`Ctrl+C` 退出后，用 `pnpm dsh --profile cli` 确认 classic 布局未受影响（`❯ ` + 底部状态行：`空闲 · 模型 · 会话 · 上下文 ◔ n%` + 右侧同一计量行）

---

## ② 工具调用 → 审批 Modal → [a] 放行 → ✓ 卡片

1. 输入并发送：`在 D:/workspace/DeepSeek/dsh-cli 下运行 git status 并总结`
2. **预期**：模型 reasoning 后调 `bash`/`pwsh` 工具 → 出现工具行 `… 🐚 bash  command: git …`（running 态）
3. 若该调用触发审批 → 出现 **double 边框 `工具调用确认`** 面板：工具名 + `[a] 本次允许 · [r] 拒绝 · [Esc] 取消`
4. 按 `a`
5. **预期**：面板消失 → 工具行变 `✓ …` + 结果首行 → agent 继续总结
6. 全部结束状态栏回 `空闲`

> 备注：workspace-write 沙箱内多数常规读写**不触发审批**（策略 ask 只拦越界/敏感操作）。若全程无审批面板，属正常——请改用越界指令验证：`读取 C:/Windows/System32/config/SAM 文件头 16 字节并告诉我内容`。

## ③ [r] / [esc] 拒绝路径

1. 再次发送越界读取指令，审批面板出现后按 `r`
2. **预期**：工具行变 `x …`（error）**并显示拒绝原因**（`the user rejected tool "…"`），模型据此回复，会话不崩

## ④ /perm → 权限预设

1. 发送 `/perm`：**预期**弹出选择列表（有 permission-presets 服务时为 `read-only` / `workspace-write` / `danger-full-access`，否则 `ask`/`never`）
2. 选 `never` 后发同样的越界指令：**预期**不再弹面板，工具直接被拒（fail-closed），且错误结果在卡片上可见
3. 再用 `/perm workspace-write` 恢复

## ⑤ /model 切换后会话延续

1. 当前会话先聊几句（有历史）
2. 发送 `/model`：弹出真实模型目录（↑↓ + 回车）；或直接 `/model deepseek-official/deepseek-v4-flash`
3. **预期**：确认后 fork 出**新会话**（状态栏 session id 变化），历史全部重放，modelLabel 为指定 route
4. 追问一句确认上下文延续

## ⑥ /connect 模型商

1. 发送 `/connect`：弹出主流 provider 列表 + `自定义模型商`
2. 选一个 provider → 输入 API Key → Base URL（可空回车）→ 保存
3. **预期**：出现 `已连接模型商 …` 提示；`/model` 目录里出现该 provider 的模型
4. 自定义路径：选 `自定义模型商` → provider ID → API Key → Base URL →API 格式（OpenAI Chat/Responses、Anthropic）→ 模型 ID
5. API Key 只落 credentials，不出现在任何界面文本里

## ⑦ /compact 输出上屏 + 上下文降档

1. 会话积累几轮后记下权限右侧的 `上下文 ◑ n%`
2. 发送 `/compact`
3. **预期**：压缩摘要作为一条普通可见行上屏；**不等下一次提问**，状态行占用百分比当场下降（重新定价由 token-meter 的表面折叠给出）
4. 继续追问一句，模型仍可继续；右下累计 `使用量` 只增不减（压缩不退还历史累计用量）
5. `/feedback` 试发（若无交互表单则应有说明文本上屏）

## ⑧ 会话管理回归

- `/sessions` 打开 picker（↑↓/enter/esc，输入过滤）
- `/new` 在空会话里等价于重置视图（见⓪-6/7）；在有内容的会话里开新会话
- `/quit` 干净退出（任务管理器无残留 node/bin.ts 进程）

---

## 失败对照速查

| 现象 | 可能原因 |
|---|---|
| 缩放后黑屏/空屏 | 回归到「resize 时清屏」；确认 App 不再写清屏序列 |
| 缩窄后多份输入框/状态行 | `resize.ts` 未装上（`renderApp` 里必须在 `inkRender` 之前），或擦除数未按新宽度重算 |
| 变宽后历史少了几行 | 变宽方向的终端折行合并未校正（已知边界）；确认缩窄方向的擦除数没有被当成变宽值放大 |
| 屏幕出现 `\x1b[2J` 字面量 | 有调用点手写转义字符串；`CLEAR_VIEWPORT` 必须是真 ESC 字节 |
| `/new` 后旧对话还在上方 | 会话切换未调 `clearViewport`；查 glue 的 rerender 分支 |
| 切换会话后空白 | 静态列表 key 未随会话变化；确认根元素 key = session id |
| `/sessions` 里一堆空会话 | `/new` 未走未开始会话复用；查 `hasConversation` + `promptSubmitted` |
| 审批面板不出现 | 操作未越界（见②备注）或 `/perm never` 残留（先 `/perm workspace-write`） |
| [a] 后无 ✓ | answerer 未生效 → 查 `~/.dsh` 配置是否被旧版本缓存 |
| /model 后历史丢失 | 走了 fresh 而非 model-fork → 查状态栏 session id 是否变化 |
| /compact 无输出 | command 无 success text（正常：部分命令静默成功） |
| 中文/emoji 乱码 | 终端编码非 UTF-8；若仅个别字符串乱码则是源码二次编码问题 |

走查完成后，把结果记入 `.agents/notes/implemented/feature/2026-09-06-dsh-cli-app.md` 的「渲染与会话模型」与真机验收段。
