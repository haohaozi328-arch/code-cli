import { i as resolveChrome, n as resolveTheme } from "./theme-S3yRhDT9.js";
import { randomUUID } from "node:crypto";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, Static, Text, render, useInput, useStdout } from "ink";
import z from "@deepseek-ai/schemastery";
import { brandString } from "@deepseek-ai/dsh-brand";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { SessionLogOffset, SessionSeq } from "@deepseek-ai/dsh-session";
import { assertNever } from "@deepseek-ai/dsh-util-values";
import { isUserInvocable } from "@deepseek-ai/dsh-skill";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import stringWidth from "string-width";
import { z as z$1 } from "zod";
/** Create one history store, optionally seeded chronologically (oldest first). */
function createPromptHistory(seed = []) {
	let entries = [];
	for (const text of seed) {
		const trimmed = text.trim();
		if (trimmed === "" || entries[0] === trimmed) continue;
		entries = [trimmed, ...entries];
	}
	entries = entries.slice(0, 100);
	let cursor = -1;
	let draft = "";
	return {
		remember(text) {
			const trimmed = text.trim();
			if (trimmed === "" || entries[0] === trimmed) return;
			entries = [trimmed, ...entries].slice(0, 100);
		},
		step(delta, current) {
			if (delta === 1) {
				if (entries.length === 0) return null;
				if (cursor === -1) draft = current;
				const next = Math.min(cursor + 1, entries.length - 1);
				if (next === cursor && cursor >= 0) return entries[cursor] ?? null;
				cursor = next;
				return entries[cursor] ?? null;
			}
			if (cursor === -1) return null;
			cursor -= 1;
			if (cursor === -1) return draft;
			return entries[cursor] ?? null;
		},
		reset() {
			cursor = -1;
		},
		entries() {
			return entries;
		}
	};
}
//#endregion
//#region lib/types/ui/copy.js
/**
* Every string the terminal renders, in one place. Centralizing the copy keeps
* the Ink tree free of product literals and gives tests one source to assert
* against, so the model's text and the renderer's text cannot drift.
* @module @dsh-external/dsh-cli-app/ui/copy
*/
/** Product name shown in help text and the welcome wordmark. */
const PRODUCT = "dsh cli";
/** Wordmark glyphs of the narrow welcome page, spelled left to right. */
const WORDMARK = [
	"𝗗",
	"𝗦",
	"𝗛"
];
/**
* Block-letter banner of the empty-session welcome page, one string per row.
* Every row is the same display width, so the page can centre it by measuring
* one of them, and the page falls back to {@link WORDMARK} when the terminal
* is narrower than {@link WELCOME_BANNER_WIDTH}.
*/
const WELCOME_BANNER = [
	"██████╗  ███████╗ ██╗  ██╗",
	"██╔══██╗ ██╔════╝ ██║  ██║",
	"██║  ██║ ███████╗ ███████║",
	"██║  ██║ ╚════██║ ██╔══██║",
	"██████╔╝ ███████║ ██║  ██║",
	"╚═════╝  ╚══════╝ ╚═╝  ╚═╝"
];
/** User-visible copy shared by the classic and opencode layouts. */
const COPY = {
	approvalTitle: "工具调用确认",
	approvalHint: "[a] 本次允许 · [r] 拒绝 · [Esc] 取消",
	statusRunning: "运行中",
	statusIdle: "空闲",
	permissionLabel: "权限",
	userLabel: "你",
	assistantLabel: "● 助手",
	sessionsTitle: "会话",
	sessionsHint: "↑↓ 选择 · Enter 打开 · Esc 返回",
	sessionsSearchPlaceholder: "搜索会话…",
	sessionsEmpty: "暂无匹配会话",
	sessionsSearchNote: "输入文字搜索",
	choiceHint: "↑↓ 选择 · Enter 确认 · Esc 返回",
	choiceEmpty: "暂无可选项",
	choiceSearchNote: "输入以筛选",
	choiceFilterPrefix: "筛选：",
	choiceSearchEmpty: "无匹配项",
	choiceTitleModel: "model",
	choiceTitlePolicy: "approval policy",
	choiceTitleConnectProvider: "connect provider",
	choiceTitleConnectApi: "connect api",
	choiceTitleSkills: "skills",
	choiceTitleMcp: "mcp tools",
	skillsUnavailable: "技能服务未挂载，无法列出技能",
	skillsFailedPrefix: "/skills 失败：",
	skillLoading: "扫描技能列表…",
	mcpUnavailable: "当前会话未检测到挂载的 MCP 工具（可在 .dsh/mcp.json 中配置服务）",
	mcpLoading: "扫描 MCP 服务与工具…",
	policyAsk: "ask — 每次敏感工具先询问",
	policyNever: "never — 拒绝所有敏感工具",
	customProvider: "自定义模型商",
	commandsHint: "快捷命令 · ↑↓ 选择 · Enter 执行 · Esc 关闭",
	classicInputPlaceholder: "输入消息 · / 查看命令 · Ctrl+C 停止",
	opencodeInputPlaceholder: "输入问题 · / 查看命令 · Ctrl+C 停止",
	composerPlaceholder: "请输入你的问题，输入 / 查看命令",
	tokenRateLabel: "token",
	tokenRateUnit: "/s",
	tokenUsageLabel: "使用量",
	measurementUnavailable: "—",
	contextLabel: "上下文",
	todoTitle: "任务",
	todoPanelHint: "Ctrl+T 折叠/展开任务面板",
	queuedLabel: "已排队",
	boardTitle: "dsh-taskboard",
	boardHint: "Ctrl+B 返回对话 · ↑↓/PgUp PgDn 切回合 · ←→ 翻页 · /help 全部键位",
	boardTurnNow: "当前回合",
	boardLastTurn: "上回合",
	boardTimeline: "回合时间线",
	boardReplyGlyph: "●",
	boardLiveCursor: "●",
	boardAxisCursor: "❯",
	boardLiveSuffix: "进行中",
	boardMoreLines: "…还有",
	boardMoreMessages: "…更早还有",
	boardMoreLater: "…更晚还有",
	boardPageHint: "←→ 翻页",
	boardNoMessages: "该回合暂无对话内容",
	axisEmpty: "（空回合）",
	boardNavHint: "↑↓ 选择回合 · Home 回到最新 · End 最早 · Esc 返回对话",
	boardQueueLabel: "排队",
	boardEmptySpans: "暂无回合记录 · 发送第一条消息后开始记录",
	boardNoTodos: "本会话暂无任务清单（agent 调 todo/write 后显示）",
	boardApprovalPending: "有工具审批待处理 — 返回对话确认",
	titleUsage: "/title <text> — 重命名当前会话",
	titleCurrent: "当前标题",
	titleEditorHint: "输入新标题 · Enter 确认 · Esc 取消",
	titleUnavailable: "标题服务未挂载，无法重命名",
	titleFailedPrefix: "/title 失败：",
	welcomeTagline: "终端助手",
	welcomeReady: "说出你要做的事，或按 / 打开命令面板",
	injectedPrefix: "〔injected〕",
	errorGlyph: "⚠",
	defaultToolGlyph: "⚙",
	toolResultTruncated: "输出已折叠（完整结果仍保留）",
	liveTailMore: "…还有",
	liveTailRest: "行未显示 · 全文随回合结束打印",
	inputNewlineMark: " ↵ ",
	pasteOpen: "【",
	pasteClose: "】",
	pasteEllipsis: "...",
	pasteCountSeparator: "，",
	pasteCountSuffix: "字符",
	connectDone: "已连接模型商 {provider}，现在可使用 /model {provider}/模型ID 切换模型。"
};
/**
* Per-step prompt for the interactive `/connect` wizard.
* @param step - the wizard's current step.
* @param provider - the provider id being configured.
* @returns the prompt text.
*/
function connectPrompt(step, provider) {
	switch (step) {
		case "provider-id": return "输入自定义模型商 ID，例如 my-provider";
		case "api-key": return `输入 ${provider} API Key`;
		case "base-url": return "输入 Base URL（可直接回车使用默认地址）";
		case "api-format": return "选择 API 格式";
		case "model-id": return "输入模型 ID，例如 qwen3-coder";
	}
}
/** The `/help` transcript body, assembled from one place so it stays current. */
const HELP_TEXT = [
	`${PRODUCT} — DeepSeek 交互式终端`,
	"",
	"  /help             查看帮助",
	"  /new              新建会话",
	"  /fork             从当前会话创建分支",
	"  /sessions         选择并打开历史会话",
	"  /model            切换模型（provider/model）",
	"  /perm             设置权限预设（沙箱 + 审批）",
	"  /connect          连接模型商（主流 + 自定义）",
	"  /title            重命名当前会话",
	"  /skills [筛选词]  选择并调用一个技能（skill）· 参数即列表筛选",
	"  /mcp [筛选词]     查看与选择 MCP 工具 · 参数即列表筛选",
	"  /quit, /exit      退出会话（也可使用 Ctrl+D）",
	"  Ctrl+T            折叠或展开任务面板",
	"  Ctrl+B            切换任务进程时间看板（dsh-taskboard）",
	"",
	"助手运行时，按 Ctrl+C 可停止当前任务。",
	"运行中输入的消息会自动排队，回合结束后依次发送。",
	"其他输入内容会直接发送给模型。"
].join("\n");
//#endregion
//#region lib/types/ui/render-error.js
/**
* Render a thrown value as one diagnostic line for the error banner.
* @param error - the caught value.
* @returns its message, or its string form for non-Error throws.
*/
function renderError(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region lib/types/ui/connect.js
/**
* `/connect` wizard: connects a model provider by persisting its route through
* the existing settings namespace and its secret through the credentials
* service. The API key never enters the UI snapshot; the controller holds it
* only until the provider is saved or the wizard is cancelled.
* @module @dsh-external/dsh-cli-app/ui/connect
*/
/** API protocols a custom provider may speak. */
const CONNECT_API_OPTIONS = [
	{
		label: "OpenAI Chat Completions",
		value: "openai-completions"
	},
	{
		label: "OpenAI Responses",
		value: "openai-responses"
	},
	{
		label: "Anthropic Messages",
		value: "anthropic-messages"
	}
];
/** Provider-picker value that starts the custom-provider flow. */
const CUSTOM_PROVIDER = "__custom__";
/** Stable credential reference for a connected provider; the secret itself never enters settings. */
function connectCredentialRef(provider) {
	return credentialRef(`DSH_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "CUSTOM"}_API_KEY`);
}
/** Persist one connected provider through the settings + credential seams. */
async function persistConnectedProvider(ctx, provider, apiKey, baseURL, api, modelId) {
	const settings = ctx.get("settings");
	const credentials = ctx.get("credentials");
	if (settings === void 0) throw new Error("connect: settings service is unavailable");
	if (credentials === void 0) throw new Error("connect: credentials service is unavailable");
	const ref = connectCredentialRef(provider);
	const profile = { apiKeyEnv: String(ref) };
	if (baseURL !== "") profile.baseURL = baseURL;
	if (api !== void 0) profile.api = api;
	if (modelId !== void 0) profile.models = [{
		id: modelId,
		name: modelId,
		contextWindow: 262144,
		maxTokens: 32768,
		input: ["text"]
	}];
	await settings.update("llm-pi-ai", { providers: { [provider]: profile } });
	await credentials.set(ref, apiKey);
}
/** Drives the `/connect` wizard for one live session. */
var ConnectController = class {
	ctx;
	host;
	wizard = null;
	apiKey = "";
	baseURL = "";
	api = "";
	/**
	* @param ctx - process context carrying the settings and credentials services.
	* @param host - renderer callbacks.
	*/
	constructor(ctx, host) {
		this.ctx = ctx;
		this.host = host;
	}
	/** Current wizard step, or null when no wizard is open. */
	get state() {
		return this.wizard;
	}
	/** Offer the configured providers plus a custom-entry row. */
	openPicker() {
		const items = (this.ctx.get("llm")?.listConfigurableProviders() ?? []).map((provider) => ({
			label: `${provider.displayName} (${provider.provider})`,
			value: provider.provider
		})).sort((left, right) => left.label.localeCompare(right.label));
		items.push({
			label: COPY.customProvider,
			value: CUSTOM_PROVIDER
		});
		this.host.showChoice({
			kind: "connect-provider",
			title: COPY.choiceTitleConnectProvider,
			items
		});
	}
	/**
	* Begin the wizard for one provider id (or the custom-provider row).
	* @param provider - the chosen provider id, or {@link CUSTOM_PROVIDER}.
	*/
	start(provider) {
		const custom = provider === CUSTOM_PROVIDER;
		this.forgetSecrets();
		this.wizard = {
			provider: custom ? "" : provider,
			custom,
			step: custom ? "provider-id" : "api-key"
		};
		this.host.closeChoice();
		this.host.changed();
	}
	/**
	* Feed the current text field to the wizard.
	* @param value - the raw text-field contents.
	*/
	submit(value) {
		const state = this.wizard;
		if (state === null) return;
		const text = value.trim();
		switch (state.step) {
			case "provider-id":
				if (!/^[a-z][a-z0-9-]*$/.test(text)) {
					this.host.fail("connect: provider ID must match [a-z][a-z0-9-]*");
					return;
				}
				this.wizard = {
					...state,
					provider: text,
					step: "api-key"
				};
				this.host.changed();
				return;
			case "api-key":
				if (text === "") {
					this.host.fail("connect: API key cannot be empty");
					return;
				}
				this.apiKey = text;
				this.wizard = {
					...state,
					step: "base-url"
				};
				this.host.changed();
				return;
			case "base-url":
				this.baseURL = text;
				if (state.custom) {
					this.wizard = {
						...state,
						step: "api-format"
					};
					this.host.showChoice({
						kind: "connect-api",
						title: COPY.choiceTitleConnectApi,
						items: [...CONNECT_API_OPTIONS]
					});
				} else this.finish();
				return;
			case "model-id":
				if (text === "") {
					this.host.fail("connect: model ID cannot be empty");
					return;
				}
				this.finish(text);
				return;
			case "api-format": return;
		}
	}
	/**
	* Confirm the custom provider's API format.
	* @param api - the chosen protocol value.
	* @returns whether the value was accepted.
	*/
	pickApi(api) {
		const state = this.wizard;
		if (state === null || state.step !== "api-format") return false;
		if (!CONNECT_API_OPTIONS.some((option) => option.value === api)) {
			this.host.fail(`connect: unsupported API format ${api}`);
			return false;
		}
		this.api = api;
		this.wizard = {
			...state,
			step: "model-id"
		};
		this.host.closeChoice();
		this.host.changed();
		return true;
	}
	/** Abandon the wizard and forget the secret. */
	cancel() {
		this.wizard = null;
		this.forgetSecrets();
		this.host.closeChoice();
		this.host.changed();
	}
	/** Forget the in-flight secret when the session ends. */
	dispose() {
		this.wizard = null;
		this.forgetSecrets();
	}
	/** Save the provider, then publish success or failure. */
	async finish(modelId) {
		const state = this.wizard;
		if (state === null) return;
		if (this.apiKey.trim() === "") {
			this.host.fail("connect: API key cannot be empty");
			return;
		}
		try {
			await persistConnectedProvider(this.ctx, state.provider, this.apiKey.trim(), this.baseURL.trim(), state.custom ? this.api : void 0, state.custom ? modelId?.trim() : void 0);
			this.wizard = null;
			this.forgetSecrets();
			this.host.notice(COPY.connectDone.replaceAll("{provider}", state.provider));
		} catch (failure) {
			this.host.fail(renderError(failure));
		}
		this.host.changed();
	}
	/** Drop the collected secret material. */
	forgetSecrets() {
		this.apiKey = "";
		this.baseURL = "";
		this.api = "";
	}
};
//#endregion
//#region lib/types/sessions.js
/**
* Session-surface helpers for the terminal app: persisted-session catalog
* (id/title/cwd/time/event count), fork-seed collection over a live session
* log, and display formatting. Pure reads: catalog rows come from the
* projection cache when available, with one read-only handle per uncached
* session as the fallback; titles come from the persisted projection cache.
* @module @dsh-external/dsh-cli-app/sessions
*/
/** Reasonable ceiling for one picker page; the catalog sorts newest first. */
const PICKER_LIMIT = 50;
/**
* Read the persisted-session catalog through official seams only.
* @param ctx - process context carrying the persistence and title-cache services.
* @returns the newest sessions, capped at one picker page.
*/
async function listPersistedSessions(ctx) {
	const persistence = ctx.get("sessionPersistence");
	if (persistence === void 0) return [];
	let snapshots;
	try {
		snapshots = await persistence.list();
	} catch {
		return [];
	}
	const cache = ctx.get("sessionProjectionCache");
	if (cache === void 0) return [];
	const rows = [];
	const metadatas = await Promise.all(snapshots.map(async (snapshot) => {
		return cachedListMetadata(cache, snapshot.header, SessionLogOffset(0)) ?? coldListMetadata(persistence, snapshot.header.id);
	}));
	for (const [index, snapshot] of snapshots.entries()) {
		const header = snapshot.header;
		const metadata = metadatas[index];
		if (metadata?.blank !== false) continue;
		rows.push({
			sessionId: header.id,
			title: cachedTitleOf(cache, header),
			cwd: header.cwd ?? null,
			createdAt: header.createdAt,
			updatedAt: metadata.lastPromptAt ?? header.createdAt,
			blank: false,
			parentSession: header.parentSession ?? null
		});
	}
	rows.sort((left, right) => right.updatedAt - left.updatedAt);
	return rows.slice(0, PICKER_LIMIT);
}
/** Read the list metadata projection without opening the session. */
function cachedListMetadata(cache, header, cut) {
	const value = (cache.cachedSnapshot?.(header, cut, ["sessionListMetadata"]))?.values["sessionListMetadata"];
	if (typeof value !== "object" || value === null) return void 0;
	const record = value;
	if (typeof record.blank !== "boolean") return void 0;
	return {
		blank: record.blank,
		lastPromptAt: typeof record.lastPromptAt === "number" ? record.lastPromptAt : null
	};
}
/**
* Derive the listing facts from the stored log itself: the fallback for
* sessions whose checkpoint lacks the unit (rows written before this bundle
* registered it) or whose seeded identity defeats the zero-I/O lookup. One
* read handle; the backend's parsed-log memo makes repeat picker opens cheap.
*/
async function coldListMetadata(persistence, id) {
	try {
		const handle = await persistence.open(id, "read");
		try {
			let blank = true;
			let lastPromptAt = null;
			for (const event of await handle.read()) {
				blank = blank && event.type !== "turn/start";
				if (event.type === "user/message" && event.data.source.kind === "user") lastPromptAt = event.time;
			}
			return {
				blank,
				lastPromptAt
			};
		} finally {
			await handle.close();
		}
	} catch {
		return;
	}
}
/** Best-effort zero-I/O title read: current cache row first, predecessor fallback. */
function cachedTitleOf(cache, header) {
	const service = cache;
	const title = (service.cachedSnapshot?.(header, SessionLogOffset(0), ["title"]))?.values["title"];
	if (typeof title === "string" && title !== "") return title;
	const oldTitle = (service.cachedPredecessorTitle?.(header, SessionLogOffset(0)))?.values["title"];
	return typeof oldTitle === "string" && oldTitle !== "" ? oldTitle : null;
}
/**
* The balanced completed-turn prefix of a live session log: every event up to
* and including the last `turn/end`. The in-flight turn is excluded (it cannot
* be replayed as a valid child session); before any completed turn the child
* starts fresh, so the caller omits the seed entirely. Mirrors the in-process
* fork provider's slice semantics.
* @param session - the session to slice.
* @returns the seed events, contiguous from seq 0; empty when no turn has completed.
*/
function collectForkSeed(session) {
	const events = session.snapshotEvents();
	let lastEnd = -1;
	for (let seq = 0; seq < events.length; seq++) if (events[seq]?.type === "turn/end") lastEnd = seq;
	return lastEnd >= 0 ? events.slice(0, lastEnd + 1) : [];
}
/**
* Short terminal-friendly relative time for a picker row.
* @param epochMs - creation time, Unix epoch milliseconds.
* @param now - reference time, injectable for tests.
* @returns the relative-time label.
*/
function formatWhen(epochMs, now = Date.now()) {
	const diff = now - epochMs;
	if (diff < 6e4) return "just now";
	const minutes = Math.floor(diff / 6e4);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	const date = new Date(epochMs);
	return `${date.getMonth() + 1}-${date.getDate()}`;
}
/**
* Terminal-friendly tail of a workspace path for picker rows and the label.
* @param cwd - absolute workspace path, or null when unrecorded.
* @returns the last two path segments, or an empty string.
*/
function shortCwd(cwd) {
	if (cwd === null || cwd === "") return "";
	const parts = cwd.replaceAll("\\", "/").split("/").filter(Boolean);
	if (parts.length <= 2) return parts.join("/");
	return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}
/**
* Display label for the current session in the status bar.
* @param summary - the session's title, id, and workspace.
* @returns the label text.
*/
function sessionLabel(summary) {
	const raw = summary.sessionId.startsWith("session-") ? summary.sessionId.slice(8) : summary.sessionId;
	const stem = summary.title ?? raw.slice(0, 12);
	const where = shortCwd(summary.cwd);
	return where === "" ? stem : `${stem} · ${where}`;
}
//#endregion
//#region lib/types/ui/status.js
/**
* Status-line arithmetic and formatting: generation throughput, cumulative
* usage, and context-window occupancy. The view model owns the live inputs and
* this module owns every number-to-text decision, so the classic status bar and
* the opencode composer cannot format the same fact two ways.
* @module @dsh-external/dsh-cli-app/ui/status
*/
/**
* Fixed text density for the live throughput estimate. It matches the token
* meter's own heuristic, so a streaming estimate and the provider sample that
* replaces it read on one scale.
*/
const CHARS_PER_TOKEN = 4;
/** Shortest window a rate may be derived from, so one burst cannot divide by ~0 ms. */
const MIN_RATE_WINDOW_MS = 100;
/** Ring fractions, low to full; five steps are the resolution the glyph set offers. */
const RING_GLYPHS = [
	"○",
	"◔",
	"◑",
	"◕",
	"●"
];
/**
* Heuristic tokens of text streamed so far in one attempt.
* @param chars - characters of text and reasoning streamed in this attempt.
* @returns the estimated token count.
*/
function estimateLiveTokens(chars) {
	return Math.ceil(chars / CHARS_PER_TOKEN);
}
/**
* Derive a throughput over one observation window.
* @param tokens - tokens credited to the window.
* @param elapsedMs - window length in milliseconds.
* @returns tokens per second, or null when the window is too short to divide by.
*/
function tokensPerSecond(tokens, elapsedMs) {
	if (elapsedMs < MIN_RATE_WINDOW_MS) return null;
	return tokens / (elapsedMs / 1e3);
}
/**
* Format a throughput for the status line.
* @param rate - tokens per second, or null before any sample.
* @returns the display text, using a dash before the first sample.
*/
function formatTokenRate(rate) {
	if (rate === null) return COPY.measurementUnavailable;
	return rate >= 100 ? String(Math.round(rate)) : rate.toFixed(1);
}
/**
* Format a token count compactly for the status line.
* @param tokens - token count.
* @returns the count, abbreviated with `K`/`M` above 1000.
*/
function formatTokenCount(tokens) {
	if (tokens < 1e3) return String(tokens);
	if (tokens < 1e6) return `${(tokens / 1e3).toFixed(1)}K`;
	return `${(tokens / 1e6).toFixed(1)}M`;
}
/**
* Resolve occupancy from independently updated tokens and capacity.
* @param usedTokens - tokens the next request's prompt would carry, or undefined before any measurement.
* @param contextWindow - newest recorded route capacity, or undefined when the adapter advertises none.
* @returns the bounded occupancy, or null while either input is unknown.
*/
function contextOccupancy(usedTokens, contextWindow) {
	if (usedTokens === void 0 || contextWindow === void 0) return null;
	return {
		percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)),
		usedTokens,
		contextWindow
	};
}
/**
* Ring glyph for one occupancy.
* @param percent - occupancy percentage, 0–100.
* @returns the fraction glyph nearest above the occupancy.
*/
function contextRing(percent) {
	const step = Math.ceil(Math.min(100, Math.max(0, percent)) / 25);
	return RING_GLYPHS[Math.min(step, RING_GLYPHS.length - 1)] ?? "○";
}
/**
* Pressure band a renderer maps to a theme colour.
* @param percent - occupancy percentage, 0–100.
* @returns `ok` below 60, `warn` below 85, `high` otherwise.
*/
function contextBand(percent) {
	if (percent < 60) return "ok";
	if (percent < 85) return "warn";
	return "high";
}
//#endregion
//#region lib/types/ui/transcript.js
/**
* Durable-log projection for the transcript. One projector serves both the
* initial replay of a session and every live `session/event`, so a resumed
* conversation and an in-flight one can never render differently. The durable
* log is the only source of truth; live assistant streaming paints separately
* and settles back into these rows.
* @module @dsh-external/dsh-cli-app/ui/transcript
*/
/**
* Extract plain text and reasoning from content blocks.
* @param content - the message content blocks.
* @returns the concatenated text and reasoning.
*/
function blocksToText(content) {
	let text = "";
	let reasoning = "";
	for (const block of content) switch (block.type) {
		case "text":
			if (text !== "") text += "\n\n";
			text += block.text;
			break;
		case "reasoning":
			if (reasoning !== "") reasoning += "\n";
			reasoning += block.text;
			break;
		default: break;
	}
	return {
		text,
		reasoning
	};
}
/**
* Collapse a long text into one readable hint line.
* @param text - the full text.
* @param max - longest line to keep before truncating.
* @returns the first non-empty line, truncated when needed.
*/
function collapseFirstLine(text, max = 80) {
	const trimmed = (text.split("\n").find((line) => line.trim() !== "") ?? "").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1)}…`;
}
/**
* Short one-line argument preview from a raw tool-arguments JSON string.
* @param argumentsJson - the tool call's raw arguments.
* @returns the preview text, or an empty string for empty/`{}` arguments.
*/
function argsSummaryOf(argumentsJson) {
	const trimmed = argumentsJson.trim();
	if (trimmed === "" || trimmed === "{}") return "";
	try {
		const parsed = JSON.parse(trimmed);
		for (const key of [
			"command",
			"path",
			"pattern",
			"text",
			"file_path",
			"action"
		]) {
			const value = parsed[key];
			if (typeof value === "string" && value !== "") return `${key}: ${collapseFirstLine(value, 60)}`;
		}
	} catch {}
	return collapseFirstLine(trimmed.replaceAll("\n", " "), 70);
}
/**
* One-line result preview from a tool result block's content.
* @param content - the result message's content blocks.
* @returns the preview text, or an empty string when no text block has content.
*/
function resultSummaryOf(content) {
	for (const block of content) if (block.type === "text" && block.text.trim() !== "") return collapseFirstLine(block.text.trim(), 90);
	return "";
}
/**
* Cumulative durable token usage across the log (a resumed session shows history, not zero).
* @param session - the live session.
* @returns the summed input, output, and reasoning tokens.
*/
function countDurableTokens(session) {
	const totals = {
		input: 0,
		output: 0,
		reasoning: 0
	};
	const length = session.seq;
	for (let seq = 0; seq < length; seq++) {
		const event = session.eventAt(SessionSeq(seq));
		if (event?.type === "assistant/message" && event.data.usage !== void 0) {
			totals.input += event.data.usage.inputTokens;
			totals.output += event.data.usage.outputTokens;
			totals.reasoning += event.data.usage.reasoningTokens ?? 0;
		}
	}
	return totals;
}
/** Settle one running tool card with its durable result. */
function settleToolRow(row, isError, summary) {
	return {
		...row,
		toolStatus: isError ? "error" : "done",
		toolResult: isError ? summary !== "" ? summary : "error" : summary
	};
}
/**
* Apply one durable session event to the transcript rows.
* @param rows - current rows, treated as immutable.
* @param event - the durable event to fold in.
* @returns a new row list, or `rows` itself when the event adds nothing.
*/
function projectEvent(rows, event) {
	if (event.type === "user/message") {
		if (rows.some((row) => row.key === event.data.id)) return rows;
		const { text } = blocksToText(event.data.content);
		if (text === "") return rows;
		const isUser = event.data.source.kind === "user";
		return [...rows, {
			key: event.data.id,
			role: "user",
			text: isUser ? text : `${COPY.injectedPrefix} ${collapseFirstLine(text)}`,
			reasoning: "",
			status: "done",
			...isUser ? {} : { system: true }
		}];
	}
	if (event.type === "assistant/message") {
		const key = `a:${event.seq}`;
		if (rows.some((row) => row.key === key)) return rows;
		const { text, reasoning } = blocksToText(event.data.message.content);
		if (text === "" && reasoning === "") return rows;
		return [...rows, {
			key,
			role: "assistant",
			text,
			reasoning,
			status: "done",
			seq: event.seq
		}];
	}
	if (event.type === "tool/call") {
		const key = `tool-${event.data.callId}`;
		if (rows.some((row) => row.key === key)) return rows;
		return [...rows, {
			key,
			role: "tool",
			text: "",
			reasoning: "",
			status: "done",
			toolName: event.data.name,
			argsSummary: argsSummaryOf(event.data.arguments),
			toolStatus: "running"
		}];
	}
	if (event.type === "tool/result") {
		const first = event.data.message.content[0];
		const index = rows.findIndex((row) => row.key === `tool-${first.toolCallId}`);
		const row = rows[index];
		if (row === void 0) return rows;
		const isError = event.data.error !== void 0 || first.isError === true;
		const next = [...rows];
		next[index] = settleToolRow(row, isError, resultSummaryOf(first.content));
		return next;
	}
	return rows;
}
/**
* Scan the durable log once and project it into transcript rows.
* @param session - the session to replay.
* @returns the projected rows.
*/
function replaySession(session) {
	let rows = [];
	const length = session.seq;
	for (let seq = 0; seq < length; seq++) {
		const event = session.eventAt(SessionSeq(seq));
		if (event !== void 0) rows = projectEvent(rows, event);
	}
	return rows;
}
/**
* True once the session holds real conversation content: a user-originated
* message or an assistant reply. Injected context alone does not count, so a
* launched-but-untouched session reads as empty.
* @param session - the session to inspect.
* @returns whether the durable log contains a conversation.
*/
function hasConversation(session) {
	const length = session.seq;
	for (let seq = 0; seq < length; seq++) {
		const event = session.eventAt(SessionSeq(seq));
		if (event?.type === "assistant/message") return true;
		if (event?.type === "user/message" && event.data.source.kind === "user") return true;
	}
	return false;
}
/**
* True once a row can never change again, so the static transcript may own it.
* @param row - the transcript row.
* @returns whether the row is settled.
*/
function isSettledRow(row) {
	return row.status === "done" && row.toolStatus !== "running";
}
/**
* Split the transcript into the stable prefix Ink writes once and the still-live
* suffix it repaints. The boundary is the first unsettled row, so an append that
* settles out of order can never print above live content.
* @param messages - the full row list, including hidden injected-context rows.
* @returns the static prefix and the live suffix.
*/
function splitTranscript(messages) {
	const visible = messages.filter((row) => row.system !== true);
	const boundary = visible.findIndex((row) => !isSettledRow(row));
	if (boundary === -1) return {
		committed: visible,
		live: []
	};
	return {
		committed: visible.slice(0, boundary),
		live: visible.slice(boundary)
	};
}
/**
* Fold one durable event into the task-checklist state, mirroring the official
* `todos` projection (tool-todo): the latest whole-list `todo/write` snapshot
* wins, a new turn clears the checklist while `turn/end` keeps it visible, and
* every other event returns the same state reference.
* @param todos - current checklist state, treated as immutable.
* @param event - the durable event to fold in.
* @returns the next checklist state.
*/
function projectTodos(todos, event) {
	if (event.type === "todo/write") return event.data.todos;
	if (event.type === "turn/start") return null;
	return todos;
}
/**
* Scan the durable log once and project the task-checklist state.
* @param session - the session to replay.
* @returns the checklist, or null before the first write.
*/
function replayTodos(session) {
	let todos = null;
	const length = session.seq;
	for (let seq = 0; seq < length; seq++) {
		const event = session.eventAt(SessionSeq(seq));
		if (event !== void 0) todos = projectTodos(todos, event);
	}
	return todos;
}
//#endregion
//#region lib/types/ui/todos.js
/** Marker and emphasis for one status. */
function todoMark(status) {
	if (status === "completed") return {
		mark: "[✓]",
		active: false,
		done: true
	};
	if (status === "in_progress") return {
		mark: "[•]",
		active: true,
		done: false
	};
	return {
		mark: "[ ]",
		active: false,
		done: false
	};
}
/** One checklist row. */
function TodoRow(props) {
	const { todo, theme } = props;
	const { mark, active, done } = todoMark(todo.status);
	return jsxs(Text, {
		color: done ? theme.ok : active ? theme.warn : theme.muted,
		dimColor: !active,
		children: [
			mark,
			" ",
			todo.content
		]
	});
}
/** The docked checklist the composer renders while the agent has open tasks. */
function TaskPanel(props) {
	const { todos, theme } = props;
	const done = todos.filter((todo) => todo.status === "completed").length;
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "round",
		borderColor: theme.brand,
		paddingX: 1,
		marginBottom: 1,
		children: [
			jsxs(Text, { children: [jsx(Text, {
				color: theme.brand,
				bold: true,
				children: COPY.todoTitle
			}), jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: [
					"  ",
					done,
					"/",
					todos.length
				]
			})] }),
			jsx(Box, {
				flexDirection: "column",
				marginTop: 1,
				children: todos.map((todo) => jsx(TodoRow, {
					todo,
					theme
				}, todo.content))
			}),
			jsx(Box, {
				marginTop: 1,
				children: jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.todoPanelHint
				})
			})
		]
	});
}
//#endregion
//#region lib/types/ui/spinner.js
/**
* The running indicator's animation arithmetic: opencode's braille dot cycle
* stepped on a fixed interval, plus the elapsed label. Pure so tests pin the
* cadence without timers; the App owns the clock.
* @module @dsh-external/dsh-cli-app/ui/spinner
*/
/** Braille frames cycled while the agent runs. */
const SPINNER_FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
/**
* Frame glyph for one point in the cycle.
* @param elapsedMs - milliseconds since the turn started; negative reads as zero.
* @returns the frame glyph.
*/
function spinnerFrame(elapsedMs) {
	return SPINNER_FRAMES[Math.floor(Math.max(0, elapsedMs) / 80) % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0] ?? "⠋";
}
/**
* Compact elapsed label for the running indicator.
* @param elapsedMs - milliseconds since the turn started; negative reads as zero.
* @returns `Ns` below a minute, then `MmSs`.
*/
function formatElapsed(elapsedMs) {
	const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1e3);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	return `${Math.floor(totalSeconds / 60)}m${totalSeconds % 60}s`;
}
/** Rows the board always spends on margins, border, title, meta, block labels, and the hint. */
const BOARD_CHROME_ROWS = 16;
/** Rows the content pane needs at minimum to show the newest message block. */
const PANE_MIN_ROWS = 11;
/** Cells the pane's padding and borders take away from the terminal width. */
const PANE_WIDTH_CHROME = 8;
/** Prompt/reply summary widths in the timeline rows. */
const PROMPT_WIDTH = 48;
const REPLY_WIDTH = 60;
/** The keyboard chord that swaps the board in and out: Ctrl+B. A plain control
* character by design — Windows Terminal encodes Alt+letter as `ESC letter`,
* so a Ctrl+Alt+letter chord reaches ink as plain Ctrl+letter (its keypress
* parser never sets `meta` for that shape) and the chord is unreachable.
* @param name - the parsed key name the useInput callback received.
* @param key - the ink modifier flags for the same event.
*/
function isBoardToggle(name, key) {
	return key.ctrl && !key.meta && name === "b";
}
/** `HH:MM` local clock label for a durable event timestamp. */
function formatClock(ms) {
	const date = new Date(ms);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
/**
* Move the timeline cursor one step from an ink key event. The cursor is an
* index into the entry list, with `-1` meaning "live" (the newest entry,
* following new events as they land).
* @param index - current cursor (`-1` for live).
* @param length - entry count; zero disables all movement.
* @param key - the parsed ink key flags of the navigation event.
* @returns the next cursor value.
*/
function stepTimelineCursor(index, length, key) {
	if (length === 0) return -1;
	const current = index === -1 ? length - 1 : Math.min(index, length - 1);
	if (key.upArrow) return current === 0 ? 0 : current - 1;
	if (key.downArrow) return current === length - 1 ? -1 : current + 1;
	return index;
}
/**
* Pack one turn's conversation into pane-sized pages, newest page first. Each
* page costs at most `budget` rendered rows; a message taller than the budget
* still gets a page of its own so packing always makes progress.
*/
function packPanePages(messages, budget) {
	const pages = [];
	let end = messages.length;
	while (end > 0) {
		let used = 0;
		let start = end;
		while (start > 0) {
			const message = messages[start - 1];
			if (message === void 0) break;
			const lines = message.role === "tool" ? 0 : message.text.split("\n").length;
			const cost = message.role === "tool" ? 1 : 2 + Math.min(8, lines) + (lines > 8 ? 1 : 0);
			const gap = start === end ? 0 : 1;
			if (used + cost + gap > budget) break;
			used += cost + gap;
			start -= 1;
		}
		if (start === end) start = end - 1;
		pages.push({
			start,
			end
		});
		end = start;
	}
	return pages;
}
/** Appends one conversation message, keeping only the most recent TURN_MESSAGE_LIMIT of them. */
function appendMessage(messages, message) {
	const next = [...messages, message];
	return next.length > 40 ? next.slice(-40) : next;
}
/** The turn counter carried by a `turn/*` event payload. */
function turnNumberOf(data) {
	const turn = data?.turn;
	return typeof turn === "number" ? turn : 0;
}
/** First human-readable text line of a durable `user/message` payload. */
function promptOf(data) {
	const content = data.content;
	if (!Array.isArray(content)) return "";
	if (data.source?.kind !== "user") return "";
	return collapseFirstLine(blocksToText(content).text, PROMPT_WIDTH);
}
/** First text line plus reported output tokens of a durable `assistant/message`. */
function replyOf(data) {
	const payload = data;
	const content = payload.message?.content;
	return {
		reply: Array.isArray(content) ? collapseFirstLine(blocksToText(content).text, REPLY_WIDTH) : "",
		outputTokens: typeof payload.usage?.outputTokens === "number" ? payload.usage.outputTokens : 0
	};
}
/** Full text of one conversation message payload. */
function messageText(data) {
	const payload = data;
	const content = payload.content ?? payload.message?.content;
	return Array.isArray(content) ? blocksToText(content).text : "";
}
/**
* Fold one committed session event into the conversation timeline. Pure and
* reference-stable: unchanged input returns the same array, a turn event or
* conversation content returns a fresh one.
* @param entries - entries folded so far.
* @param event - the committed session event (`type`/`time`/`data`).
* @returns the original array or the advanced one.
*/
function reduceTurnEntries(entries, event) {
	if (event.type === "turn/start") {
		const next = [...entries, {
			turn: turnNumberOf(event.data),
			startedAt: event.time,
			endedAt: null,
			prompt: "",
			reply: "",
			tools: [],
			outputTokens: 0,
			messages: []
		}];
		return next.length > 12 ? next.slice(next.length - 12) : next;
	}
	if (entries.length === 0) return entries;
	const open = entries.length - 1;
	const current = entries[open];
	if (current === void 0) return entries;
	if (event.type === "turn/end") {
		if (current.endedAt !== null) return entries;
		const next = [...entries];
		next[open] = {
			...current,
			endedAt: event.time
		};
		return next;
	}
	if (event.type === "user/message") {
		const prompt = promptOf(event.data);
		if (prompt === "") return entries;
		const next = [...entries];
		const messages = appendMessage(current.messages, {
			role: "user",
			time: event.time,
			text: messageText(event.data)
		});
		next[open] = {
			...current,
			prompt,
			messages
		};
		return next;
	}
	if (event.type === "assistant/message") {
		const { reply, outputTokens } = replyOf(event.data);
		const text = messageText(event.data);
		if (reply === "" && outputTokens === 0 && text === "") return entries;
		const next = [...entries];
		next[open] = {
			...current,
			...reply !== "" ? { reply } : {},
			outputTokens: current.outputTokens + outputTokens,
			...text === "" ? {} : { messages: appendMessage(current.messages, {
				role: "assistant",
				time: event.time,
				text
			}) }
		};
		return next;
	}
	if (event.type === "tool/call") {
		const name = event.data.name;
		if (typeof name !== "string" || name === "") return entries;
		const next = [...entries];
		next[open] = {
			...current,
			...current.tools.includes(name) ? {} : { tools: [...current.tools, name] },
			messages: appendMessage(current.messages, {
				role: "tool",
				time: event.time,
				text: "",
				toolName: name
			})
		};
		return next;
	}
	return entries;
}
/**
* Fold a durable event slice into the board's conversation timeline (the
* resume path: history recorded before this process started).
* @param events - the durable events to fold, in seq order.
* @returns the final entries, oldest last.
*/
function collectTurnEntries(events) {
	let entries = [];
	for (const event of events) entries = reduceTurnEntries(entries, event);
	return entries;
}
/** Duration label for one entry; the open entry reads live while running. */
function entryDuration(entry, running, elapsedMs) {
	if (entry.endedAt !== null) return formatElapsed(entry.endedAt - entry.startedAt);
	return running ? formatElapsed(elapsedMs) : COPY.measurementUnavailable;
}
/** One grapheme segmenter reused by width-aware truncation. */
const GRAPHEMES$1 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/** Truncate one line to display cells so it can never wrap into a second physical row. */
function truncateToWidth(value, columns) {
	if (stringWidth(value) <= columns) return value;
	let out = "";
	let used = 0;
	for (const { segment } of GRAPHEMES$1.segment(value)) {
		const width = stringWidth(segment);
		if (used + width > columns - 1) break;
		out += segment;
		used += width;
	}
	return `${out}…`;
}
/** Render at most the first lines of one conversation message, each capped to one physical row. */
function renderLines(text, theme, key, columns) {
	const lines = text.split("\n");
	const shown = lines.slice(0, 8);
	const rest = lines.length - shown.length;
	return jsxs(Box, {
		flexDirection: "column",
		children: [shown.map((line, index) => jsx(Text, {
			wrap: "end",
			children: truncateToWidth(line, Math.max(20, columns - PANE_WIDTH_CHROME))
		}, `${key}:${index}`)), rest > 0 && jsxs(Text, {
			color: theme.muted,
			dimColor: true,
			children: [
				COPY.boardMoreLines,
				" ",
				rest
			]
		})]
	}, key);
}
/** One timeline axis row; the cursor marks the entry shown in the content pane. */
function AxisRow(props) {
	const { entry, selected, live, running, elapsedMs, theme } = props;
	const open = entry.endedAt === null;
	const cursor = live ? COPY.boardLiveCursor : selected ? COPY.boardAxisCursor : " ";
	const summary = entry.prompt !== "" ? entry.prompt : entry.reply !== "" ? entry.reply : COPY.axisEmpty;
	return jsxs(Text, {
		color: selected || live ? theme.text : theme.muted,
		dimColor: !selected && !live,
		children: [
			jsxs(Text, {
				color: live ? theme.warn : selected ? theme.brand : theme.muted,
				bold: selected,
				children: [cursor, " "]
			}),
			`#${entry.turn} ${formatClock(entry.startedAt)}→${open ? "··" : formatClock(entry.endedAt ?? entry.startedAt)} ${entryDuration(entry, running, elapsedMs)}  `,
			collapseFirstLine(summary, PROMPT_WIDTH)
		]
	});
}
/** The full-screen task-progress-and-time board with a draggable timeline. */
function TaskBoard(props) {
	const { state, theme, elapsedMs, cursor, rows, columns } = props;
	const page = props.panePage ?? 0;
	const todos = state.todos;
	const done = todos?.filter((todo) => todo.status === "completed").length ?? 0;
	const length = state.turnTimeline.length;
	const selected = cursor === -1 ? length - 1 : Math.min(cursor, length - 1);
	const entry = selected >= 0 ? state.turnTimeline[selected] : void 0;
	const live = cursor === -1;
	const todoRows = todos !== null && todos.length > 0 ? todos.length : 1;
	const available = Math.max(6, rows) - BOARD_CHROME_ROWS - todoRows - (state.pendingApproval !== null ? 2 : 0);
	const axisRows = Math.min(12, Math.max(1, Math.floor(available / 2)));
	const paneBudget = Math.max(0, available - axisRows - 1);
	const paneVisible = entry !== void 0 && paneBudget >= PANE_MIN_ROWS;
	const shownAxisCount = paneVisible ? axisRows : Math.min(12, Math.max(1, available));
	let paneMessages = [];
	let paneDropped = 0;
	let paneLater = 0;
	let panePageCount = 1;
	if (paneVisible && entry.messages.length > 0) {
		const pages = packPanePages(entry.messages, paneBudget);
		const window = pages[Math.min(Math.max(0, page), pages.length - 1)];
		if (window !== void 0) {
			paneMessages = entry.messages.slice(window.start, window.end);
			paneDropped = window.start;
			paneLater = entry.messages.length - window.end;
			panePageCount = pages.length;
		}
	}
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "round",
		borderColor: theme.brand,
		paddingX: 1,
		margin: 1,
		children: [
			jsxs(Text, { children: [jsx(Text, {
				color: theme.brand,
				bold: true,
				children: COPY.boardTitle
			}), jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: ["  ·  ", state.sessionLabel]
			})] }),
			jsx(Box, {
				marginTop: 1,
				flexDirection: "column",
				children: jsxs(Text, {
					color: theme.muted,
					dimColor: true,
					children: [
						state.modelLabel,
						" · ",
						COPY.permissionLabel,
						" ",
						jsx(Text, {
							color: theme.brand,
							children: state.permissionPreset
						}),
						state.contextOccupancy !== null && jsxs(Text, { children: [
							" · ",
							COPY.contextLabel,
							" ",
							jsxs(Text, {
								color: contextBand(state.contextOccupancy.percent) === "ok" ? theme.ok : contextBand(state.contextOccupancy.percent) === "warn" ? theme.warn : theme.error,
								children: [
									contextRing(state.contextOccupancy.percent),
									" ",
									state.contextOccupancy.percent,
									"%"
								]
							})
						] }),
						" · ",
						COPY.tokenUsageLabel,
						" ",
						formatTokenCount(state.tokens.input + state.tokens.output)
					]
				})
			}),
			jsxs(Box, {
				marginTop: 1,
				flexDirection: "column",
				children: [jsx(Text, {
					color: theme.brand,
					bold: true,
					children: COPY.boardTimeline
				}), length === 0 ? jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.boardEmptySpans
				}) : [...state.turnTimeline].reverse().slice(0, shownAxisCount).map((row, reverseIndex) => {
					const index = length - 1 - reverseIndex;
					return jsx(AxisRow, {
						entry: row,
						selected: index === selected,
						live: index === length - 1 && live,
						running: state.running && index === length - 1,
						elapsedMs,
						theme
					}, `${row.turn}:${row.startedAt}`);
				})]
			}),
			paneVisible && jsxs(Box, {
				marginTop: 1,
				flexDirection: "column",
				borderStyle: "single",
				borderColor: theme.muted,
				paddingX: 1,
				children: [jsxs(Text, { children: [
					jsx(Text, {
						color: theme.brand,
						bold: true,
						children: `#${entry.turn} ${formatClock(entry.startedAt)} → ${entry.endedAt === null ? "··" : formatClock(entry.endedAt)}  ${entryDuration(entry, state.running, elapsedMs)}`
					}),
					entry.outputTokens > 0 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							" · ",
							formatTokenCount(entry.outputTokens),
							" tok"
						]
					}),
					entry.endedAt === null && state.running && jsxs(Text, {
						color: theme.warn,
						children: [" · ", COPY.boardLiveSuffix]
					}),
					panePageCount > 1 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							" · ",
							page + 1,
							"/",
							panePageCount,
							" ",
							COPY.boardPageHint
						]
					})
				] }), entry.messages.length === 0 ? jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.boardNoMessages
				}) : jsxs(Fragment, { children: [
					paneDropped > 0 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							COPY.boardMoreMessages,
							" ",
							paneDropped
						]
					}),
					paneMessages.map((message, index) => {
						if (message.role === "tool") return jsxs(Text, {
							color: theme.muted,
							dimColor: true,
							children: [
								COPY.defaultToolGlyph,
								" ",
								message.toolName
							]
						}, `t:${message.time}:${index}`);
						const label = message.role === "user" ? jsxs(Text, {
							color: theme.brand,
							children: [COPY.userLabel, ": "]
						}) : jsxs(Text, {
							color: theme.ok,
							children: [COPY.boardReplyGlyph, ": "]
						});
						return jsxs(Box, {
							marginTop: index === 0 ? 0 : 1,
							flexDirection: "column",
							children: [jsx(Text, { children: label }), renderLines(message.text, theme, `m:${message.time}:${index}`, columns)]
						}, `m:${message.time}:${index}`);
					}),
					paneLater > 0 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							COPY.boardMoreLater,
							" ",
							paneLater
						]
					})
				] })]
			}),
			jsxs(Box, {
				marginTop: 1,
				flexDirection: "column",
				children: [jsxs(Text, { children: [
					jsx(Text, {
						color: theme.brand,
						bold: true,
						children: COPY.todoTitle
					}),
					todos !== null && todos.length > 0 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							"  ",
							done,
							"/",
							todos.length
						]
					}),
					state.running && jsxs(Text, {
						color: theme.warn,
						children: [
							"  ·  ",
							spinnerFrame(elapsedMs),
							" ",
							COPY.statusRunning,
							" · ",
							formatElapsed(elapsedMs)
						]
					}),
					state.queued.length > 0 && jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							"  ·  ",
							COPY.boardQueueLabel,
							" ",
							state.queued.length
						]
					})
				] }), todos === null || todos.length === 0 ? jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.boardNoTodos
				}) : todos.map((todo) => jsx(TodoRow, {
					todo,
					theme
				}, todo.content))]
			}),
			state.pendingApproval !== null && jsx(Box, {
				marginTop: 1,
				children: jsxs(Text, {
					color: theme.warn,
					children: [
						COPY.errorGlyph,
						" ",
						COPY.boardApprovalPending
					]
				})
			}),
			jsx(Box, {
				marginTop: 1,
				children: jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.boardHint
				})
			})
		]
	});
}
//#endregion
//#region lib/types/ui/state.js
/**
* Terminal UI view model: owns the durable-log replay, the live event wiring
* (assistant-stream increments + session/event settlements), and the user
* actions (send / stop / quit / commands). It is the single boundary between
* the dsh process world and the Ink React world.
*
* Consistency rule: the durable session log is the source of truth. Live
* assistant-stream frames only paint the in-flight message incrementally; a
* committed end frame rebuilds that message from the log event (seq), so the
* UI never diverges from what a later replay would render.
* @module @dsh-external/dsh-cli-app/ui/state
*/
/** The most recent approval policy recorded in the log, or the default. */
function lastApprovalPolicy(session) {
	for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
		const event = session.eventAt(SessionSeq(seq));
		if (event?.type === "approval/policy") return event.data.policy;
	}
	return "ask";
}
/** Human-readable status-bar label for a `provider/model` route. */
function modelLabelOf(raw) {
	return raw.split("-").filter(Boolean).map((part) => part.toLowerCase() === "deepseek" ? "DeepSeek" : part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
/**
* In-process approval bridge: the agent-scope answerer calls {@link
* ApprovalBus.request} (which suspends until the UI answers), the UI observes
* the prompt and calls {@link ApprovalBus.answer}.
* @returns a fresh bridge for one session.
*/
function createApprovalBus() {
	const listeners = /* @__PURE__ */ new Set();
	let pending = null;
	let resolver = null;
	const emit = () => {
		for (const listener of [...listeners]) listener(pending);
	};
	return {
		onPrompt(callback) {
			listeners.add(callback);
			callback(pending);
			return () => {
				listeners.delete(callback);
			};
		},
		request(prompt) {
			if (pending !== null || resolver !== null) throw new Error("cli-app: overlapping approval requests; the first question is still open");
			pending = prompt;
			emit();
			return new Promise((resolve) => {
				resolver = resolve;
			});
		},
		answer(outcome) {
			if (pending === null || resolver === null) return;
			pending = null;
			const finish = resolver;
			resolver = null;
			emit();
			finish(outcome);
		}
	};
}
/**
* Build the view model for one live agent.
* @param options - the process context (event source), the live agent, its session, and its host hooks.
* @returns the view model the Ink app renders and drives.
*/
function createViewModel(options) {
	const { ctx, agent, session, flush, sessionLabel: sessionLabel$1, catalog, approvalBus, requestScreenClear } = options;
	const listeners = /* @__PURE__ */ new Set();
	let messages = replaySession(session);
	let running = false;
	let error = null;
	let pickerOpen = false;
	let choicePicker = null;
	let choiceEpoch = 0;
	let titleEditor = null;
	let pendingApproval = null;
	let transcriptEpoch = 0;
	let noticeSeq = 0;
	let todos = replayTodos(session);
	let queued = [];
	let turnTimeline = collectTurnEntries(session.snapshotEvents());
	let boardOpen = false;
	const tokens = countDurableTokens(session);
	const pickerItems = catalog;
	const history = options.promptHistory ?? createPromptHistory();
	for (const message of [...messages].reverse()) if (message.role === "user" && !message.system) history.remember(message.text);
	let currentTitle = null;
	let labelValue = sessionLabel$1;
	const applyTitle = (title) => {
		if (title === currentTitle) return;
		currentTitle = title;
		const next = sessionLabel({
			title,
			sessionId: session.id,
			cwd: session.header.cwd ?? null
		});
		if (next === labelValue) return;
		labelValue = next;
		notify();
	};
	const meter = ctx.get("tokenMeter");
	let tokenRate = null;
	let attemptAnchorMs = null;
	let attemptChars = 0;
	let context = contextOccupancy(meter?.measure(session).totalTokens, session.requestContext()?.contextWindow);
	/** Latest durable title from the live log, or null when never titled. */
	const durableTitle = () => {
		const events = session.snapshotEvents();
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const event = events[index];
			if (event?.type === "session/title") return event.data.title;
		}
		return null;
	};
	let snapshot = null;
	const notify = () => {
		snapshot = null;
		for (const listener of [...listeners]) listener();
	};
	let streamNotifyTimer = null;
	const scheduleStreamNotify = () => {
		if (streamNotifyTimer !== null) return;
		streamNotifyTimer = setTimeout(() => {
			streamNotifyTimer = null;
			notify();
		}, 16);
	};
	const setMessages = (next, immediate = true) => {
		if (next === messages) return;
		messages = next;
		if (immediate) notify();
		else scheduleStreamNotify();
	};
	const appendNotice = (text) => {
		noticeSeq += 1;
		setMessages([...messages, {
			key: `notice-${noticeSeq}`,
			role: "assistant",
			text,
			reasoning: "",
			status: "done"
		}]);
	};
	const setRunning = (value) => {
		if (running === value) return;
		running = value;
		notify();
	};
	const setError = (value) => {
		if (error === value) return;
		error = value;
		notify();
	};
	const setQueued = (next) => {
		queued = next;
		notify();
	};
	const setPickerOpen = (value) => {
		if (pickerOpen === value) return;
		pickerOpen = value;
		notify();
	};
	const setChoicePicker = (value) => {
		if (choicePicker === value) return;
		choicePicker = value;
		choiceEpoch += 1;
		notify();
	};
	const setTokens = (usage) => {
		tokens.input += usage.input;
		tokens.output += usage.output;
		tokens.reasoning += usage.reasoning ?? 0;
		notify();
	};
	/**
	* Re-read context occupancy from the token meter and the durable route
	* record. The meter prices the surface, so a compaction that shadows a range
	* lowers this figure as soon as its events land —before the next request
	* reports usage.
	*/
	const refreshOccupancy = () => {
		const next = contextOccupancy(meter?.measure(session).totalTokens, session.requestContext()?.contextWindow);
		if (next === null ? context === null : context !== null && next.percent === context.percent && next.usedTokens === context.usedTokens && next.contextWindow === context.contextWindow) return;
		context = next;
		notify();
	};
	/**
	* Anchor the attempt window on its first streamed chunk and publish a live
	* throughput estimate from the characters seen so far.
	*/
	const sampleLiveRate = (at) => {
		if (attemptAnchorMs === null) {
			attemptAnchorMs = at;
			return;
		}
		const rate = tokensPerSecond(estimateLiveTokens(attemptChars), at - attemptAnchorMs);
		if (rate !== null) tokenRate = rate;
	};
	let resolved = false;
	let resolveDone = () => {};
	const done = new Promise((resolve) => {
		resolveDone = resolve;
	});
	const exitFn = (request) => {
		if (resolved) return;
		resolved = true;
		resolveDone(request);
	};
	const requestQuit = () => {
		exitFn({ type: "quit" });
	};
	/** Submit one user prompt: paint the row, wake the agent, flush on settle. */
	const submitPrompt = (text) => {
		setError(null);
		const message = createUserMessage({
			content: [{
				type: "text",
				text
			}],
			source: { kind: "user" }
		});
		setMessages([...messages, {
			key: message.id,
			role: "user",
			text,
			reasoning: "",
			status: "done"
		}]);
		agent.followup(message);
		setRunning(true);
		agent.whenIdle().then(() => flush === void 0 ? void 0 : flush(session)).catch((failure) => {
			setError(renderError(failure));
		});
	};
	/**
	* Prompt half of send(): the running gate queues typed prompts FIFO; an
	* idle agent receives the text directly. The skill-command route shares it
	* so a recognized `/name` line queues exactly like plain prose.
	* @param text - the original line as typed.
	* @param trimmed - its trimmed form (queued and remembered).
	*/
	const submitOrQueue = (text, trimmed) => {
		if (running) {
			history.remember(trimmed);
			setQueued([...queued, trimmed]);
			return;
		}
		history.remember(trimmed);
		submitPrompt(text);
	};
	/** Validate and request a model-route switch; shared by /model and the picker. */
	const submitModelSpec = (spec) => {
		const trimmed = spec.trim();
		if (!trimmed.includes("/")) {
			setError("model must be provider/model, e.g. deepseek-official/deepseek-v4-flash");
			return;
		}
		exitFn({
			type: "model-switch",
			spec: trimmed
		});
	};
	const permissionService = ctx.get("permissionPresets");
	let permissionPolicy = lastApprovalPolicy(session);
	let permissionPreset = permissionService === void 0 ? permissionPolicy : permissionService.current(session);
	const skillRegistry = ctx.get("skills");
	const openModelPicker = () => {
		const currentProvider = agent.options.provider ?? "deepseek-official";
		const configured = ctx.get("settings")?.get("llm-pi-ai");
		const providers = [...new Set([currentProvider, ...Object.keys(configured?.providers ?? {})])].filter(Boolean);
		const fallback = [{
			label: "deepseek-v4-flash",
			value: `${currentProvider}/deepseek-v4-flash`
		}];
		Promise.all(providers.map(async (provider) => {
			return (await Promise.resolve(ctx.get("llm")?.listModels(provider)) ?? []).map((model) => ({
				label: model.name !== model.id ? `${model.name} (${provider}/${model.id})` : `${provider}/${model.id}`,
				value: `${provider}/${model.id}`
			}));
		})).then((groups) => {
			const items = groups.flat();
			setChoicePicker({
				kind: "model",
				title: COPY.choiceTitleModel,
				items: items.length > 0 ? items : fallback
			});
		}).catch(() => {
			setChoicePicker({
				kind: "model",
				title: COPY.choiceTitleModel,
				items: fallback
			});
		});
	};
	const openPolicyPicker = () => {
		const items = permissionService === void 0 ? [{
			label: COPY.policyAsk,
			value: "ask"
		}, {
			label: COPY.policyNever,
			value: "never"
		}] : permissionService.names.map((name) => {
			const option = permissionService.optionOf(name);
			return {
				label: option.description === void 0 ? option.name : `${option.name} —${option.description}`,
				value: option.value
			};
		});
		setChoicePicker({
			kind: "policy",
			title: COPY.choiceTitlePolicy,
			items
		});
	};
	/** Apply one permission preset (sandbox + approval) or a bare approval policy. */
	const applyPolicy = (policy) => {
		if (permissionService !== void 0 && permissionService.names.includes(policy)) {
			permissionService.set(session, policy);
			permissionPreset = permissionService.current(session);
			permissionPolicy = permissionService.resolve(policy).approval;
		} else if (policy === "ask" || policy === "never") {
			ctx.get("approval")?.setPolicy(agent, policy);
			permissionPolicy = policy;
			permissionPreset = permissionService?.current(session) ?? policy;
		} else {
			setError(permissionService === void 0 ? "usage: /perm ask | never" : `usage: /perm ${permissionService.names.join(" | ")}`);
			return;
		}
		setChoicePicker(null);
		notify();
	};
	/**
	* Open the `/skills` list: the user-invocable skills this session's
	* composition exposes, optionally narrowed by the text the command carried.
	* @param filter - initial filter for the picker's type-to-filter field.
	*/
	const openSkillPicker = (filter = "") => {
		if (skillRegistry === void 0) {
			appendNotice(COPY.skillsUnavailable);
			return;
		}
		const seeded = filter === "" ? {} : { filter };
		setChoicePicker({
			kind: "skill",
			title: COPY.choiceTitleSkills,
			items: [],
			note: COPY.skillLoading,
			...seeded
		});
		const loadEpoch = choiceEpoch;
		skillRegistry.list({
			cwd: session.header.cwd,
			scope: agent
		}).then((skills) => {
			if (choiceEpoch !== loadEpoch) return;
			const items = skills.filter(isUserInvocable).map((skill) => {
				const description = skill.description.replace(/\s+/g, " ").trim();
				return {
					label: `/${skill.name}`,
					value: skill.name,
					...description === "" ? {} : { description }
				};
			});
			if (items.length === 0) {
				setChoicePicker(null);
				appendNotice(COPY.skillsUnavailable);
				return;
			}
			setChoicePicker({
				kind: "skill",
				title: COPY.choiceTitleSkills,
				items,
				...seeded
			});
		}).catch((failure) => {
			if (choiceEpoch !== loadEpoch) return;
			setChoicePicker(null);
			appendNotice(`${COPY.skillsFailedPrefix}${renderError(failure)}`);
		});
	};
	/**
	* Open the `/mcp` list: all MCP tools this session's composition exposes
	* (prefixed with `mcp__`), optionally narrowed by the text the command carried.
	* @param filter - initial filter for the picker's type-to-filter field.
	*/
	const openMcpPicker = (filter = "") => {
		const toolsService = ctx.get("tools");
		if (toolsService === void 0 || typeof toolsService.schemas !== "function") {
			appendNotice(COPY.mcpUnavailable);
			return;
		}
		const seeded = filter === "" ? {} : { filter };
		const mcpSchemas = (toolsService.schemas(agent) ?? []).filter((s) => s.name.startsWith("mcp__"));
		if (mcpSchemas.length === 0) {
			appendNotice(COPY.mcpUnavailable);
			return;
		}
		const items = mcpSchemas.map((schema) => {
			const serverName = schema.name.split("__")[1] ?? "mcp";
			const description = (schema.description || "").replace(/\s+/g, " ").trim();
			return {
				label: `/${schema.name}`,
				value: schema.name,
				description: `[${serverName}] ${description}`.trim()
			};
		});
		setChoicePicker({
			kind: "mcp",
			title: COPY.choiceTitleMcp,
			items,
			note: `${items.length} 个 MCP 工具可用`,
			...seeded
		});
	};
	const connect = new ConnectController(ctx, {
		fail: (message) => {
			setError(message);
		},
		notice: (text) => {
			appendNotice(text);
		},
		showChoice: (picker) => {
			setChoicePicker(picker);
		},
		closeChoice: () => {
			setChoicePicker(null);
		},
		changed: () => {
			notify();
		}
	});
	/** Hand one non-built-in slash line to the registry commands service. */
	const dispatchRegistryCommand = (name, line) => {
		const commandsService = ctx.get("commands");
		if (commandsService === void 0) {
			setError(`unknown command: ${name}; try /help`);
			return;
		}
		commandsService.execute(agent, line, [], new AbortController().signal).then((execution) => {
			if (execution === void 0) {
				setError(`unknown command: ${name}; try /help`);
				return;
			}
			if (execution.result.kind === "error") setError(execution.result.text);
			else if (execution.result.text !== void 0 && execution.result.text !== "") appendNotice(execution.result.text);
		}).catch((failure) => {
			setError(renderError(failure));
		});
	};
	/**
	* Route one slash line the built-ins did not claim. A registered registry
	* command wins the name (the same adjudication as the web client, where a
	* shared name resolves to the command); otherwise a user-invocable skill
	* makes the whole line a prompt — the host pre-step boundary
	* (`dsh-tool-skill`) loads the named skill while the typed words ride as
	* prompt text, queuing like prose while a turn runs. An unresolved name is
	* an unknown-command hint; nothing falls through to the model silently.
	* @param name - the first word, lower-cased, e.g. `/deploy-checks`.
	* @param line - the complete trimmed line, sent verbatim on the skill route.
	*/
	const routeSlashedLine = (name, line) => {
		const bare = name.slice(1);
		const commands = ctx.get("commands");
		if (commands !== void 0 && commands.find(agent, bare) !== void 0) {
			dispatchRegistryCommand(name, line);
			return;
		}
		if (bare.startsWith("mcp__")) {
			const toolsService = ctx.get("tools");
			if (toolsService !== void 0 && typeof toolsService.get === "function" && toolsService.get(bare, agent) !== void 0) {
				const args = line.slice(name.length).trim();
				submitOrQueue(args !== "" ? `请调用 MCP 工具 \`${bare}\`，参数如下：\n${args}` : `请调用 MCP 工具 \`${bare}\`。`, line);
				return;
			}
		}
		if (skillRegistry === void 0) {
			setError(`unknown command: ${name}; try /help`);
			return;
		}
		skillRegistry.get(bare, {
			cwd: session.header.cwd,
			scope: agent
		}).then((skill) => {
			if (skill === void 0 || !isUserInvocable(skill)) {
				setError(`unknown command: ${name}; try /help`);
				return;
			}
			submitOrQueue(line, line);
		}).catch((failure) => {
			setError(renderError(failure));
		});
	};
	/**
	* Route one slash command. The command name is the first word, lower-cased
	* (case- and whitespace-tolerant); the remaining text is its argument.
	* Built-ins act locally; anything else goes to the slash fallback — registry
	* commands first, then a user-invocable skill as a prompt — and an
	* unresolved name gets an unknown hint instead of reaching the model.
	* @param line - the trimmed slash line, e.g. `/model deepseek-official/x`.
	*/
	/**
	* Reset the on-screen transcript in place: clear the viewport and bump the
	* transcript epoch so the Ink static list rebuilds. Terminal scrollback is
	* deliberately preserved.
	*/
	const resetTranscriptView = () => {
		requestScreenClear?.();
		transcriptEpoch += 1;
		setMessages([]);
	};
	const dispatchCommand = (line) => {
		const name = line.split(/\s+/)[0]?.toLowerCase() ?? "";
		const rest = line.slice(name.length).trim();
		switch (name) {
			case "/quit":
			case "/exit":
				requestQuit();
				return;
			case "/new":
				if (hasConversation(session)) exitFn({ type: "new" });
				else resetTranscriptView();
				return;
			case "/fork":
				exitFn({ type: "fork" });
				return;
			case "/sessions":
			case "/resume":
				setPickerOpen(true);
				return;
			case "/model":
				if (rest !== "") submitModelSpec(rest);
				else openModelPicker();
				return;
			case "/perm":
				if (rest !== "") applyPolicy(rest);
				else openPolicyPicker();
				return;
			case "/skills":
				openSkillPicker(rest);
				return;
			case "/mcp":
				openMcpPicker(rest);
				return;
			case "/connect":
				if (rest !== "") connect.start(rest);
				else connect.openPicker();
				return;
			case "/help":
				appendNotice(HELP_TEXT);
				return;
			case "/clear":
				resetTranscriptView();
				return;
			case "/title": {
				if (rest === "") {
					titleEditor = durableTitle();
					notify();
					return;
				}
				const titleService = ctx.get("sessionTitle");
				if (titleService === void 0) {
					appendNotice(COPY.titleUnavailable);
					return;
				}
				try {
					applyTitle(titleService.rename(session, rest).title);
					titleEditor = null;
				} catch (failure) {
					appendNotice(`${COPY.titleFailedPrefix}${failure instanceof Error ? failure.message : String(failure)}`);
				}
				return;
			}
			case "/feedback":
				setError(`unknown command: ${name}; try /help`);
				return;
			default: routeSlashedLine(name, line);
		}
	};
	let streamingKey = null;
	const removeStreaming = () => {
		const key = streamingKey;
		if (key === null) return;
		streamingKey = null;
		setMessages(messages.filter((message) => message.key !== key));
	};
	const disposeStream = ctx.on("agent/assistant-stream", ({ agent: subject, frame }) => {
		if (subject !== agent) return;
		if (frame.type === "start") {
			removeStreaming();
			const key = `stream-${frame.attemptId}`;
			streamingKey = key;
			attemptAnchorMs = null;
			attemptChars = 0;
			setMessages([...messages, {
				key,
				role: "assistant",
				text: "",
				reasoning: "",
				status: "streaming"
			}]);
			return;
		}
		if (frame.type === "end") {
			const outcome = frame.outcome;
			if (outcome.kind === "abandoned" || outcome.eventType === "assistant/attempt") {
				removeStreaming();
				return;
			}
			const event = session.eventAt(SessionSeq(outcome.seq));
			if (event?.type === "assistant/message") {
				const { text, reasoning } = blocksToText(event.data.message.content);
				const key = streamingKey ?? `a:${outcome.seq}`;
				streamingKey = null;
				if (text === "" && reasoning === "") {
					setMessages(messages.filter((message) => message.key !== key));
					return;
				}
				setMessages(messages.map((message) => message.key === key ? {
					key: `a:${outcome.seq}`,
					role: "assistant",
					text,
					reasoning,
					status: "done",
					seq: outcome.seq
				} : message));
			}
			return;
		}
		const key = streamingKey;
		if (key === null) return;
		const chunk = frame.chunk;
		if (chunk.type === "text-delta") {
			if (chunk.text === "") return;
			attemptChars += chunk.text.length;
			sampleLiveRate(frame.time);
			setMessages(messages.map((message) => message.key === key ? {
				...message,
				text: message.text + chunk.text
			} : message), false);
			return;
		}
		if (chunk.type === "reasoning-delta") {
			if (chunk.text === "") return;
			attemptChars += chunk.text.length;
			sampleLiveRate(frame.time);
			setMessages(messages.map((message) => message.key === key ? {
				...message,
				reasoning: message.reasoning + chunk.text
			} : message), false);
			return;
		}
		if (chunk.type === "usage") {
			const sampled = attemptAnchorMs === null ? null : tokensPerSecond(chunk.usage.outputTokens, frame.time - attemptAnchorMs);
			if (sampled !== null) tokenRate = sampled;
			setTokens({
				input: chunk.usage.inputTokens,
				output: chunk.usage.outputTokens,
				...chunk.usage.reasoningTokens !== void 0 ? { reasoning: chunk.usage.reasoningTokens } : {}
			});
			return;
		}
		if (chunk.type === "tool-call-delta") {
			const delta = chunk.argumentsDelta.trim();
			if (delta === "") return;
			setMessages(messages.map((message) => message.key === key ? {
				...message,
				toolPreview: `${chunk.name} ${delta.slice(0, 120)}`
			} : message), false);
		}
	});
	const disposeSession = ctx.on("session/event", (subject, event) => {
		if (subject !== session) return;
		refreshOccupancy();
		if (event.type === "session/title") applyTitle(event.data.title);
		todos = projectTodos(todos, event);
		const nextEntries = reduceTurnEntries(turnTimeline, event);
		if (nextEntries !== turnTimeline) {
			turnTimeline = nextEntries;
			snapshot = null;
			notify();
		}
		if (event.type === "assistant/message") return;
		setMessages(projectEvent(messages, event));
	});
	const disposeApproval = approvalBus.onPrompt((prompt) => {
		if (pendingApproval === prompt) return;
		pendingApproval = prompt;
		notify();
	});
	const disposePolicy = ctx.on("session/event", (subject, event) => {
		if (subject !== session || event.type !== "approval/policy") return;
		permissionPolicy = event.data.policy;
		permissionPreset = permissionService?.current(session) ?? permissionPolicy;
		notify();
	});
	const disposeStatus = ctx.on("agent/status", ({ agent: subject, status }) => {
		if (subject !== agent) return;
		setRunning(status === "running");
		if (status === "idle" && !running && queued.length > 0) {
			const [next, ...rest] = queued;
			setQueued(rest);
			if (next !== void 0) submitPrompt(next);
		}
	});
	const disposeError = ctx.on("agent/error", ({ agent: subject, error: failure }) => {
		if (subject !== agent) return;
		setError(renderError(failure));
	});
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getState() {
			if (snapshot === null) snapshot = {
				messages,
				running,
				error,
				modelLabel: modelLabelOf(agent.options.model ?? "?"),
				permissionPreset,
				sessionId: agent.id,
				sessionLabel: labelValue,
				pickerOpen,
				pickerItems,
				pendingApproval,
				tokens: { ...tokens },
				tokenRate,
				contextOccupancy: context,
				todos,
				queued: [...queued],
				boardOpen,
				turnTimeline,
				choicePicker,
				connectWizard: connect.state,
				titleEditor,
				transcriptEpoch
			};
			return snapshot;
		},
		send(text) {
			const trimmed = text.trim();
			if (trimmed === "") return;
			history.reset();
			if (trimmed.startsWith("/")) {
				dispatchCommand(trimmed);
				return;
			}
			submitOrQueue(text, trimmed);
		},
		historyOlder(current) {
			return history.step(1, current);
		},
		historyNewer(current) {
			return history.step(-1, current);
		},
		openTitleEditor() {
			titleEditor = durableTitle();
			notify();
		},
		submitTitle(text) {
			titleEditor = null;
			const trimmed = text.trim();
			if (trimmed === "") {
				notify();
				return;
			}
			const titleService = ctx.get("sessionTitle");
			if (titleService === void 0) {
				appendNotice(COPY.titleUnavailable);
				notify();
				return;
			}
			try {
				applyTitle(titleService.rename(session, trimmed).title);
			} catch (failure) {
				appendNotice(`${COPY.titleFailedPrefix}${failure instanceof Error ? failure.message : String(failure)}`);
			}
			notify();
		},
		cancelTitleEditor() {
			if (titleEditor === null) return;
			titleEditor = null;
			notify();
		},
		stop() {
			setQueued([]);
			if (!running) return;
			agent.cancel({ kind: "user" });
		},
		toggleBoard() {
			boardOpen = !boardOpen;
			snapshot = null;
			notify();
		},
		quit() {
			requestQuit();
		},
		openPicker() {
			setPickerOpen(true);
		},
		closePicker() {
			setPickerOpen(false);
		},
		requestSwitch(sessionId) {
			setPickerOpen(false);
			exitFn({
				type: "switch",
				sessionId
			});
		},
		openModelPicker,
		pickModel(spec) {
			submitModelSpec(spec);
		},
		openPolicyPicker,
		pickPolicy(policy) {
			applyPolicy(policy);
		},
		openSkillPicker,
		pickSkill(name) {
			setChoicePicker(null);
		},
		openMcpPicker,
		pickMcp(name) {
			setChoicePicker(null);
		},
		openConnectPicker() {
			connect.openPicker();
		},
		pickConnectProvider(provider) {
			connect.start(provider);
		},
		submitConnectInput(value) {
			connect.submit(value);
		},
		pickConnectApi(api) {
			connect.pickApi(api);
		},
		cancelConnect() {
			connect.cancel();
		},
		closeChoicePicker() {
			setChoicePicker(null);
		},
		resolveApproval(outcome) {
			approvalBus.answer(outcome);
		},
		done,
		dispose() {
			if (streamNotifyTimer !== null) {
				clearTimeout(streamNotifyTimer);
				streamNotifyTimer = null;
			}
			disposeStream();
			disposeSession();
			disposeStatus();
			disposePolicy();
			disposeError();
			disposeApproval();
			connect.dispose();
			listeners.clear();
		}
	};
}
/**
* Command menu metadata, kept beside the dispatch switch so the menu and the
* router cannot drift. `arg` renders as a usage hint after the name.
*/
const COMMAND_HINTS = [
	{
		name: "/new",
		hint: "新建会话"
	},
	{
		name: "/fork",
		hint: "从当前会话创建分支"
	},
	{
		name: "/sessions",
		hint: "选择已保存的会话"
	},
	{
		name: "/model",
		hint: "切换模型",
		arg: "provider/model"
	},
	{
		name: "/perm",
		hint: "权限预设",
		arg: "workspace-write|danger-full-access"
	},
	{
		name: "/connect",
		hint: "连接模型提供方"
	},
	{
		name: "/title",
		hint: "重命名会话",
		arg: "text"
	},
	{
		name: "/skills",
		hint: "选择并调用技能",
		arg: "筛选词"
	},
	{
		name: "/mcp",
		hint: "查看与使用 MCP 工具",
		arg: "筛选词"
	},
	{
		name: "/quit",
		hint: "退出应用",
		arg: "或 /exit"
	}
];
//#endregion
//#region lib/types/ui/markdown.js
/**
* Terminal markdown projection: inline span parsing and block-aware line
* projection. Both are pure and unit-tested; {@link MarkdownText} in
* `markdown.tsx` maps the result onto Ink nodes.
* @module @dsh-external/dsh-cli-app/ui/markdown
*/
/**
* Parse one line into inline spans. Markers nest one level only.
* @param line - the raw line.
* @returns the spans in display order.
*/
function parseInline(line) {
	const spans = [];
	let buffer = "";
	const flush = () => {
		if (buffer !== "") {
			spans.push({
				kind: "text",
				text: buffer
			});
			buffer = "";
		}
	};
	let i = 0;
	while (i < line.length) {
		const rest = line.slice(i);
		if (rest.startsWith("`")) {
			const end = rest.indexOf("`", 1);
			if (end > 0) {
				flush();
				spans.push({
					kind: "code",
					text: rest.slice(1, end)
				});
				i += end + 1;
				continue;
			}
		}
		if (rest.startsWith("**")) {
			const end = rest.indexOf("**", 2);
			if (end > 1) {
				flush();
				spans.push({
					kind: "bold",
					text: rest.slice(2, end)
				});
				i += end + 2;
				continue;
			}
		}
		if (rest.startsWith("*") && !rest.startsWith("**")) {
			const end = rest.indexOf("*", 1);
			if (end > 0) {
				flush();
				spans.push({
					kind: "italic",
					text: rest.slice(1, end)
				});
				i += end + 1;
				continue;
			}
		}
		buffer += line[i] ?? "";
		i += 1;
	}
	flush();
	return spans;
}
/**
* Project raw markdown text into typed display lines.
* @param text - the raw markdown body.
* @returns one entry per rendered line.
*/
function projectMarkdown(text) {
	const lines = [];
	let inFence = null;
	const push = (line) => {
		if (inFence !== null) {
			if (line.trim().startsWith("```")) {
				inFence = null;
				return;
			}
			lines.push({
				kind: "code",
				text: line
			});
			return;
		}
		if (line.trimStart().startsWith("```")) {
			inFence = line.trim().slice(3).trim() || "code";
			lines.push({
				kind: "code",
				text: "",
				lang: inFence
			});
			return;
		}
		const trimmed = line.trim();
		if (trimmed.startsWith("### ")) lines.push({
			kind: "heading",
			text: trimmed.slice(4)
		});
		else if (trimmed.startsWith("## ")) lines.push({
			kind: "heading",
			text: trimmed.slice(3)
		});
		else if (trimmed.startsWith("# ")) lines.push({
			kind: "heading",
			text: trimmed.slice(2)
		});
		else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) lines.push({
			kind: "list",
			text: trimmed.slice(2)
		});
		else if (/^\d+[.)] /.test(trimmed)) lines.push({
			kind: "list",
			text: trimmed.replace(/^\d+[.)] /, "")
		});
		else if (trimmed.startsWith("> ")) lines.push({
			kind: "quote",
			text: trimmed.slice(2),
			quoteLevel: 1
		});
		else if (trimmed !== "") lines.push({
			kind: "plain",
			text: line
		});
		else lines.push({
			kind: "plain",
			text: ""
		});
	};
	for (const line of text.split("\n")) push(line);
	return lines;
}
//#endregion
//#region lib/types/ui/markdown-view.js
/**
* Render one line's spans as nested Ink Text nodes.
* @param spans - inline spans from `parseInline`.
* @param theme - active palette.
* @returns the styled line node.
*/
function renderSpans(spans, theme) {
	return jsx(Text, { children: spans.map((span, index) => {
		const key = `${span.kind}-${index}`;
		switch (span.kind) {
			case "code": return jsx(Text, {
				color: theme.codeText,
				children: span.text
			}, key);
			case "bold": return jsx(Text, {
				bold: true,
				children: span.text
			}, key);
			case "italic": return jsx(Text, {
				italic: true,
				children: span.text
			}, key);
			default: return jsx(Text, { children: span.text }, key);
		}
	}) });
}
/**
* Render a full markdown text as a column of styled lines.
* @param props - the markdown body and the active palette.
* @returns the rendered column.
*/
function MarkdownText(props) {
	const { text, theme } = props;
	return jsx(Box, {
		flexDirection: "column",
		children: projectMarkdown(text).map((line, index) => {
			const key = `${line.kind}-${index}`;
			switch (line.kind) {
				case "code":
					if (line.lang !== void 0) return jsx(Text, {
						color: theme.muted,
						dimColor: true,
						children: `┌─ ${line.lang} ─`.padEnd(16, "─")
					}, key);
					return jsx(Text, {
						color: theme.codeText,
						backgroundColor: theme.codeBg,
						children: line.text
					}, key);
				case "heading": return jsx(Text, {
					bold: true,
					color: theme.brand,
					children: line.text
				}, key);
				case "list": return jsxs(Text, { children: [jsx(Text, {
					color: theme.muted,
					children: "• "
				}), renderSpans(parseInline(line.text), theme)] }, key);
				case "quote": return jsx(Text, {
					color: theme.muted,
					italic: true,
					children: renderSpans(parseInline(line.text), theme)
				}, key);
				default: return jsx(Text, {
					wrap: "wrap",
					children: renderSpans(parseInline(line.text), theme)
				}, key);
			}
		})
	});
}
//#endregion
//#region lib/types/ui/messages.js
/** Longest tool result a card renders inline; the full result stays in the log. */
const TOOL_RESULT_PREVIEW_LIMIT = 1600;
/** Reasoner preview length while a reasoning fold is collapsed. */
const REASONING_PREVIEW_LIMIT = 70;
const TOOL_BADGES = {
	bash: "🐚 bash",
	pwsh: "🖥 pwsh",
	str_replace_editor: "📝 edit",
	web_search: "🌐 search",
	web_fetch: "🌐 fetch",
	"tool-fs": "📁 fs"
};
/**
* Icon + short name for a tool card.
* @param toolName - the tool's registered name.
* @returns the badge text.
*/
function toolBadge(toolName) {
	return TOOL_BADGES[toolName] ?? `${COPY.defaultToolGlyph} ${toolName}`;
}
/**
* Collapse a tool result to the card's readable budget.
* @param value - the full result text.
* @returns the text as rendered, with a truncation footer when clipped.
*/
function previewToolResult(value) {
	if (value.length <= TOOL_RESULT_PREVIEW_LIMIT) return value;
	return `${value.slice(0, TOOL_RESULT_PREVIEW_LIMIT)}\n… ${COPY.toolResultTruncated}`;
}
/** First non-empty reasoning line, trimmed to the collapsed preview budget. */
function reasoningPreview(reasoning) {
	return (reasoning.split("\n").find((candidate) => candidate.trim() !== "")?.trim() ?? "").slice(0, REASONING_PREVIEW_LIMIT);
}
/**
* Gutter glyph drawn in front of every user row so typed input stays visually
* distinct from assistant output at a glance (a vertical rule, Claude Code style).
*/
const USER_GUTTER = "▎";
/** One tool card: state badge, argument preview, and the settled result. */
function ToolRow(props) {
	const { message, theme } = props;
	const failed = message.toolStatus === "error";
	const settled = failed || message.toolStatus === "done";
	const stateColor = failed ? theme.error : settled ? theme.ok : theme.warn;
	const stateMark = failed ? "x" : settled ? "✓" : "…";
	const args = message.argsSummary !== void 0 && message.argsSummary !== "" ? `  ${message.argsSummary}` : "";
	return jsxs(Box, {
		flexDirection: "column",
		marginBottom: 1,
		children: [jsxs(Text, {
			color: stateColor,
			bold: true,
			children: [
				stateMark,
				" ",
				toolBadge(message.toolName ?? "tool"),
				args
			]
		}), settled && message.toolResult !== void 0 && message.toolResult !== "" && jsx(Text, {
			color: failed ? theme.error : theme.muted,
			dimColor: true,
			wrap: "wrap",
			children: previewToolResult(message.toolResult)
		})]
	});
}
/** One assistant row: optional reasoning fold, live tool preview, and text. */
function AssistantRow(props) {
	const { message, theme, reasoningExpanded, chrome } = props;
	const streaming = message.status === "streaming";
	return jsxs(Box, {
		flexDirection: "column",
		marginBottom: 1,
		children: [
			chrome === "classic" && jsx(Text, {
				color: theme.brand,
				bold: true,
				children: COPY.assistantLabel
			}),
			message.reasoning !== "" && !streaming && (reasoningExpanded ? jsx(Text, {
				color: theme.reasoning,
				dimColor: true,
				wrap: "wrap",
				children: message.reasoning
			}) : jsxs(Text, {
				color: theme.reasoning,
				dimColor: true,
				children: [
					"💭 ",
					reasoningPreview(message.reasoning),
					"…"
				]
			})),
			message.toolPreview !== void 0 && message.toolPreview !== "" && jsxs(Text, {
				color: theme.warn,
				dimColor: true,
				children: ["⚙ ", message.toolPreview.slice(0, 100)]
			}),
			message.text !== "" ? jsx(MarkdownText, {
				text: message.text,
				theme
			}) : streaming && jsx(Text, {
				color: theme.muted,
				children: "…"
			})
		]
	});
}
/** One transcript row: user, assistant, or tool card. */
function MessageRow(props) {
	const { message, theme, reasoningExpanded, chrome } = props;
	if (message.role === "tool") return jsx(ToolRow, {
		message,
		theme
	});
	if (message.role === "assistant") return jsx(AssistantRow, {
		message,
		theme,
		reasoningExpanded,
		chrome
	});
	return jsxs(Box, {
		flexDirection: "column",
		marginBottom: 1,
		children: [chrome === "classic" && jsx(Text, {
			color: theme.brand,
			bold: true,
			children: COPY.userLabel
		}), jsxs(Box, {
			flexDirection: "row",
			children: [jsxs(Text, {
				color: theme.brand,
				bold: true,
				children: [USER_GUTTER, " "]
			}), jsx(Box, {
				flexDirection: "column",
				flexGrow: 1,
				children: jsx(MarkdownText, {
					text: message.text,
					theme
				})
			})]
		})]
	});
}
//#endregion
//#region lib/types/ui/terminal.js
/**
* Terminal control sequences the app emits directly. Ink owns layout and cursor
* movement everywhere else; these live here so no call site can hand-write an
* escaped literal and print it as visible text.
* @module @dsh-external/dsh-cli-app/ui/terminal
*/
/** Erase everything in the visible viewport without moving the cursor. */
const ERASE_SCREEN = "\x1B[2J";
/** Clear the visible viewport and home the cursor, keeping terminal scrollback. */
const CLEAR_VIEWPORT = `${ERASE_SCREEN}\u001b[H`;
/** Clear the viewport AND the scrollback: the session-boundary wipe, so a retired conversation cannot be scrolled back into view. */
const CLEAR_SCREEN = `${ERASE_SCREEN}[3J\u001b[H`;
//#endregion
//#region lib/types/ui/resize.js
/**
* Reflow correction for Ink's frame diffing.
*
* Ink erases its previous frame with `eraseLines(previousLineCount)`, a count it
* computed at the width in effect when that frame was written. A terminal
* re-wraps the printed frame when its width shrinks, so the frame then occupies
* MORE physical rows than that count: the erase stops short and leaves the top
* of the live region stranded on screen, one more copy per shrink — the
* composer box, status line, and any overlay repeat down the screen.
*
* This module wraps the stream's `write`, remembers the last frame Ink sent, and
* on a shrink replaces the erase repeat count of the next erase with the
* reflowed height of that frame. Nothing else changes: no viewport clear, no
* scrollback loss, no extra repaint — only a repeat count Ink already emits.
* @module @dsh-external/dsh-cli-app/ui/resize
*/
/** Erase one line, the unit `ansi-escapes`' `eraseLines` repeats. */
const ERASE_LINE = "\x1B[2K";
/** Move up one row, the separator between erased rows. */
const CURSOR_UP_ONE = "\x1B[1A";
/** Move to the start of the row, the tail of every `eraseLines` sequence. */
const CURSOR_LEFT = "\x1B[G";
/** Ink's erase prefix as `log-update` writes it: `(erase+up)* erase+left`. */
const ERASE_PREFIX = new RegExp(`^(?:${escapeForRegExp("\x1B[2K\x1B[1A")})*${escapeForRegExp("\x1B[2K\x1B[G")}`);
/** Grapheme segmentation: one display cell block per terminal character. */
const GRAPHEMES = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/**
* Escape one literal for the erase-prefix pattern.
* @param value - the literal escape sequence.
* @returns the pattern-safe form.
*/
function escapeForRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* The erase sequence for a row count, byte-identical to the one Ink emits.
* @param count - rows to erase, including the cursor row below the frame.
* @returns the erase sequence.
*/
function eraseLines(count) {
	let clear = "";
	for (let index = 0; index < count; index += 1) clear += ERASE_LINE + (index < count - 1 ? CURSOR_UP_ONE : "");
	return count === 0 ? clear : clear + CURSOR_LEFT;
}
/**
* Rows the terminal shows for one rendered line once it re-wraps at `columns`.
* @param line - one rendered line, ANSI styling included.
* @param columns - terminal width in display cells.
* @returns the physical row count.
*/
function wrappedRows(line, columns) {
	if (stringWidth(line) <= columns) return 1;
	let rows = 1;
	let used = 0;
	for (const { segment } of GRAPHEMES.segment(line)) {
		const width = stringWidth(segment);
		if (width <= 0) continue;
		if (used > 0 && used + width > columns) {
			rows += 1;
			used = 0;
		}
		used += width;
	}
	return rows;
}
/**
* Physical rows of an Ink frame once the terminal re-wraps it at `columns`.
* @param frame - the frame exactly as Ink wrote it, trailing newline included.
* @param columns - new terminal width in display cells.
* @returns the row count Ink's erase must cover, cursor row included.
*/
function reflowedRows(frame, columns) {
	const lines = frame.split("\n");
	const cursorRow = lines.at(-1) === "" ? 1 : 0;
	if (cursorRow === 1) lines.pop();
	let rows = cursorRow;
	for (const line of lines) rows += wrappedRows(line, columns);
	return rows;
}
/**
* Count the rows one erase prefix covers.
* @param prefix - the erase sequence Ink wrote.
* @returns the erased row count.
*/
function erasedRows(prefix) {
	return prefix.split(ERASE_LINE).length - 1;
}
/**
* Terminal width the stream reports.
* @param stream - the output stream.
* @returns the width in display cells, 0 when the stream reports none.
*/
function columnsOf(stream) {
	return stream.columns ?? 0;
}
/**
* Install the reflow correction on one output stream.
*
* The returned handle must be released with the Ink instance that owns the
* stream; it is the only installed listener.
* @param stdout - the stream Ink renders to and whose `resize` events report width changes.
* @returns the handle that unwraps the stream.
*/
function installResizeReflow(stdout) {
	let lastColumns = columnsOf(stdout);
	/** Last frame Ink sent, or null while the screen holds no model of it. */
	let frame = null;
	/** Erase rows the next erase-prefixed write must cover, 0 when none is pending. */
	let pending = 0;
	/**
	* Whether the write being processed belongs to a render burst that followed
	* an erase-only clear. Ink renders a burst synchronously, so the flag is
	* disarmed on a microtask, which is the burst's exact end.
	*/
	let inBurst = false;
	let burstToken = 0;
	const onResize = () => {
		const columns = columnsOf(stdout);
		if (columns > 0 && columns < lastColumns && frame !== null) pending = reflowedRows(frame, columns);
		else if (columns > lastColumns) pending = 0;
		lastColumns = columns;
	};
	stdout.on("resize", onResize);
	/**
	* Record that a render burst is open and close it at the end of the current
	* task, when every write of that burst has been seen.
	*/
	const armBurst = () => {
		burstToken += 1;
		const token = burstToken;
		inBurst = true;
		queueMicrotask(() => {
			if (token === burstToken) inBurst = false;
		});
	};
	/** Track one outgoing write and return the bytes to send in its place. */
	const rewrite = (chunk) => {
		if (chunk.startsWith("\x1B[2J")) {
			frame = null;
			pending = 0;
			return chunk;
		}
		const match = ERASE_PREFIX.exec(chunk);
		if (match === null) {
			if (chunk !== "" && (inBurst || frame === null)) frame = chunk;
			return chunk;
		}
		const content = chunk.slice(match[0].length);
		if (content === "") armBurst();
		else {
			frame = content;
			inBurst = false;
		}
		if (pending === 0) return chunk;
		const target = pending;
		pending = 0;
		return erasedRows(match[0]) < target ? eraseLines(target) + content : chunk;
	};
	const originalWrite = stdout.write;
	const reflowWrite = (chunk, ...rest) => {
		const next = typeof chunk === "string" ? rewrite(chunk) : chunk;
		return originalWrite.call(stdout, next, ...rest);
	};
	const installed = reflowWrite;
	stdout.write = installed;
	return { restore: () => {
		if (stdout.write === installed) stdout.write = originalWrite;
		stdout.off("resize", onResize);
	} };
}
//#endregion
//#region lib/types/ui/live-budget.js
/**
* Live-region row budget: the ceiling that keeps a streaming answer out of Ink's
* whole-screen reset.
*
* Before painting, Ink compares the frame's height with the viewport
* (`ink/build/ink.js`: `if (outputHeight >= stdout.rows)`), and a frame that
* reaches the viewport is not erased and repainted row for row: the screen is
* cleared, the terminal's scrollback is erased, and every committed row
* replays. While an answer streams, the live region crosses that line on one
* chunk and falls back under it on the next, which is the flash a fast output
* produces.
*
* The correction stays on this side of Ink: the live region is measured here
* and clipped to the rows the mounted chrome leaves it, so the threshold is
* never reached and every repaint stays a frame diff. Clipping is paint-time
* only — the row's full text prints once when it settles into `<Static>`, and
* the durable log never sees the shortened copy.
* @module @dsh-external/dsh-cli-app/ui/live-budget
*/
/** Viewport rows below which clipping cannot help: the chrome fills the screen by itself. */
const MIN_VIEWPORT_ROWS = 12;
/** Rows the live region keeps even when the chrome claims more than the viewport holds. */
const LIVE_MIN_ROWS = 3;
/** Ink resets at `outputHeight >= rows`, so a safe frame stops one row short of the viewport. */
const SPARE_ROWS = 1;
/**
* Rows a transcript row adds around its text: its blank row below, and one row
* of slack for a fenced block's language header and the indent the text wraps
* inside.
*/
const ROW_OVERHEAD = 2;
/** Row the classic chrome prints above a user or assistant row. */
const ROLE_LABEL_ROWS = 1;
/** Row the clip notice adds. */
const NOTICE_ROWS = 1;
/** Rows of the newest answer the clip never takes away, so the frame always shows a line of it. */
const MIN_TEXT_ROWS = 1;
/**
* Rows the pieces mounted outside the live region occupy, counted from each
* component's own markup. A bounded list counts its maximum, because that is
* the height the frame can reach. An under-estimate lets one frame trip Ink's
* reset; an over-estimate clips a row of answer early.
*/
const LIVE_CHROME = {
	/** The classic input line and the margin above it. */
	classicInput: 2,
	/** The classic bottom status line. */
	statusLine: 1,
	/** The framed opencode composer with its status row and margins, plus the token line. */
	opencodeComposer: 8,
	/** An error row and its margin. */
	error: 2,
	/**
	* The tool-approval modal: two frame rows, three truncated content rows, and
	* the margin below it. `ApprovalModal` is built to paint exactly this — an
	* under-count here is what let an approval frame reach the viewport height
	* and make Ink clear the screen and replay the whole committed transcript,
	* so the tool call appeared to render again every time permission was asked.
	*/
	approval: 6,
	/** `SessionPicker`: heading, search field, five rows, and a footer. */
	sessionPicker: 10,
	/** `ChoiceList`: heading, eight rows, and a footer. */
	choicePicker: 11,
	/** `CommandMenu`: hint line and up to eight matches. */
	commandMenu: 9,
	/** The `/connect` and `/title` frames. */
	prompt: 4,
	/** The task panel frame, title, and hint; each todo adds one row. */
	todoPanel: 4,
	/** The queued-prompts note and its margin. */
	queued: 2
};
/**
* Rows the live region may occupy.
* @param rows - viewport height in rows; non-finite when the stream reports none.
* @param chromeRows - rows the pieces mounted outside the live region take.
* @returns the row budget, or 0 when the live region must paint everything.
*/
function liveRowBudget(rows, chromeRows) {
	if (!Number.isFinite(rows) || rows < MIN_VIEWPORT_ROWS) return 0;
	return Math.max(LIVE_MIN_ROWS, rows - chromeRows - SPARE_ROWS);
}
/** Physical rows a text block occupies once the terminal wraps it. */
function textRows(text, shape) {
	if (text === "") return 0;
	if (!Number.isFinite(shape.columns) || shape.columns <= 0) return text.split("\n").length;
	let rows = 0;
	for (const line of text.split("\n")) rows += wrappedRows(line, shape.columns);
	return rows;
}
/**
* Physical rows one live transcript row paints.
* @param message - the row, settled or unsettled.
* @param shape - width, label, and reasoning-fold inputs.
* @returns the row's height in viewport rows.
*/
function liveRowHeight(message, shape) {
	let rows = ROW_OVERHEAD + textRows(message.text, shape);
	if (shape.labeled && message.role !== "tool") rows += ROLE_LABEL_ROWS;
	if (message.status !== "streaming" && message.reasoning !== "") rows += shape.expandedKey === message.key ? textRows(message.reasoning, shape) : 1;
	if (message.toolPreview !== void 0 && message.toolPreview !== "") rows += 1;
	if (message.toolStatus === "done" || message.toolStatus === "error") rows += textRows(message.toolResult === void 0 ? "" : previewToolResult(message.toolResult), shape);
	return rows;
}
/**
* The tail of `text` that fits `rows` physical rows.
* @param text - the row's answer text.
* @param rows - rows the clip left for it, at least one.
* @param shape - width the terminal wraps at.
* @returns the kept lines joined; the newest line survives even when it alone is taller.
*/
function tailToFit(text, rows, shape) {
	const lines = text.split("\n");
	const wraps = Number.isFinite(shape.columns) && shape.columns > 0;
	const heightOf = (line) => wraps ? wrappedRows(line, shape.columns) : 1;
	let start = lines.length - 1;
	let used = heightOf(lines[start] ?? "");
	while (start > 0) {
		const above = heightOf(lines[start - 1] ?? "");
		if (used + above > rows) break;
		start -= 1;
		used += above;
	}
	return lines.slice(start).join("\n");
}
/**
* Clip the live region to `budget` rows, keeping the newest tail. The newest
* row's text gives up its leading lines first, because dropping a whole row is
* the more visible loss; head rows go only when one answer line no longer fits
* beside them.
* @param messages - the live rows, transcript order.
* @param budget - rows the live region may occupy, 0 to paint everything.
* @param shape - width, label, and reasoning-fold inputs.
* @returns the rows to paint, the rows left out, and whether the notice fits.
*/
function fitLiveMessages(messages, budget, shape) {
	const rows = messages.map((message) => {
		return {
			message,
			text: textRows(message.text, shape),
			height: liveRowHeight(message, shape)
		};
	});
	const total = rows.reduce((sum, row) => sum + row.height, 0);
	const newest = rows.at(-1);
	if (newest === void 0 || budget <= 0 || total <= budget) return {
		messages,
		hiddenRows: 0,
		notice: false
	};
	const usable = Math.max(1, budget - NOTICE_ROWS);
	const overhead = newest.height - newest.text;
	const head = rows.slice(0, -1);
	let kept = head;
	let headRows = total - newest.height;
	if (newest.text - (total - usable) < MIN_TEXT_ROWS) {
		const limit = usable - overhead - MIN_TEXT_ROWS;
		headRows = 0;
		kept = [];
		for (const row of [...head].reverse()) {
			if (headRows + row.height > limit) break;
			headRows += row.height;
			kept.push(row);
		}
		kept.reverse();
	}
	const keep = Math.max(MIN_TEXT_ROWS, usable - headRows - overhead);
	const tail = keep >= newest.text ? newest.message.text : tailToFit(newest.message.text, keep, shape);
	const clipped = tail === newest.message.text ? void 0 : {
		...newest.message,
		text: tail
	};
	const painted = headRows + overhead + textRows(clipped === void 0 ? newest.message.text : clipped.text, shape);
	return {
		messages: clipped === void 0 && kept === head ? messages : [...kept.map((row) => row.message), clipped ?? newest.message],
		hiddenRows: total - painted,
		notice: painted + NOTICE_ROWS <= budget
	};
}
//#endregion
//#region lib/types/ui/overlays.js
/** Marker preceding the highlighted row of a list. */
const SELECT_MARKER = "›";
/** Cap the picker's label column so a long name cannot starve its description. */
const MAX_CHOICE_LABEL_COLUMN = 24;
/** Rows a picker shows before it scrolls its viewport. */
const SESSION_PICKER_ROWS = 5;
/** Rows a choice list shows before it scrolls its viewport. */
const CHOICE_PICKER_ROWS = 8;
/** Scroll window for a bounded list, centered on the selection. */
function windowStart(length, selected, visible) {
	if (length <= visible) return 0;
	return Math.max(0, Math.min(selected - Math.floor(visible / 2), length - visible));
}
/** One row of the resume picker. */
function SessionRow(props) {
	const { item, selected, theme } = props;
	const stem = item.title ?? item.sessionId;
	const where = shortCwd(item.cwd);
	const time = formatWhen(item.updatedAt);
	return jsxs(Text, {
		color: selected ? theme.brand : theme.muted,
		bold: selected,
		children: [
			selected ? `${SELECT_MARKER} ` : "  ",
			stem,
			where !== "" ? `  ·  ${where}` : "",
			jsxs(Text, {
				dimColor: true,
				children: [
					"  ·  ",
					time,
					item.parentSession !== null ? "  ·  fork" : ""
				]
			})
		]
	});
}
/** Compact modal session picker with an inline search field. */
function SessionPicker(props) {
	const { items, selected, search, theme } = props;
	const start = windowStart(items.length, selected, SESSION_PICKER_ROWS);
	const visible = items.slice(start, start + SESSION_PICKER_ROWS);
	return jsxs(Box, {
		flexDirection: "column",
		width: "100%",
		borderStyle: "round",
		borderColor: theme.brand,
		paddingX: 1,
		children: [
			jsxs(Box, { children: [jsx(Text, {
				color: theme.brand,
				bold: true,
				children: COPY.sessionsTitle
			}), jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: ["  ", COPY.sessionsHint]
			})] }),
			jsxs(Box, {
				marginTop: 1,
				children: [
					jsx(Text, {
						color: theme.brand,
						children: "/ "
					}),
					jsx(Text, {
						color: search === "" ? theme.muted : theme.text,
						dimColor: search === "",
						children: search === "" ? COPY.sessionsSearchPlaceholder : search
					}),
					jsx(Text, {
						color: theme.brand,
						children: "▌"
					})
				]
			}),
			jsxs(Box, {
				flexDirection: "column",
				marginTop: 1,
				children: [visible.length === 0 && jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.sessionsEmpty
				}), visible.map((item, index) => jsx(SessionRow, {
					item,
					selected: start + index === selected,
					theme
				}, item.sessionId))]
			}),
			items.length > SESSION_PICKER_ROWS && jsxs(Box, {
				marginTop: 1,
				justifyContent: "space-between",
				children: [jsxs(Text, {
					color: theme.muted,
					dimColor: true,
					children: [
						start + 1,
						"-",
						Math.min(start + SESSION_PICKER_ROWS, items.length),
						" / ",
						items.length
					]
				}), jsx(Text, {
					color: theme.muted,
					dimColor: true,
					children: COPY.sessionsSearchNote
				})]
			})
		]
	});
}
/** Generic bounded choice list used by `/model`, `/perm`, `/connect`, and `/skills`. */
function ChoiceList(props) {
	const { title, items, selected, theme, note, search } = props;
	const start = windowStart(items.length, selected, CHOICE_PICKER_ROWS);
	const visible = items.slice(start, start + CHOICE_PICKER_ROWS);
	const described = visible.filter((item) => item.description !== void 0);
	const labelWidth = described.length === 0 ? 0 : Math.min(MAX_CHOICE_LABEL_COLUMN, Math.max(...described.map((item) => item.label.length)));
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "round",
		borderColor: theme.brand,
		marginBottom: 1,
		children: [
			jsxs(Box, {
				marginLeft: 1,
				marginTop: 1,
				children: [jsx(Text, {
					color: theme.brand,
					bold: true,
					children: title
				}), jsxs(Text, {
					color: theme.muted,
					children: ["  ·  ", COPY.choiceHint]
				})]
			}),
			items.length === 0 && jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: ["  ", note ?? (search === "" ? COPY.choiceEmpty : COPY.choiceSearchEmpty)]
			}),
			visible.map((item, index) => {
				const actual = start + index;
				return jsxs(Text, {
					wrap: "truncate-end",
					color: selected === actual ? theme.brand : theme.muted,
					bold: selected === actual,
					children: [
						selected === actual ? `${SELECT_MARKER} ` : "  ",
						item.description === void 0 ? item.label : item.label.padEnd(labelWidth),
						item.description !== void 0 && jsxs(Text, {
							dimColor: true,
							children: ["  ", item.description]
						})
					]
				}, item.value);
			}),
			(items.length > CHOICE_PICKER_ROWS || search !== "") && jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: [
					"  ",
					items.length === 0 ? 0 : start + 1,
					"-",
					Math.min(start + CHOICE_PICKER_ROWS, items.length),
					" / ",
					items.length,
					"  ·  ",
					search === "" ? COPY.choiceSearchNote : `${COPY.choiceFilterPrefix}${search}`
				]
			})
		]
	});
}
/** Tool-approval question: the pending tool and its key choices. */
function ApprovalModal(props) {
	const { prompt, theme } = props;
	if (prompt === null) return jsx(Box, {});
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "double",
		borderColor: theme.warn,
		marginBottom: 1,
		paddingX: 1,
		children: [
			jsxs(Text, {
				wrap: "truncate-end",
				color: theme.warn,
				bold: true,
				children: [COPY.approvalTitle, prompt.reason !== void 0 && jsxs(Text, {
					color: theme.muted,
					children: ["  ·  ", prompt.reason]
				})]
			}),
			jsx(Text, {
				wrap: "truncate-end",
				color: theme.text,
				children: prompt.toolName
			}),
			jsx(Text, {
				wrap: "truncate-end",
				color: theme.muted,
				dimColor: true,
				children: COPY.approvalHint
			})
		]
	});
}
/** Slash-command palette shown while the input starts with `/`. */
function CommandMenu(props) {
	const { matches, selected, theme } = props;
	const maxVisible = 8;
	let start = 0;
	if (matches.length > maxVisible) start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), matches.length - maxVisible));
	const visibleMatches = matches.slice(start, start + maxVisible);
	return jsxs(Box, {
		flexDirection: "column",
		marginTop: 1,
		children: [jsx(Text, {
			color: theme.muted,
			dimColor: true,
			children: COPY.commandsHint
		}), visibleMatches.map((candidate, i) => {
			const isSelected = start + i === selected;
			return jsxs(Text, {
				color: isSelected ? theme.brand : theme.muted,
				bold: isSelected,
				children: [
					isSelected ? `${SELECT_MARKER} ` : "  ",
					candidate.name,
					jsxs(Text, {
						dimColor: true,
						children: [
							"  ",
							candidate.hint,
							candidate.arg !== void 0 ? `  ·  ${candidate.arg}` : ""
						]
					})
				]
			}, candidate.name);
		})]
	});
}
/** Prompt panel for the `/connect` wizard. */
function ConnectPrompt(props) {
	const { wizard, theme } = props;
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "round",
		borderColor: theme.brand,
		marginBottom: 1,
		paddingX: 1,
		children: [
			jsx(Text, {
				color: theme.brand,
				bold: true,
				children: "/connect"
			}),
			jsx(Text, {
				color: theme.text,
				children: connectPrompt(wizard.step, wizard.provider)
			}),
			jsx(Text, {
				color: theme.muted,
				dimColor: true,
				children: "Enter 确认 · Esc 取消"
			})
		]
	});
}
/** The /title editor: one text field over the shared composer buffer. */
function TitlePrompt(props) {
	const { current, theme } = props;
	return jsxs(Box, {
		flexDirection: "column",
		borderStyle: "round",
		borderColor: theme.brand,
		marginBottom: 1,
		paddingX: 1,
		children: [
			jsx(Text, {
				color: theme.brand,
				bold: true,
				children: "/title"
			}),
			jsxs(Text, {
				color: theme.text,
				children: [
					COPY.titleCurrent,
					"：",
					current ?? "（未命名）"
				]
			}),
			jsx(Text, {
				color: theme.muted,
				dimColor: true,
				children: COPY.titleEditorHint
			})
		]
	});
}
/**
* Whether one input chunk is a paste (a burst no keyboard produces).
* @param chunk - the raw chunk Ink delivered.
* @returns true when the chunk should fold.
*/
function isPasteChunk(chunk) {
	return chunk.length >= 80 || /\r|\n/.test(chunk);
}
/**
* The placeholder shown in place of one pasted region.
* @param text - the pasted text, verbatim.
* @returns `【head...tail，N字符】`, or the whole flattened text when it is
* already shorter than the head+tail budget.
*/
function summarizePaste(text) {
	const flat = Array.from(text.replace(/\s+/gu, " ").trim());
	const count = Array.from(text).length;
	const body = flat.length <= 30 ? flat.join("") : `${flat.slice(0, 20).join("")}${COPY.pasteEllipsis}${flat.slice(-10).join("")}`;
	return `${COPY.pasteOpen}${body}${COPY.pasteCountSeparator}${count}${COPY.pasteCountSuffix}${COPY.pasteClose}`;
}
/**
* Re-base every span after an insertion, optionally recording the insertion
* itself as a new folded region. An insertion landing strictly inside a span
* breaks that fold: the region is no longer the verbatim paste it summarized.
* @param spans - current spans (ordered, non-overlapping).
* @param at - insertion offset.
* @param length - inserted length.
* @param folded - whether the inserted chunk is itself a paste.
* @returns the next span list.
*/
function spansAfterInsert(spans, at, length, folded) {
	const next = [];
	for (const span of spans) {
		const end = span.start + span.length;
		if (at <= span.start) {
			next.push({
				start: span.start + length,
				length: span.length
			});
			continue;
		}
		if (at >= end) {
			next.push(span);
			continue;
		}
	}
	if (folded && length > 0) next.push({
		start: at,
		length
	});
	return next.sort((a, b) => a.start - b.start);
}
/**
* Re-base every span after a deletion. A deletion overlapping a span unfolds
* it (the remaining text is shown verbatim), which keeps the placeholder
* honest: it always stands for exactly the bytes that were pasted.
* @param spans - current spans.
* @param at - first deleted offset.
* @param length - deleted length.
* @returns the next span list.
*/
function spansAfterDelete(spans, at, length) {
	const removeEnd = at + length;
	const next = [];
	for (const span of spans) {
		const end = span.start + span.length;
		if (removeEnd <= span.start) {
			next.push({
				start: span.start - length,
				length: span.length
			});
			continue;
		}
		if (at >= end) {
			next.push(span);
			continue;
		}
	}
	return next;
}
/**
* The folded region covering one buffer offset.
* @param spans - current spans.
* @param offset - buffer offset of a character (not a caret gap).
* @returns the covering span, or undefined outside every fold.
*/
function spanCovering(spans, offset) {
	return spans.find((span) => offset >= span.start && offset < span.start + span.length);
}
/**
* The range one deletion keystroke removes. A placeholder is ONE thing on the
* prompt, so it deletes as one thing: Backspace at its trailing edge (or
* Delete at its leading edge) removes the whole pasted region rather than
* peeling a character the user cannot see off its end.
* @param spans - current spans.
* @param cursor - caret offset in the buffer.
* @param direction - 'backward' for Backspace, 'forward' for Delete.
* @param length - buffer length (bounds the forward case).
* @returns the range to remove, or null when the keystroke is a no-op.
*/
function deletionRange(spans, cursor, direction, length) {
	if (direction === "backward") {
		if (cursor <= 0) return null;
		const span = spanCovering(spans, cursor - 1);
		if (span !== void 0) return {
			start: span.start,
			length: span.length
		};
		return {
			start: cursor - 1,
			length: 1
		};
	}
	if (cursor >= length) return null;
	const span = spanCovering(spans, cursor);
	if (span !== void 0) return {
		start: span.start,
		length: span.length
	};
	return {
		start: cursor,
		length: 1
	};
}
/**
* Step the caret one position, treating a folded region as a single stop: the
* caret never lands inside a placeholder, where it would be invisible.
* @param spans - current spans.
* @param cursor - caret offset in the buffer.
* @param delta - -1 for Left, +1 for Right.
* @param length - buffer length.
* @returns the next caret offset.
*/
function stepCursor(spans, cursor, delta, length) {
	const target = Math.min(Math.max(0, cursor + delta), length);
	if (delta === -1) {
		const span = spanCovering(spans, target);
		return span === void 0 ? target : span.start;
	}
	const span = spanCovering(spans, target - 1);
	return span === void 0 ? target : span.start + span.length;
}
/**
* Fold every pasted region of the buffer into its placeholder.
* @param text - the full buffer.
* @param spans - folded regions (ordered, non-overlapping, in range).
* @returns the display text and the caret mapping.
*/
function foldInput(text, spans) {
	const usable = [...spans].filter((span) => span.length > 0 && span.start >= 0 && span.start + span.length <= text.length).sort((a, b) => a.start - b.start);
	if (usable.length === 0) return {
		display: text,
		mapCursor: (cursor) => cursor
	};
	let display = "";
	let cut = 0;
	const pieces = [];
	for (const span of usable) {
		if (span.start < cut) continue;
		if (span.start > cut) {
			const plain = text.slice(cut, span.start);
			pieces.push({
				bufferStart: cut,
				bufferEnd: span.start,
				displayStart: display.length,
				displayEnd: display.length + plain.length,
				fold: false
			});
			display += plain;
		}
		const summary = summarizePaste(text.slice(span.start, span.start + span.length));
		pieces.push({
			bufferStart: span.start,
			bufferEnd: span.start + span.length,
			displayStart: display.length,
			displayEnd: display.length + summary.length,
			fold: true
		});
		display += summary;
		cut = span.start + span.length;
	}
	if (cut < text.length) {
		const plain = text.slice(cut);
		pieces.push({
			bufferStart: cut,
			bufferEnd: text.length,
			displayStart: display.length,
			displayEnd: display.length + plain.length,
			fold: false
		});
		display += plain;
	}
	const mapCursor = (cursor) => {
		const clamped = Math.min(Math.max(0, cursor), text.length);
		for (const piece of pieces) {
			if (clamped >= piece.bufferEnd) continue;
			if (piece.fold) return clamped <= piece.bufferStart ? piece.displayStart : piece.displayEnd;
			return piece.displayStart + (clamped - piece.bufferStart);
		}
		return display.length;
	};
	return {
		display,
		mapCursor
	};
}
//#endregion
//#region lib/types/ui/App.js
/**
* Ink application root for the dsh terminal session.
*
* Two layout chromes share one view model and one keyboard contract:
*   - `classic`   the original single-column terminal look.
*   - `opencode`  an opencode-style frame: a centered welcome page for an empty
*     session, then a left-aligned transcript once a conversation begins.
*
* The transcript is split between Ink's `<Static>` output and the live region.
* Committed rows are written once and stay in the terminal's own scrollback, so
* resizing or scrolling never repaints them; only the streaming row, the modal
* overlays, and the input line are redrawn. That split is what keeps the app
* correct on resize and gives the terminal native mouse-wheel scrolling.
* @module @dsh-external/dsh-cli-app/ui/App
*/
/** Widest the opencode welcome column grows before the terminal keeps the rest as side air. */
const OPENCODE_COLUMN = 104;
/** Keep a large paste from turning the prompt into a multi-screen repaint; the full buffer is preserved. */
const INPUT_PREVIEW_LIMIT = 240;
/** Colours of the inline welcome wordmark, one per glyph. */
const WORDMARK_COLORS = [
	"#9BE800",
	"#A9EA1A",
	"#B9EC43",
	"#C9E98A"
];
/** Gradient down the welcome banner and along its rule, one colour per row / segment. */
const BANNER_COLORS = [
	"#9BE800",
	"#A6E813",
	"#B2E92E",
	"#BEEA4B",
	"#C9E96B",
	"#D4E98F"
];
/** Rows the welcome page paints besides its banner: tagline, rule, closing line, and their margins. */
const WELCOME_TRIM_ROWS = 6;
/** Viewport height below which the welcome page drops the banner for the inline wordmark. */
const WELCOME_BANNER_MIN_ROWS = 24;
/**
* Gradient rule under the welcome banner, one coloured segment per band.
*
* The Box claims the full column (`width="100%"`): a row container sized to its
* own content has nothing to centre inside, which left the rule hugging the
* left edge while the banner above it sat centred.
*/
function WelcomeRule(props) {
	const span = Math.max(1, Math.floor(Math.min(props.width, 48) / BANNER_COLORS.length));
	return jsx(Box, {
		width: "100%",
		justifyContent: "center",
		marginTop: 1,
		children: BANNER_COLORS.map((color, index) => jsx(Text, {
			color,
			dimColor: index >= BANNER_COLORS.length - 2,
			children: "─".repeat(span)
		}, color))
	});
}
/**
* Splash of an empty session — what `/new` lands on. The banner, the session's
* own model and permission line, a gradient rule, and one line of invitation —
* nothing else. The command surface is one `/` away and names itself there, so
* the page stays quiet instead of reprinting a cheat sheet. Every piece is
* sized from the column it is handed, so the page keeps the height the caller
* reserved for it (see `WELCOME_TRIM_ROWS`) at any terminal size.
*/
function WelcomeArt(props) {
	const { width, theme, modelLabel, permissionPreset, banner } = props;
	return jsxs(Fragment, { children: [
		banner ? jsx(Box, {
			width: "100%",
			flexDirection: "column",
			alignItems: "center",
			children: WELCOME_BANNER.map((row, index) => jsx(Text, {
				wrap: "truncate-end",
				color: BANNER_COLORS[index] ?? theme.brand,
				bold: true,
				children: row
			}, row))
		}) : jsx(Box, {
			width: "100%",
			justifyContent: "center",
			children: WORDMARK.map((glyph, index) => jsx(Text, {
				color: WORDMARK_COLORS[index] ?? theme.brand,
				bold: true,
				children: glyph
			}, glyph))
		}),
		jsx(Box, {
			width: "100%",
			justifyContent: "center",
			marginTop: 1,
			children: jsxs(Text, {
				wrap: "truncate-end",
				children: [
					jsx(Text, {
						color: theme.text,
						children: "DeepSeek "
					}),
					jsx(Text, {
						color: theme.brand,
						bold: true,
						children: COPY.welcomeTagline
					}),
					jsxs(Text, {
						color: theme.muted,
						dimColor: true,
						children: [
							"  ·  ",
							modelLabel,
							"  ·  ",
							COPY.permissionLabel,
							" ",
							permissionPreset
						]
					})
				]
			})
		}),
		jsx(WelcomeRule, { width }),
		jsx(Box, {
			width: "100%",
			justifyContent: "center",
			marginTop: 1,
			children: jsx(Text, {
				wrap: "truncate-end",
				color: theme.muted,
				dimColor: true,
				children: COPY.welcomeReady
			})
		})
	] });
}
/** Collapse a multi-line buffer into the single prompt line. */
function previewInput(value) {
	const compact = value.replace(/\r?\n/g, COPY.inputNewlineMark);
	if (compact.length <= INPUT_PREVIEW_LIMIT) return compact;
	return `${compact.slice(0, INPUT_PREVIEW_LIMIT)}…`;
}
/** Detect whether a keypress is Backspace across platforms (macOS delete, xterm DEL, etc.). */
function isBackspaceKey(chunk, key) {
	return key.backspace || chunk === "\b" || chunk === "" || key.delete && chunk !== "\x1B[3~";
}
/** Detect whether a keypress is forward Delete (PC Del key, etc.). */
function isForwardDeleteKey(chunk, key) {
	return key.delete && chunk === "\x1B[3~";
}
/** Render prompt input with an interactive cursor pointer. */
function renderInputWithCursor(text, cursor, theme, running, placeholder, pasteSpans = []) {
	if (text === "") return jsxs(Fragment, { children: [placeholder !== void 0 ? jsx(Text, {
		color: theme.muted,
		dimColor: true,
		children: placeholder
	}) : null, !running && jsx(Text, {
		color: theme.brand,
		children: "▌"
	})] });
	const folded = foldInput(text, pasteSpans);
	const shown = folded.display;
	const clamped = folded.mapCursor(Math.min(Math.max(0, cursor), text.length));
	if (clamped >= shown.length) return jsxs(Fragment, { children: [jsx(Text, {
		color: theme.text,
		children: previewInput(shown)
	}), jsx(Text, {
		color: theme.brand,
		children: "▌"
	})] });
	const before = previewInput(shown.slice(0, clamped));
	const under = previewInput(shown.slice(clamped, clamped + 1)) || " ";
	const after = previewInput(shown.slice(clamped + 1));
	return jsxs(Fragment, { children: [
		jsx(Text, {
			color: theme.text,
			children: before
		}),
		jsx(Text, {
			inverse: true,
			bold: true,
			color: theme.brand,
			children: under
		}),
		jsx(Text, {
			color: theme.text,
			children: after
		})
	] });
}
/** Follow terminal size: width drives the centered column, rows drive the welcome offset. */
function useTerminalDims() {
	const { stdout } = useStdout();
	const [columns, setColumns] = useState(stdout.columns);
	const [rows, setRows] = useState(stdout.rows);
	useEffect(() => {
		const onResize = () => {
			setColumns(stdout.columns);
			setRows(stdout.rows);
		};
		stdout.on("resize", onResize);
		return () => {
			stdout.off("resize", onResize);
		};
	}, [stdout]);
	return {
		columns,
		rows
	};
}
/** Milliseconds the current turn has run; ticks on the spinner interval while active. */
function useRunningClock(active) {
	const [elapsedMs, setElapsedMs] = useState(0);
	const startedAtRef = useRef(0);
	useEffect(() => {
		if (!active) {
			setElapsedMs(0);
			return;
		}
		startedAtRef.current = Date.now();
		const timer = setInterval(() => {
			setElapsedMs(Date.now() - startedAtRef.current);
		}, 80);
		return () => {
			clearInterval(timer);
		};
	}, [active]);
	return elapsedMs;
}
/** Centered-column width for the opencode welcome page. */
function columnWidthFor(columns) {
	if (columns <= 46) return Math.max(1, columns);
	return Math.min(OPENCODE_COLUMN, columns - 2);
}
/** Clamp a list cursor onto its current item count. */
function clampIndex(index, length) {
	return Math.min(index, Math.max(0, length - 1));
}
/** Bottom status line for the classic layout. */
function StatusBar(props) {
	const { state, theme, elapsedMs } = props;
	return jsxs(Box, {
		justifyContent: "space-between",
		children: [jsxs(Text, {
			color: theme.muted,
			dimColor: true,
			children: [
				state.running ? jsxs(Text, {
					color: theme.warn,
					children: [
						spinnerFrame(elapsedMs),
						" ",
						COPY.statusRunning,
						" · ",
						formatElapsed(elapsedMs)
					]
				}) : jsx(Text, {
					color: theme.ok,
					children: COPY.statusIdle
				}),
				" · ",
				state.modelLabel,
				" · ",
				state.sessionLabel,
				jsx(ContextRing, {
					state,
					theme
				})
			]
		}), jsx(TokenUsageLine, {
			state,
			theme
		})]
	});
}
/** Inline context-window readout: ring fraction plus occupancy, or nothing before a window is known. */
function ContextRing(props) {
	const { state, theme } = props;
	const occupancy = state.contextOccupancy;
	if (occupancy === null) return null;
	const band = contextBand(occupancy.percent);
	const color = band === "ok" ? theme.ok : band === "warn" ? theme.warn : theme.error;
	return jsxs(Text, {
		color: theme.muted,
		dimColor: true,
		children: [
			" · ",
			COPY.contextLabel,
			" ",
			jsxs(Text, {
				color,
				children: [
					contextRing(occupancy.percent),
					" ",
					occupancy.percent,
					"%"
				]
			})
		]
	});
}
/** Generation throughput and cumulative usage for the current session. */
function TokenUsageLine(props) {
	const { state, theme } = props;
	return jsxs(Text, {
		color: theme.muted,
		dimColor: true,
		children: [
			COPY.tokenRateLabel,
			" ",
			formatTokenRate(state.tokenRate),
			COPY.tokenRateUnit,
			" · ",
			COPY.tokenUsageLabel,
			" ",
			formatTokenCount(state.tokens.input + state.tokens.output)
		]
	});
}
/** App root: static transcript, live region, modals, and the input line. */
function App(props) {
	const { vm, theme, ui = "classic" } = props;
	const chrome = ui;
	const state = useSyncExternalStore(vm.subscribe, vm.getState);
	const [input, setInput] = useState("");
	const inputRef = useRef(input);
	inputRef.current = input;
	const [cursorPos, setCursorPos] = useState(0);
	const cursorRef = useRef(0);
	cursorRef.current = Math.min(cursorPos, input.length);
	const [pasteSpans, setPasteSpans] = useState([]);
	const pasteSpansRef = useRef([]);
	pasteSpansRef.current = pasteSpans;
	const [pickerIndex, setPickerIndex] = useState(0);
	const [sessionSearch, setSessionSearch] = useState("");
	const [commandIndex, setCommandIndex] = useState(0);
	const [choiceIndex, setChoiceIndex] = useState(0);
	const [choiceSearch, setChoiceSearch] = useState("");
	const [expandedReasoning, setExpandedReasoning] = useState(null);
	const [todosCollapsed, setTodosCollapsed] = useState(false);
	const [boardCursor, setBoardCursor] = useState(-1);
	const [panePage, setPanePage] = useState(0);
	const pickerOpen = state.pickerOpen;
	const choicePicker = state.choicePicker;
	const connectWizard = state.connectWizard;
	const titleEditor = state.titleEditor;
	const pendingApproval = state.pendingApproval;
	const running = state.running;
	const elapsedMs = useRunningClock(running);
	const { columns, rows } = useTerminalDims();
	const columnWidth = columnWidthFor(columns);
	const { committed, live } = useMemo(() => splitTranscript(state.messages), [state.messages]);
	const filteredSessions = useMemo(() => {
		const query = sessionSearch.trim().toLowerCase();
		if (query === "") return state.pickerItems;
		return state.pickerItems.filter((item) => [
			item.title ?? "",
			item.cwd ?? "",
			item.sessionId
		].some((value) => value.toLowerCase().includes(query)));
	}, [state.pickerItems, sessionSearch]);
	const safePickerIndex = clampIndex(pickerIndex, filteredSessions.length);
	const commandQuery = input.startsWith("/") ? input.toLowerCase() : null;
	const commandMatches = useMemo(() => commandQuery === null ? [] : COMMAND_HINTS.filter((candidate) => candidate.name.startsWith(commandQuery)), [commandQuery]);
	const commandMenuOpen = commandQuery !== null && commandMatches.length > 0;
	const effectiveCommandIndex = clampIndex(commandIndex, commandMatches.length);
	const filteredChoices = useMemo(() => {
		if (choicePicker === null) return [];
		const query = choiceSearch.trim().toLowerCase();
		if (query === "") return choicePicker.items;
		return choicePicker.items.filter((item) => item.label.toLowerCase().includes(query) || (item.description?.toLowerCase().includes(query) ?? false));
	}, [choicePicker, choiceSearch]);
	const effectiveChoiceIndex = filteredChoices.length === 0 ? 0 : clampIndex(choiceIndex, filteredChoices.length);
	useEffect(() => {
		if (pickerOpen) {
			setPickerIndex(0);
			setSessionSearch("");
		}
	}, [pickerOpen]);
	const choicePickerWasNull = useRef(true);
	useEffect(() => {
		if (choicePicker !== null && choicePickerWasNull.current) {
			setChoiceIndex(0);
			setChoiceSearch(choicePicker.filter ?? "");
		}
		choicePickerWasNull.current = choicePicker === null;
	}, [choicePicker]);
	useEffect(() => {
		if (state.boardOpen) {
			setBoardCursor(-1);
			setPanePage(0);
		}
	}, [state.boardOpen]);
	useEffect(() => {
		setPanePage(0);
	}, [boardCursor]);
	useEffect(() => {
		setCommandIndex(0);
	}, [input]);
	const setInputValue = (val) => {
		inputRef.current = val;
		setInput(val);
		cursorRef.current = val.length;
		setCursorPos(val.length);
		pasteSpansRef.current = [];
		setPasteSpans([]);
	};
	const insertText = (chunk) => {
		const cur = Math.min(cursorRef.current, inputRef.current.length);
		const nextCur = cur + chunk.length;
		cursorRef.current = nextCur;
		setCursorPos(nextCur);
		const spans = spansAfterInsert(pasteSpansRef.current, cur, chunk.length, isPasteChunk(chunk));
		pasteSpansRef.current = spans;
		setPasteSpans(spans);
		setInput((prev) => {
			const c = Math.min(cur, prev.length);
			const next = prev.slice(0, c) + chunk + prev.slice(c);
			inputRef.current = next;
			return next;
		});
	};
	const deleteBackward = () => {
		const cur = Math.min(cursorRef.current, inputRef.current.length);
		const range = deletionRange(pasteSpansRef.current, cur, "backward", inputRef.current.length);
		if (range === null) return;
		cursorRef.current = range.start;
		setCursorPos(range.start);
		const spans = spansAfterDelete(pasteSpansRef.current, range.start, range.length);
		pasteSpansRef.current = spans;
		setPasteSpans(spans);
		setInput((prev) => {
			const next = prev.slice(0, range.start) + prev.slice(range.start + range.length);
			inputRef.current = next;
			return next;
		});
	};
	const deleteForward = () => {
		const cur = Math.min(cursorRef.current, inputRef.current.length);
		const range = deletionRange(pasteSpansRef.current, cur, "forward", inputRef.current.length);
		if (range === null) return;
		cursorRef.current = range.start;
		setCursorPos(range.start);
		const spans = spansAfterDelete(pasteSpansRef.current, range.start, range.length);
		pasteSpansRef.current = spans;
		setPasteSpans(spans);
		setInput((prev) => {
			const next = prev.slice(0, range.start) + prev.slice(range.start + range.length);
			inputRef.current = next;
			return next;
		});
	};
	const moveCursorLeft = () => {
		setCursorPos((prev) => {
			const next = stepCursor(pasteSpansRef.current, Math.min(prev, inputRef.current.length), -1, inputRef.current.length);
			cursorRef.current = next;
			return next;
		});
	};
	const moveCursorRight = () => {
		setCursorPos((prev) => {
			const next = stepCursor(pasteSpansRef.current, Math.min(prev, inputRef.current.length), 1, inputRef.current.length);
			cursorRef.current = next;
			return next;
		});
	};
	const moveCursorHome = () => {
		cursorRef.current = 0;
		setCursorPos(0);
	};
	const moveCursorEnd = () => {
		cursorRef.current = input.length;
		setCursorPos(input.length);
	};
	useInput((chunk, key) => {
		const lower = chunk.toLowerCase();
		if (isBoardToggle(lower, key)) {
			vm.toggleBoard();
			return;
		}
		if (state.boardOpen) {
			if (key.upArrow || key.downArrow) {
				setBoardCursor((prev) => stepTimelineCursor(prev, state.turnTimeline.length, key));
				return;
			}
			if (key.pageUp || key.pageDown) {
				setBoardCursor((prev) => {
					const length = state.turnTimeline.length;
					const current = prev === -1 ? length - 1 : Math.min(prev, length - 1);
					const next = key.pageUp ? current - 5 : current + 5;
					if (next >= length - 1) return -1;
					return Math.max(0, next);
				});
				return;
			}
			if (key.leftArrow || key.rightArrow) {
				setPanePage((prev) => key.leftArrow ? Math.min(prev + 1, 999) : Math.max(0, prev - 1));
				return;
			}
			return;
		}
		if (pendingApproval !== null) {
			if (lower === "a") vm.resolveApproval("allowed-once");
			else if (lower === "r") vm.resolveApproval("rejected");
			else if (key.escape || lower === "c") vm.resolveApproval("cancelled");
			return;
		}
		if (pickerOpen) {
			const count = filteredSessions.length;
			if (key.upArrow) {
				setPickerIndex((prev) => count === 0 ? 0 : (prev - 1 + count) % count);
				return;
			}
			if (key.downArrow) {
				setPickerIndex((prev) => count === 0 ? 0 : (prev + 1) % count);
				return;
			}
			if (key.return) {
				const item = filteredSessions[safePickerIndex];
				if (item !== void 0) vm.requestSwitch(item.sessionId);
				return;
			}
			if (key.escape || key.ctrl && lower === "c") {
				vm.closePicker();
				return;
			}
			if (key.backspace || key.delete) {
				setSessionSearch((prev) => prev.slice(0, -1));
				setPickerIndex(0);
				return;
			}
			if (chunk !== "" && !key.ctrl && !key.meta) {
				setSessionSearch((prev) => prev + chunk);
				setPickerIndex(0);
			}
			return;
		}
		if (choicePicker !== null) {
			const count = filteredChoices.length;
			if (key.upArrow) {
				setChoiceIndex((prev) => count === 0 ? 0 : (prev - 1 + count) % count);
				return;
			}
			if (key.downArrow) {
				setChoiceIndex((prev) => count === 0 ? 0 : (prev + 1) % count);
				return;
			}
			if (key.return) {
				const item = filteredChoices[effectiveChoiceIndex];
				if (item !== void 0) switch (choicePicker.kind) {
					case "model":
						vm.pickModel(item.value);
						setInput("");
						break;
					case "policy":
						vm.pickPolicy(item.value);
						setInput("");
						break;
					case "connect-provider":
						vm.pickConnectProvider(item.value);
						setInput("");
						break;
					case "connect-api":
						vm.pickConnectApi(item.value);
						setInput("");
						break;
					case "skill":
						vm.pickSkill(item.value);
						setInput(`/${item.value} `);
						break;
					case "mcp":
						vm.pickMcp(item.value);
						setInput(`/${item.value} `);
						break;
					default: assertNever(choicePicker.kind);
				}
				return;
			}
			if (key.escape || key.ctrl && lower === "c") {
				vm.closeChoicePicker();
				setInput("");
				return;
			}
			if (key.backspace || key.delete) {
				setChoiceSearch((prev) => prev.slice(0, -1));
				setChoiceIndex(0);
				return;
			}
			if (chunk !== "" && !key.ctrl && !key.meta) {
				setChoiceSearch((prev) => prev + chunk);
				setChoiceIndex(0);
			}
			return;
		}
		if (connectWizard !== null) {
			if (key.return) {
				vm.submitConnectInput(input);
				setInputValue("");
				return;
			}
			if (key.escape || key.ctrl && lower === "c") {
				vm.cancelConnect();
				setInputValue("");
				return;
			}
			if (key.leftArrow) {
				moveCursorLeft();
				return;
			}
			if (key.rightArrow) {
				moveCursorRight();
				return;
			}
			if (key.ctrl && lower === "a") {
				moveCursorHome();
				return;
			}
			if (key.ctrl && lower === "e") {
				moveCursorEnd();
				return;
			}
			if (isBackspaceKey(chunk, key)) {
				deleteBackward();
				return;
			}
			if (isForwardDeleteKey(chunk, key)) {
				deleteForward();
				return;
			}
			if (key.upArrow || key.downArrow || key.tab) return;
			if (chunk !== "" && !key.ctrl && !key.meta) insertText(chunk);
			return;
		}
		if (titleEditor !== null) {
			if (key.return) {
				vm.submitTitle(input);
				setInputValue("");
				return;
			}
			if (key.escape || key.ctrl && lower === "c") {
				vm.cancelTitleEditor();
				setInputValue("");
				return;
			}
			if (key.leftArrow) {
				moveCursorLeft();
				return;
			}
			if (key.rightArrow) {
				moveCursorRight();
				return;
			}
			if (key.ctrl && lower === "a") {
				moveCursorHome();
				return;
			}
			if (key.ctrl && lower === "e") {
				moveCursorEnd();
				return;
			}
			if (isBackspaceKey(chunk, key)) {
				deleteBackward();
				return;
			}
			if (isForwardDeleteKey(chunk, key)) {
				deleteForward();
				return;
			}
			if (key.upArrow || key.downArrow || key.tab) return;
			if (chunk !== "" && !key.ctrl && !key.meta) insertText(chunk);
			return;
		}
		if (commandMenuOpen) {
			if (key.upArrow) {
				setCommandIndex((prev) => (prev - 1 + commandMatches.length) % commandMatches.length);
				return;
			}
			if (key.downArrow) {
				setCommandIndex((prev) => (prev + 1) % commandMatches.length);
				return;
			}
			if (key.return) {
				const chosen = commandMatches[effectiveCommandIndex];
				if (chosen !== void 0) {
					const line = input.trimEnd();
					setInputValue("");
					vm.send(chosen.name + (line.length > chosen.name.length ? line.slice(chosen.name.length) : ""));
				}
				return;
			}
			if (key.escape || key.ctrl && lower === "c") {
				setInputValue("");
				return;
			}
			if (key.leftArrow) {
				moveCursorLeft();
				return;
			}
			if (key.rightArrow) {
				moveCursorRight();
				return;
			}
			if (key.ctrl && lower === "a") {
				moveCursorHome();
				return;
			}
			if (key.ctrl && lower === "e") {
				moveCursorEnd();
				return;
			}
			if (isBackspaceKey(chunk, key)) {
				deleteBackward();
				return;
			}
			if (isForwardDeleteKey(chunk, key)) {
				deleteForward();
				return;
			}
			if (chunk !== "" && !key.ctrl && !key.meta) insertText(chunk);
			return;
		}
		if (key.ctrl && lower === "c") {
			if (running) vm.stop();
			else vm.quit();
			return;
		}
		if (key.ctrl && (lower === "d" || lower === "q")) {
			vm.quit();
			return;
		}
		if (chunk.length > 1 && isPasteChunk(chunk) && !key.ctrl && !key.meta) {
			insertText(chunk);
			return;
		}
		if (key.ctrl && lower === "t" && !key.meta) {
			setTodosCollapsed((prev) => !prev);
			return;
		}
		if (key.return) {
			const line = input.trimEnd();
			setInputValue("");
			if (line !== "") vm.send(line);
			return;
		}
		if (!running && input === "" && key.ctrl && lower === "r" && !key.meta) {
			const lastReasoned = [...state.messages].reverse().find((message) => message.role === "assistant" && message.reasoning !== "" && message.status === "done");
			if (lastReasoned !== void 0) setExpandedReasoning((prev) => prev === lastReasoned.key ? null : lastReasoned.key);
			return;
		}
		if (key.ctrl && lower === "a") {
			moveCursorHome();
			return;
		}
		if (key.ctrl && lower === "e") {
			moveCursorEnd();
			return;
		}
		if (key.leftArrow) {
			moveCursorLeft();
			return;
		}
		if (key.rightArrow) {
			moveCursorRight();
			return;
		}
		if (isBackspaceKey(chunk, key)) {
			deleteBackward();
			return;
		}
		if (isForwardDeleteKey(chunk, key)) {
			deleteForward();
			return;
		}
		if (key.upArrow || key.downArrow) {
			const recalled = key.upArrow ? vm.historyOlder(input) : vm.historyNewer(input);
			if (recalled !== null) setInputValue(recalled);
			return;
		}
		if (key.escape || key.tab) return;
		if (chunk !== "" && !key.ctrl && !key.meta) insertText(chunk);
	});
	const renderRow = (message) => jsx(MessageRow, {
		message,
		theme,
		reasoningExpanded: expandedReasoning === message.key,
		chrome
	}, message.key);
	const staticList = jsx(Static, {
		items: committed,
		children: renderRow
	}, `${state.sessionId}:${state.transcriptEpoch}`);
	const overlays = jsxs(Fragment, { children: [
		state.error !== null && jsx(Box, {
			marginBottom: 1,
			children: jsxs(Text, {
				color: theme.error,
				children: [
					COPY.errorGlyph,
					" ",
					state.error
				]
			})
		}),
		jsx(ApprovalModal, {
			prompt: pendingApproval,
			theme
		}),
		connectWizard !== null && jsx(ConnectPrompt, {
			wizard: connectWizard,
			theme
		}),
		titleEditor !== null && jsx(TitlePrompt, {
			current: titleEditor,
			theme
		}),
		choicePicker !== null && jsx(ChoiceList, {
			title: choicePicker.title,
			items: filteredChoices,
			selected: effectiveChoiceIndex,
			theme,
			note: choicePicker.note,
			search: choiceSearch
		}),
		commandMenuOpen && jsx(CommandMenu, {
			matches: commandMatches,
			selected: effectiveCommandIndex,
			theme
		})
	] });
	const todos = state.todos;
	const todosVisible = todos !== null && todos.length > 0 && todos.some((todo) => todo.status !== "completed") && !todosCollapsed;
	const queuedNote = state.queued.length > 0 && jsx(Box, {
		marginBottom: 1,
		children: jsxs(Text, {
			color: theme.muted,
			dimColor: true,
			children: [
				COPY.queuedLabel,
				" ",
				state.queued.length,
				" · ",
				collapseFirstLine(state.queued[state.queued.length - 1] ?? "", 48)
			]
		})
	});
	const chromeRows = (chrome === "classic" ? LIVE_CHROME.classicInput + LIVE_CHROME.statusLine : LIVE_CHROME.opencodeComposer) + (state.error !== null ? LIVE_CHROME.error : 0) + (pendingApproval !== null ? LIVE_CHROME.approval : 0) + (pickerOpen ? LIVE_CHROME.sessionPicker : 0) + (choicePicker !== null ? LIVE_CHROME.choicePicker : 0) + (commandMenuOpen ? LIVE_CHROME.commandMenu : 0) + (connectWizard !== null || titleEditor !== null ? LIVE_CHROME.prompt : 0) + (todosVisible ? LIVE_CHROME.todoPanel + todos.length : 0) + (state.queued.length > 0 ? LIVE_CHROME.queued : 0);
	const liveFit = useMemo(() => fitLiveMessages(live, liveRowBudget(rows, chromeRows), {
		columns,
		labeled: chrome === "classic",
		expandedKey: expandedReasoning
	}), [
		live,
		rows,
		chromeRows,
		columns,
		chrome,
		expandedReasoning
	]);
	const liveList = jsxs(Box, {
		flexDirection: "column",
		children: [liveFit.notice && jsx(Text, {
			color: theme.muted,
			dimColor: true,
			children: `${COPY.liveTailMore}${liveFit.hiddenRows} ${COPY.liveTailRest}`
		}), liveFit.messages.map(renderRow)]
	});
	const classicInput = jsxs(Box, {
		marginTop: 1,
		children: [jsx(Text, {
			color: theme.brand,
			children: "❯ "
		}), renderInputWithCursor(input, cursorPos, theme, running, COPY.classicInputPlaceholder, pasteSpans)]
	});
	const opencodeComposer = jsxs(Fragment, { children: [jsxs(Box, {
		borderStyle: "round",
		borderColor: theme.brand,
		marginTop: 1,
		paddingX: 1,
		flexDirection: "column",
		children: [jsxs(Box, { children: [jsx(Text, {
			color: theme.brand,
			children: "> "
		}), renderInputWithCursor(input, cursorPos, theme, running, connectWizard !== null || titleEditor !== null ? void 0 : COPY.composerPlaceholder, pasteSpans)] }), jsxs(Box, {
			marginTop: 1,
			justifyContent: "space-between",
			children: [jsxs(Text, {
				color: theme.muted,
				dimColor: true,
				children: [
					state.modelLabel,
					" · ",
					COPY.permissionLabel,
					" ",
					jsx(Text, {
						color: theme.brand,
						children: state.permissionPreset
					}),
					jsx(ContextRing, {
						state,
						theme
					})
				]
			}), jsx(Text, {
				color: running ? theme.warn : theme.ok,
				children: running ? `${spinnerFrame(elapsedMs)} ${COPY.statusRunning} · ${formatElapsed(elapsedMs)}` : COPY.statusIdle
			})]
		})]
	}), jsx(Box, {
		marginTop: 1,
		justifyContent: "flex-end",
		children: jsx(TokenUsageLine, {
			state,
			theme
		})
	})] });
	if (state.boardOpen) return jsxs(Box, {
		flexDirection: "column",
		children: [staticList, jsx(TaskBoard, {
			state,
			theme,
			elapsedMs,
			cursor: boardCursor,
			panePage,
			rows,
			columns
		})]
	});
	if (chrome === "opencode") {
		if (pickerOpen) return jsxs(Box, {
			width: "100%",
			height: Math.max(8, rows - 2),
			alignItems: "center",
			justifyContent: "center",
			children: [staticList, jsx(Box, {
				width: Math.min(columnWidth, 78),
				children: jsx(SessionPicker, {
					items: filteredSessions,
					selected: safePickerIndex,
					search: sessionSearch,
					theme
				})
			})]
		});
		if (committed.length === 0 && live.length === 0) {
			const measured = Number.isFinite(rows);
			const bannerFits = columnWidth >= 28 && (!measured || rows >= WELCOME_BANNER_MIN_ROWS);
			const pageRows = (bannerFits ? WELCOME_BANNER.length : 1) + WELCOME_TRIM_ROWS;
			return jsxs(Box, {
				flexDirection: "column",
				width: "100%",
				marginTop: measured ? Math.max(0, Math.floor((rows - pageRows - LIVE_CHROME.opencodeComposer) / 2)) : 0,
				children: [staticList, jsx(Box, {
					width: "100%",
					justifyContent: "center",
					children: jsxs(Box, {
						width: columnWidth,
						flexDirection: "column",
						children: [
							jsx(WelcomeArt, {
								width: columnWidth,
								theme,
								modelLabel: state.modelLabel,
								permissionPreset: state.permissionPreset,
								banner: bannerFits
							}),
							overlays,
							todosVisible && jsx(TaskPanel, {
								todos,
								theme
							}),
							queuedNote,
							opencodeComposer
						]
					})
				})]
			});
		}
		return jsxs(Box, {
			flexDirection: "column",
			width: "100%",
			children: [
				staticList,
				liveList,
				overlays,
				todosVisible && jsx(TaskPanel, {
					todos,
					theme
				}),
				queuedNote,
				opencodeComposer
			]
		});
	}
	return jsxs(Box, {
		flexDirection: "column",
		children: [
			staticList,
			liveList,
			pickerOpen && jsx(SessionPicker, {
				items: filteredSessions,
				selected: safePickerIndex,
				search: sessionSearch,
				theme
			}),
			overlays,
			todosVisible && jsx(TaskPanel, {
				todos,
				theme
			}),
			queuedNote,
			classicInput,
			jsx(StatusBar, {
				state,
				theme,
				elapsedMs
			})
		]
	});
}
//#endregion
//#region lib/types/list-projection.js
/**
* The Session-list metadata projection (`sessionListMetadata`): the
* blank/lastPromptAt fold the session picker reads from the projection
* cache. The official registration lives in the web surface's
* session-controller row; a terminal-only profile mounts no
* session-controller, so this bundle registers the same unit itself — same
* key, same state shape, same stateVersion — keeping checkpoint rows
* compatible in both directions: rows written under the web surface load
* here, and rows written here load under the web surface.
* @module @dsh-external/dsh-cli-app/list-projection
*/
const sessionListMetadataSchema = z$1.object({
	blank: z$1.boolean(),
	lastPromptAt: z$1.number().nullable()
});
/**
* Advance the Session-list metadata projection by one committed event.
* @param state - metadata before the event.
* @param event - next committed Session event.
* @returns the original or advanced metadata value.
*/
function applySessionListMetadata(state, event) {
	const blank = state.blank && event.type !== "turn/start";
	const lastPromptAt = event.type === "user/message" && event.data.source.kind === "user" ? event.time : state.lastPromptAt;
	return blank === state.blank && lastPromptAt === state.lastPromptAt ? state : {
		blank,
		lastPromptAt
	};
}
/**
* Register the projection into the process registry. The registration is an
* effect on the calling context's fiber, so it lives exactly as long as the
* terminal app.
* @param ctx - context carrying the session-projection registry service.
*/
function registerSessionListProjection(ctx) {
	ctx.sessionProjections.register({
		key: "sessionListMetadata",
		stateSchema: sessionListMetadataSchema,
		init: () => ({
			blank: true,
			lastPromptAt: null
		}),
		apply: applySessionListMetadata,
		wire: {
			viewSchema: sessionListMetadataSchema,
			view: (state) => state
		},
		stateVersion: 1
	});
}
//#endregion
//#region lib/types/index.js
/**
* `@dsh-external/dsh-cli-app` — interactive terminal frontend for dsh. The
* bundle patch rides over dsh-base without Host, HTTP, or browser plugins;
* this glue waits for the Loader tree, creates or resumes the single Agent
* through the core registry, mounts the Ink UI, and exits through the
* launcher's bounded shutdown when the UI asks to leave.
* @module @dsh-external/dsh-cli-app
*/
/** Stable Cordis plugin name. */
const name = "cli-app";
/**
* Render the terminal app on one stream pair, with the resize reflow correction
* installed around it. The correction goes in before Ink so its `resize`
* listener runs ahead of Ink's own: that ordering is what lets it measure the
* shrink before Ink erases with the count computed at the previous width.
* @param element - the Ink element tree to mount.
* @param streams - the terminal streams Ink renders on and reads keys from.
* @returns the mounted surface the session loop drives.
*/
function renderApp(element, streams) {
	const reflow = installResizeReflow(streams.stdout);
	const instance = render(element, {
		stdout: streams.stdout,
		...streams.stdin === void 0 ? {} : { stdin: streams.stdin }
	});
	return {
		rerender: (next) => {
			instance.rerender(next);
		},
		unmount: () => {
			reflow.restore();
			instance.unmount();
		},
		clearViewport: () => {
			instance.clear();
			streams.stdout.write(CLEAR_VIEWPORT);
		},
		clearScreen: () => {
			instance.clear();
			streams.stdout.write(CLEAR_SCREEN);
		}
	};
}
/**
* Process render slot tests substitute: {@link renderApp} on the process
* streams, or a capture that drives {@link ViewModel.done} through the
* element's `vm` prop.
*/
const internals = { render: (element) => renderApp(element, { stdout: process.stdout }) };
/**
* Test-only handle to the live view model. Composition tests drive session
* actions through the same surface the key handlers use, because the Ink
* testing library's fake stdin does not reach ink 5's hard-wired
* `process.stdin`.
*/
const testHooks = { currentVm: null };
/** Core services required before the terminal session can start. */
const inject = [
	"cliStartup",
	"agentDefaultModel",
	"agents",
	"sessions",
	"sessionProjections"
];
const Config = z.object({
	resumeSessionId: z.string(),
	cwd: z.string(),
	model: z.string(),
	theme: z.string(),
	ui: z.string().default("classic")
});
/** Split `provider/model`; an empty override falls back to the default selection. */
function resolveSelection(override, current) {
	if (override === "") {
		if (current.provider === void 0 || current.model === void 0) throw new Error(`cli-app: no default model selection is available (provider=${String(current.provider)}, model=${String(current.model)})`);
		return {
			provider: current.provider,
			model: current.model
		};
	}
	const slash = override.indexOf("/");
	if (slash <= 0 || slash === override.length - 1) throw new Error(`cli-app: --model expects provider/model, got ${JSON.stringify(override)}`);
	return {
		provider: override.slice(0, slash),
		model: override.slice(slash + 1)
	};
}
/** Report an unexpected terminal failure and request a failing exit. */
function fail(ctx, error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`dsh: ${message}\n`);
	const exit = ctx.get("appExit");
	if (exit !== void 0) exit(1);
}
/**
* Open (create / resume / fork) one agent handle. A fork seeds the child with
* the parent's balanced completed-turn prefix, so it carries the same world up
* to the last finished turn and starts fresh afterwards. A resume may carry a
* model override (`/model` resumes the same session under a new route).
* @param services - registry, model selection, and fresh workspace root.
* @param request - what to open.
* @param approvalBus - approval bridge the agent-scope answerer resolves through.
* @returns the opened live handle.
*/
async function openSession(services, request, approvalBus) {
	const { agents, selection, freshCwd } = services;
	const setup = (agentCtx) => {
		installModelSelection(agentCtx, {
			current: selection,
			assembled: void 0
		});
		agentCtx.on("approval/request", (req) => approvalBus.request({
			toolName: req.toolName,
			...req.reason !== void 0 ? { reason: req.reason } : {}
		}));
	};
	switch (request.kind) {
		case "resume": return await agents.resume({
			resumeSessionId: brandString(request.sessionId),
			agentOptions: request.model ?? selection,
			setup
		});
		case "fork":
		case "model-fork": {
			const sessionId = brandString(`session-${randomUUID()}`);
			const meta = {
				cwd: request.parentCwd ?? freshCwd,
				parentSession: request.parentId
			};
			const agentOptions = request.model ?? selection;
			if (request.seed.length === 0) return await agents.create({
				sessionId,
				meta,
				agentOptions,
				setup
			});
			return await agents.create({
				sessionId,
				seed: request.seed,
				inheritedEventCount: SessionLogOffset(request.seed.length),
				meta: {
					...meta,
					isSeeded: true
				},
				agentOptions,
				setup
			});
		}
		case "fresh": return await agents.create({
			sessionId: brandString(`session-${randomUUID()}`),
			meta: { cwd: freshCwd },
			agentOptions: selection,
			setup
		});
		default: return assertNever(request);
	}
}
/** Resolve the display label for one opened session (best-effort title). */
function labelFor(session, catalog) {
	return sessionLabel({
		title: catalog.find((item) => item.sessionId === session.id)?.title ?? null,
		sessionId: session.id,
		cwd: session.header.cwd ?? null
	});
}
/** Run the interactive session controller and request process exit when it ends. */
async function run(ctx, config) {
	await ctx.get("loader")?.await();
	const agents = ctx.get("agents");
	const defaultModel = ctx.get("agentDefaultModel");
	const sessions = ctx.get("sessions");
	if (agents === void 0 || defaultModel === void 0 || sessions === void 0) return;
	const exit = ctx.get("appExit");
	if (exit === void 0) throw new Error("cli-app: the launcher must provide ctx.appExit before the tree mounts");
	const selection = resolveSelection(config.model, defaultModel.currentSelection());
	const theme = resolveTheme(config.theme);
	const chrome = resolveChrome(config.ui);
	const services = {
		agents,
		selection,
		freshCwd: config.cwd === "" ? process.cwd() : config.cwd
	};
	const flush = async (session) => {
		await sessions.flush(session);
	};
	const promptHistory = createPromptHistory();
	let request = config.resumeSessionId !== "" ? {
		kind: "resume",
		sessionId: config.resumeSessionId
	} : { kind: "fresh" };
	let live = null;
	let ink = null;
	try {
		for (;;) {
			const approvalBus = createApprovalBus();
			const handle = await openSession(services, request, approvalBus);
			const { agent } = handle;
			await agent.whenIdle();
			const catalog = await listPersistedSessions(ctx);
			const vm = createViewModel({
				ctx,
				agent,
				session: agent.session,
				sessionLabel: labelFor(agent.session, catalog),
				catalog,
				approvalBus,
				flush,
				promptHistory,
				requestScreenClear: () => {
					ink?.clearViewport?.();
				}
			});
			live = {
				handle,
				vm
			};
			testHooks.currentVm = vm;
			const element = React.createElement(App, {
				key: agent.id,
				vm,
				theme,
				ui: chrome
			});
			if (ink === null) {
				if (process.stdout.isTTY) process.stdout.write("\r\x1B[2K");
				ink = internals.render(element);
			} else ink.rerender(element);
			const requested = await vm.done;
			testHooks.currentVm = null;
			const forkSeed = requested.type === "fork" || requested.type === "model-switch" ? collectForkSeed(agent.session) : [];
			const parentId = agent.id;
			const parentCwd = agent.session.header.cwd;
			vm.dispose();
			await handle.dispose();
			live = null;
			switch (requested.type) {
				case "quit":
					ink.unmount();
					exit(0);
					return;
				case "new":
					request = { kind: "fresh" };
					break;
				case "fork":
					request = {
						kind: "fork",
						seed: forkSeed,
						parentId,
						parentCwd
					};
					break;
				case "switch":
					request = {
						kind: "resume",
						sessionId: requested.sessionId
					};
					break;
				case "model-switch":
					request = {
						kind: "model-fork",
						seed: forkSeed,
						parentId,
						parentCwd,
						model: resolveSelection(requested.spec, selection)
					};
					break;
			}
			if (ink.clearScreen !== void 0) ink.clearScreen();
			else ink.clearViewport?.();
		}
	} finally {
		if (live !== null) {
			live.vm.dispose();
			await live.handle.dispose();
		}
	}
}
/** Mount the terminal glue. */
function apply(ctx, config) {
	registerSessionListProjection(ctx);
	run(ctx, config).catch((error) => {
		fail(ctx, error);
	});
}
//#endregion
export { Config, apply, inject, internals, name, renderApp, testHooks };
