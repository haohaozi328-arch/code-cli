/**
 * Every string the terminal renders, in one place. Centralizing the copy keeps
 * the Ink tree free of product literals and gives tests one source to assert
 * against, so the model's text and the renderer's text cannot drift.
 * @module @dsh-external/dsh-cli-app/ui/copy
 */
import type { ConnectStep } from './model.ts';
/** Product name shown in help text and the welcome wordmark. */
export declare const PRODUCT = "dsh cli";
/** Wordmark glyphs of the opencode-style welcome page, spelled left to right. */
export declare const WORDMARK: readonly string[];
/** User-visible copy shared by the classic and opencode layouts. */
export declare const COPY: {
    readonly approvalTitle: "工具调用确认";
    readonly approvalHint: "[a] 本次允许 · [r] 拒绝 · [Esc] 取消";
    readonly statusRunning: "运行中";
    readonly statusIdle: "空闲";
    readonly permissionLabel: "权限";
    readonly userLabel: "你";
    readonly assistantLabel: "● 助手";
    readonly sessionsTitle: "会话";
    readonly sessionsHint: "↑↓ 选择 · Enter 打开 · Esc 返回";
    readonly sessionsSearchPlaceholder: "搜索会话…";
    readonly sessionsEmpty: "暂无匹配会话";
    readonly sessionsSearchNote: "输入文字搜索";
    readonly choiceHint: "↑↓ 选择 · Enter 确认 · Esc 返回";
    readonly choiceEmpty: "暂无可选项";
    readonly choiceSearchNote: "输入以筛选";
    readonly choiceFilterPrefix: "筛选：";
    readonly choiceSearchEmpty: "无匹配项";
    readonly choiceTitleModel: "model";
    readonly choiceTitlePolicy: "approval policy";
    readonly choiceTitleConnectProvider: "connect provider";
    readonly choiceTitleConnectApi: "connect api";
    readonly choiceTitleSkills: "skills";
    readonly choiceTitleMcp: "mcp tools";
    readonly skillsUnavailable: "技能服务未挂载，无法列出技能";
    readonly skillsFailedPrefix: "/skills 失败：";
    readonly skillLoading: "扫描技能列表…";
    readonly mcpUnavailable: "当前会话未检测到挂载的 MCP 工具（可在 .dsh/mcp.json 中配置服务）";
    readonly mcpLoading: "扫描 MCP 服务与工具…";
    readonly policyAsk: "ask — 每次敏感工具先询问";
    readonly policyNever: "never — 拒绝所有敏感工具";
    readonly customProvider: "自定义模型商";
    readonly commandsHint: "快捷命令 · ↑↓ 选择 · Enter 执行 · Esc 关闭";
    readonly classicInputPlaceholder: "输入消息 · / 查看命令 · Ctrl+C 停止";
    readonly opencodeInputPlaceholder: "输入问题 · / 查看命令 · Ctrl+C 停止";
    readonly composerPlaceholder: "请输入你的问题，输入 / 查看命令";
    readonly tokenRateLabel: "token";
    readonly tokenRateUnit: "/s";
    readonly tokenUsageLabel: "使用量";
    readonly measurementUnavailable: "—";
    readonly contextLabel: "上下文";
    readonly todoTitle: "任务";
    readonly todoPanelHint: "Ctrl+T 折叠/展开任务面板";
    readonly queuedLabel: "已排队";
    readonly boardTitle: "dsh-taskboard";
    readonly boardHint: "Ctrl+B 返回对话 · ↑↓/PgUp PgDn 切回合 · ←→ 翻页 · /help 全部键位";
    readonly boardTurnNow: "当前回合";
    readonly boardLastTurn: "上回合";
    readonly boardTimeline: "回合时间线";
    readonly boardReplyGlyph: "●";
    readonly boardLiveCursor: "●";
    readonly boardAxisCursor: "❯";
    readonly boardLiveSuffix: "进行中";
    readonly boardMoreLines: "…还有";
    readonly boardMoreMessages: "…更早还有";
    readonly boardMoreLater: "…更晚还有";
    readonly boardPageHint: "←→ 翻页";
    readonly boardNoMessages: "该回合暂无对话内容";
    readonly axisEmpty: "（空回合）";
    readonly boardNavHint: "↑↓ 选择回合 · Home 回到最新 · End 最早 · Esc 返回对话";
    readonly boardQueueLabel: "排队";
    readonly boardEmptySpans: "暂无回合记录 · 发送第一条消息后开始记录";
    readonly boardNoTodos: "本会话暂无任务清单（agent 调 todo/write 后显示）";
    readonly boardApprovalPending: "有工具审批待处理 — 返回对话确认";
    readonly titleUsage: "/title <text> — 重命名当前会话";
    readonly titleCurrent: "当前标题";
    readonly titleEditorHint: "输入新标题 · Enter 确认 · Esc 取消";
    readonly titleUnavailable: "标题服务未挂载，无法重命名";
    readonly titleFailedPrefix: "/title 失败：";
    readonly welcomeTagline: "终端助手";
    readonly injectedPrefix: "〔injected〕";
    readonly errorGlyph: "⚠";
    readonly defaultToolGlyph: "⚙";
    readonly toolResultTruncated: "输出已折叠（完整结果仍保留）";
    readonly liveTailMore: "…还有";
    readonly liveTailRest: "行未显示 · 全文随回合结束打印";
    readonly inputNewlineMark: " ↵ ";
    readonly connectDone: "已连接模型商 {provider}，现在可使用 /model {provider}/模型ID 切换模型。";
};
/**
 * Per-step prompt for the interactive `/connect` wizard.
 * @param step - the wizard's current step.
 * @param provider - the provider id being configured.
 * @returns the prompt text.
 */
export declare function connectPrompt(step: ConnectStep, provider: string): string;
/** The `/help` transcript body, assembled from one place so it stays current. */
export declare const HELP_TEXT: string;
//# sourceMappingURL=copy.d.ts.map