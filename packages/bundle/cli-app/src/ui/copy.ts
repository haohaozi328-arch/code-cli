/**
 * Every string the terminal renders, in one place. Centralizing the copy keeps
 * the Ink tree free of product literals and gives tests one source to assert
 * against, so the model's text and the renderer's text cannot drift.
 * @module @dsh-external/dsh-cli-app/ui/copy
 */

import type { ConnectStep } from './model.ts'

/** Product name shown in help text and the welcome wordmark. */
export const PRODUCT = 'dsh cli'

/** Wordmark glyphs of the opencode-style welcome page, spelled left to right. */
export const WORDMARK: readonly string[] = ['𝗖', '𝗢', '𝗗', '𝗘']

/** User-visible copy shared by the classic and opencode layouts. */
export const COPY = {
  approvalTitle: '工具调用确认',
  approvalHint: '[a] 本次允许 · [r] 拒绝 · [Esc] 取消',

  statusRunning: '运行中',
  statusIdle: '空闲',
  permissionLabel: '权限',
  userLabel: '你',
  assistantLabel: '● 助手',

  sessionsTitle: '会话',
  sessionsHint: '↑↓ 选择 · Enter 打开 · Esc 返回',
  sessionsSearchPlaceholder: '搜索会话…',
  sessionsEmpty: '暂无匹配会话',
  sessionsSearchNote: '输入文字搜索',

  choiceHint: '↑↓ 选择 · Enter 确认 · Esc 返回',
  choiceEmpty: '暂无可选项',
  choiceTitleModel: 'model',
  choiceTitlePolicy: 'approval policy',
  choiceTitleConnectProvider: 'connect provider',
  choiceTitleConnectApi: 'connect api',

  policyAsk: 'ask — 每次敏感工具先询问',
  policyNever: 'never — 拒绝所有敏感工具',

  customProvider: '自定义模型商',

  commandsHint: '快捷命令 · ↑↓ 选择 · Enter 执行 · Esc 关闭',

  classicInputPlaceholder: '输入消息 · / 查看命令 · Ctrl+C 停止',
  opencodeInputPlaceholder: '输入问题 · / 查看命令 · Ctrl+C 停止',
  composerPlaceholder: '请输入你的问题，输入 / 查看命令',

  tokenRateLabel: 'token',
  tokenRateUnit: '/s',
  tokenUsageLabel: '使用量',
  measurementUnavailable: '—',
  contextLabel: '上下文',

  welcomeTagline: '终端助手',

  injectedPrefix: '〔injected〕',
  errorGlyph: '⚠',
  defaultToolGlyph: '⚙',
  toolResultTruncated: '输出已折叠（完整结果仍保留）',
  inputNewlineMark: ' ↵ ',

  connectDone: '已连接模型商 {provider}，现在可使用 /model {provider}/模型ID 切换模型。',
} as const

/**
 * Per-step prompt for the interactive `/connect` wizard.
 * @param step - the wizard's current step.
 * @param provider - the provider id being configured.
 * @returns the prompt text.
 */
export function connectPrompt(step: ConnectStep, provider: string): string {
  switch (step) {
    case 'provider-id':
      return '输入自定义模型商 ID，例如 my-provider'
    case 'api-key':
      return `输入 ${provider} API Key`
    case 'base-url':
      return '输入 Base URL（可直接回车使用默认地址）'
    case 'api-format':
      return '选择 API 格式'
    case 'model-id':
      return '输入模型 ID，例如 qwen3-coder'
  }
}

/** The `/help` transcript body, assembled from one place so it stays current. */
export const HELP_TEXT: string = [
  `${PRODUCT} — DeepSeek 交互式终端`,
  '',
  '  /help             查看帮助',
  '  /clear            清空当前显示内容',
  '  /new              新建会话',
  '  /fork             从当前会话创建分支',
  '  /sessions         选择并打开历史会话',
  '  /model            切换模型（provider/model）',
  '  /perm             设置权限预设（沙箱 + 审批）',
  '  /connect          连接模型商（主流 + 自定义）',
  '  /compact /feedback /goal /plan   上下文、反馈、目标与计划命令',
  '  /quit, /exit      退出会话（也可使用 Ctrl+D）',
  '',
  '助手运行时，按 Ctrl+C 可停止当前任务。',
  '其他输入内容会直接发送给模型。',
].join('\n')
