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

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Static, Text, useInput, useStdout } from 'ink'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { COPY, WORDMARK } from './copy.ts'
import type { UiMessage, ViewModel } from './model.ts'
import { COMMAND_HINTS } from './state.ts'
import { collapseFirstLine, splitTranscript } from './transcript.ts'
import { LIVE_CHROME, fitLiveMessages, liveRowBudget } from './live-budget.ts'
import { ApprovalModal, ChoiceList, CommandMenu, ConnectPrompt, SessionPicker, TitlePrompt } from './overlays.tsx'
import { MessageRow } from './messages.tsx'
import { SPINNER_INTERVAL_MS, formatElapsed, spinnerFrame } from './spinner.ts'
import { TaskPanel } from './todos.tsx'
import { TIMELINE_PAGE, TaskBoard, isBoardToggle, stepTimelineCursor } from './taskboard.tsx'
import { contextBand, contextRing, formatTokenCount, formatTokenRate } from './status.ts'
import type { ThemeTokens } from './theme.ts'
import type { UiChrome } from './chrome.ts'

/** Widest the opencode welcome column grows before the terminal keeps the rest as side air. */
const OPENCODE_COLUMN = 104
/** Smallest usable centered column; below this the terminal width wins to avoid clipping. */
const OPENCODE_MIN_COLUMN = 44
/** Keep a large paste from turning the prompt into a multi-screen repaint; the full buffer is preserved. */
const INPUT_PREVIEW_LIMIT = 240

/** Colours of the welcome wordmark, one per glyph. */
const WORDMARK_COLORS: readonly string[] = ['#9BE800', '#A9EA1A', '#B9EC43', '#C9E98A']

/** Collapse a multi-line buffer into the single prompt line. */
function previewInput(value: string): string {
  const compact = value.replace(/\r?\n/g, COPY.inputNewlineMark)
  if (compact.length <= INPUT_PREVIEW_LIMIT) return compact
  return `${compact.slice(0, INPUT_PREVIEW_LIMIT)}…`
}

/** Detect whether a keypress is Backspace across platforms (macOS delete, xterm DEL, etc.). */
function isBackspaceKey(chunk: string, key: { backspace: boolean; delete: boolean }): boolean {
  return Boolean(key.backspace || chunk === '\x08' || chunk === '\x7f' || (key.delete && chunk !== '\x1b[3~'))
}

/** Detect whether a keypress is forward Delete (PC Del key, etc.). */
function isForwardDeleteKey(chunk: string, key: { delete: boolean }): boolean {
  return Boolean(key.delete && chunk === '\x1b[3~')
}

/** Render prompt input with an interactive cursor pointer. */
function renderInputWithCursor(
  text: string,
  cursor: number,
  theme: ThemeTokens,
  running: boolean,
  placeholder?: string,
): React.JSX.Element {
  if (text === '') {
    return (
      <>
        {placeholder !== undefined ? <Text color={theme.muted} dimColor>{placeholder}</Text> : null}
        {!running && <Text color={theme.brand}>▌</Text>}
      </>
    )
  }
  const clamped = Math.min(Math.max(0, cursor), text.length)
  if (clamped >= text.length) {
    return (
      <>
        <Text color={theme.text}>{previewInput(text)}</Text>
        <Text color={theme.brand}>▌</Text>
      </>
    )
  }
  const before = previewInput(text.slice(0, clamped))
  const under = previewInput(text.slice(clamped, clamped + 1)) || ' '
  const after = previewInput(text.slice(clamped + 1))
  return (
    <>
      <Text color={theme.text}>{before}</Text>
      <Text inverse bold color={theme.brand}>{under}</Text>
      <Text color={theme.text}>{after}</Text>
    </>
  )
}

/** Follow terminal size: width drives the centered column, rows drive the welcome offset. */
function useTerminalDims(): { columns: number; rows: number } {
  const { stdout } = useStdout()
  const [columns, setColumns] = useState(stdout.columns)
  const [rows, setRows] = useState(stdout.rows)
  useEffect(() => {
    const onResize = (): void => {
      setColumns(stdout.columns)
      setRows(stdout.rows)
    }
    stdout.on('resize', onResize)
    return () => { stdout.off('resize', onResize) }
  }, [stdout])
  return { columns, rows }
}

/** Milliseconds the current turn has run; ticks on the spinner interval while active. */
function useRunningClock(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef(0)
  useEffect(() => {
    if (!active) {
      setElapsedMs(0)
      return
    }
    startedAtRef.current = Date.now()
    const timer = setInterval(() => { setElapsedMs(Date.now() - startedAtRef.current) }, SPINNER_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [active])
  return elapsedMs
}

/** Centered-column width for the opencode welcome page. */
function columnWidthFor(columns: number): number {
  // Never let the centered panel be wider than the terminal: a minimum wider
  // than the viewport would clip, and a resize could leave the previous frame
  // painted outside Ink's new bounds.
  if (columns <= OPENCODE_MIN_COLUMN + 2) return Math.max(1, columns)
  return Math.min(OPENCODE_COLUMN, columns - 2)
}

/** Clamp a list cursor onto its current item count. */
function clampIndex(index: number, length: number): number {
  return Math.min(index, Math.max(0, length - 1))
}

/** Bottom status line for the classic layout. */
function StatusBar(props: { state: ReturnType<ViewModel['getState']>; theme: ThemeTokens; elapsedMs: number }): React.JSX.Element {
  const { state, theme, elapsedMs } = props
  return (
    <Box justifyContent="space-between">
      <Text color={theme.muted} dimColor>
        {state.running
          ? <Text color={theme.warn}>{spinnerFrame(elapsedMs)} {COPY.statusRunning} · {formatElapsed(elapsedMs)}</Text>
          : <Text color={theme.ok}>{COPY.statusIdle}</Text>}
        {' · '}{state.modelLabel}{' · '}{state.sessionLabel}
        <ContextRing state={state} theme={theme} />
      </Text>
      <TokenUsageLine state={state} theme={theme} />
    </Box>
  )
}

/** Inline context-window readout: ring fraction plus occupancy, or nothing before a window is known. */
function ContextRing(props: { state: ReturnType<ViewModel['getState']>; theme: ThemeTokens }): React.JSX.Element | null {
  const { state, theme } = props
  const occupancy = state.contextOccupancy
  if (occupancy === null) return null
  const band = contextBand(occupancy.percent)
  const color = band === 'ok' ? theme.ok : band === 'warn' ? theme.warn : theme.error
  return (
    <Text color={theme.muted} dimColor>
      {' · '}{COPY.contextLabel}{' '}
      <Text color={color}>{contextRing(occupancy.percent)} {occupancy.percent}%</Text>
    </Text>
  )
}

/** Generation throughput and cumulative usage for the current session. */
function TokenUsageLine(props: { state: ReturnType<ViewModel['getState']>; theme: ThemeTokens }): React.JSX.Element {
  const { state, theme } = props
  return (
    <Text color={theme.muted} dimColor>
      {COPY.tokenRateLabel} {formatTokenRate(state.tokenRate)}{COPY.tokenRateUnit}
      {' · '}{COPY.tokenUsageLabel} {formatTokenCount(state.tokens.input + state.tokens.output)}
    </Text>
  )
}

/** App root: static transcript, live region, modals, and the input line. */
export function App(props: { vm: ViewModel; theme: ThemeTokens; ui?: UiChrome }): React.JSX.Element {
  const { vm, theme, ui = 'classic' } = props
  const chrome: UiChrome = ui
  const state = useSyncExternalStore(vm.subscribe, vm.getState)
  const [input, setInput] = useState('')
  const inputRef = useRef(input)
  inputRef.current = input
  const [cursorPos, setCursorPos] = useState(0)
  const cursorRef = useRef(0)
  cursorRef.current = Math.min(cursorPos, input.length)
  const [pickerIndex, setPickerIndex] = useState(0)
  const [sessionSearch, setSessionSearch] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const [choiceIndex, setChoiceIndex] = useState(0)
  // Type-to-filter buffer for the choice picker (the sessions modal shares
  // the same interaction; the composer itself stays closed while it is open).
  const [choiceSearch, setChoiceSearch] = useState('')
  // Key of the assistant row whose reasoning is expanded (default collapsed).
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null)
  // Ctrl+T fold for the agent task panel.
  const [todosCollapsed, setTodosCollapsed] = useState(false)
  // The board's timeline cursor: -1 follows the live turn; the arrow keys drag
  // it through history while the board's content pane renders that turn.
  const [boardCursor, setBoardCursor] = useState(-1)
  // The content pane's page inside the selected turn; 0 shows the newest page.
  const [panePage, setPanePage] = useState(0)

  const pickerOpen = state.pickerOpen
  const choicePicker = state.choicePicker
  const connectWizard = state.connectWizard
  const titleEditor = state.titleEditor
  const pendingApproval = state.pendingApproval
  const running = state.running
  const elapsedMs = useRunningClock(running)
  const { columns, rows } = useTerminalDims()
  const columnWidth = columnWidthFor(columns)

  // The static list must be append-only: it is derived from the durable log and
  // grows as rows settle, never in place.
  const { committed, live } = useMemo(() => splitTranscript(state.messages), [state.messages])

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase()
    if (query === '') return state.pickerItems
    return state.pickerItems.filter(item =>
      [item.title ?? '', item.cwd ?? '', item.sessionId].some(value => value.toLowerCase().includes(query)))
  }, [state.pickerItems, sessionSearch])
  const safePickerIndex = clampIndex(pickerIndex, filteredSessions.length)

  // Slash-command palette: matched while the buffer starts with '/'.
  const commandQuery = input.startsWith('/') ? input.toLowerCase() : null
  const commandMatches = useMemo(
    () => (commandQuery === null ? [] : COMMAND_HINTS.filter(candidate => candidate.name.startsWith(commandQuery))),
    [commandQuery],
  )
  const commandMenuOpen = commandQuery !== null && commandMatches.length > 0
  const effectiveCommandIndex = clampIndex(commandIndex, commandMatches.length)
  // Type-to-filter over the choice list: `/skills` rows narrow on the label
  // or the description, mirroring how the sessions modal filters its rows.
  const filteredChoices = useMemo(() => {
    if (choicePicker === null) return []
    const query = choiceSearch.trim().toLowerCase()
    if (query === '') return choicePicker.items
    return choicePicker.items.filter(item =>
      item.label.toLowerCase().includes(query) || (item.description?.toLowerCase().includes(query) ?? false))
  }, [choicePicker, choiceSearch])
  const effectiveChoiceIndex = filteredChoices.length === 0 ? 0 : clampIndex(choiceIndex, filteredChoices.length)

  // A picker opening always starts at the newest row; the index never outlives
  // its catalog snapshot.
  useEffect(() => {
    if (pickerOpen) {
      setPickerIndex(0)
      setSessionSearch('')
    }
  }, [pickerOpen])
  const choicePickerWasNull = useRef(true)
  useEffect(() => {
    // Reset the cursor and the search buffer only on a fresh open, never when
    // an async catalog swap replaces the placeholder with the real list.
    if (choicePicker !== null && choicePickerWasNull.current) {
      setChoiceIndex(0)
      // `/skills <text>` opens the list with its argument already in the
      // field the user would otherwise type into.
      setChoiceSearch(choicePicker.filter ?? '')
    }
    choicePickerWasNull.current = choicePicker === null
  }, [choicePicker])
  // Opening the board always lands on the live turn.
  useEffect(() => {
    if (state.boardOpen) {
      setBoardCursor(-1)
      setPanePage(0)
    }
  }, [state.boardOpen])
  // Dragging to another turn also lands on its newest page.
  useEffect(() => {
    setPanePage(0)
  }, [boardCursor])
  // The command menu follows the buffer; reset the highlight on every edit.
  useEffect(() => {
    setCommandIndex(0)
  }, [input])

  const setInputValue = (val: string) => {
    inputRef.current = val
    setInput(val)
    cursorRef.current = val.length
    setCursorPos(val.length)
  }

  const insertText = (chunk: string) => {
    const cur = Math.min(cursorRef.current, inputRef.current.length)
    const nextCur = cur + chunk.length
    cursorRef.current = nextCur
    setCursorPos(nextCur)
    setInput(prev => {
      const c = Math.min(cur, prev.length)
      const next = prev.slice(0, c) + chunk + prev.slice(c)
      inputRef.current = next
      return next
    })
  }

  const deleteBackward = () => {
    const cur = Math.min(cursorRef.current, inputRef.current.length)
    if (cur === 0) return
    const nextCur = cur - 1
    cursorRef.current = nextCur
    setCursorPos(nextCur)
    setInput(prev => {
      const c = Math.min(cur, prev.length)
      if (c === 0) return prev
      const next = prev.slice(0, c - 1) + prev.slice(c)
      inputRef.current = next
      return next
    })
  }

  const deleteForward = () => {
    const cur = Math.min(cursorRef.current, inputRef.current.length)
    if (cur >= inputRef.current.length) return
    setInput(prev => {
      const c = Math.min(cur, prev.length)
      if (c >= prev.length) return prev
      const next = prev.slice(0, c) + prev.slice(c + 1)
      inputRef.current = next
      return next
    })
  }

  const moveCursorLeft = () => {
    setCursorPos(prev => {
      const next = Math.max(0, prev - 1)
      cursorRef.current = next
      return next
    })
  }

  const moveCursorRight = () => {
    setCursorPos(prev => {
      const next = Math.min(input.length, prev + 1)
      cursorRef.current = next
      return next
    })
  }

  const moveCursorHome = () => {
    cursorRef.current = 0
    setCursorPos(0)
  }

  const moveCursorEnd = () => {
    cursorRef.current = input.length
    setCursorPos(input.length)
  }

  useInput((chunk, key) => {
    const lower = chunk.toLowerCase()
    // Ctrl+B swaps the conversation for the full-screen task board; the same
    // chord returns. While the board is up it swallows every other key.
    if (isBoardToggle(lower, key)) {
      vm.toggleBoard()
      return
    }
    // While the board is up the keys drag the timeline instead of typing.
    if (state.boardOpen) {
      if (key.upArrow || key.downArrow) {
        setBoardCursor(prev => stepTimelineCursor(prev, state.turnTimeline.length, key))
        return
      }
      if (key.pageUp || key.pageDown) {
        setBoardCursor((prev) => {
          const length = state.turnTimeline.length
          const current = prev === -1 ? length - 1 : Math.min(prev, length - 1)
          const next = key.pageUp ? current - TIMELINE_PAGE : current + TIMELINE_PAGE
          if (next >= length - 1) return -1
          return Math.max(0, next)
        })
        return
      }
      if (key.leftArrow || key.rightArrow) {
        setPanePage(prev => (key.leftArrow ? Math.min(prev + 1, 999) : Math.max(0, prev - 1)))
        return
      }
      return
    }
    // Priority 1: tool approval question.
    if (pendingApproval !== null) {
      if (lower === 'a') vm.resolveApproval('allowed-once')
      else if (lower === 'r') vm.resolveApproval('rejected')
      else if (key.escape || lower === 'c') vm.resolveApproval('cancelled')
      return
    }
    // Priority 2: session modal. Arrow keys only move the filtered list.
    if (pickerOpen) {
      const count = filteredSessions.length
      if (key.upArrow) {
        setPickerIndex(prev => (count === 0 ? 0 : (prev - 1 + count) % count))
        return
      }
      if (key.downArrow) {
        setPickerIndex(prev => (count === 0 ? 0 : (prev + 1) % count))
        return
      }
      if (key.return) {
        const item = filteredSessions[safePickerIndex]
        if (item !== undefined) vm.requestSwitch(item.sessionId)
        return
      }
      if (key.escape || (key.ctrl && lower === 'c')) {
        vm.closePicker()
        return
      }
      if (key.backspace || key.delete) {
        setSessionSearch(prev => prev.slice(0, -1))
        setPickerIndex(0)
        return
      }
      if (chunk !== '' && !key.ctrl && !key.meta) {
        setSessionSearch(prev => prev + chunk)
        setPickerIndex(0)
      }
      return
    }
    // Priority 3: /model, /perm, /connect, and /skills choice lists.
    if (choicePicker !== null) {
      const count = filteredChoices.length
      if (key.upArrow) {
        setChoiceIndex(prev => (count === 0 ? 0 : (prev - 1 + count) % count))
        return
      }
      if (key.downArrow) {
        setChoiceIndex(prev => (count === 0 ? 0 : (prev + 1) % count))
        return
      }
      if (key.return) {
        const item = filteredChoices[effectiveChoiceIndex]
        if (item !== undefined) {
          switch (choicePicker.kind) {
            case 'model':
              vm.pickModel(item.value)
              setInput('')
              break
            case 'policy':
              vm.pickPolicy(item.value)
              setInput('')
              break
            case 'connect-provider':
              vm.pickConnectProvider(item.value)
              setInput('')
              break
            case 'connect-api':
              vm.pickConnectApi(item.value)
              setInput('')
              break
            case 'skill':
              // Claude Code / opencode parity: the pick does not send; it
              // stages `/name ` in the composer so guidance text follows in
              // the same draft, and Enter then routes through the skill route.
              vm.pickSkill(item.value)
              setInput(`/${item.value} `)
              break
            case 'mcp':
              vm.pickMcp(item.value)
              setInput(`/${item.value} `)
              break
            default:
              assertNever(choicePicker.kind)
          }
        }
        return
      }
      if (key.escape || (key.ctrl && lower === 'c')) {
        // Cancel also clears whatever trickled into the buffer while the async
        // `/skills` catalog was still loading.
        vm.closeChoicePicker()
        setInput('')
        return
      }
      if (key.backspace || key.delete) {
        setChoiceSearch(prev => prev.slice(0, -1))
        setChoiceIndex(0)
        return
      }
      // Typing narrows the list in place; the composer stays closed until a
      // pick lands or Esc leaves.
      if (chunk !== '' && !key.ctrl && !key.meta) {
        setChoiceSearch(prev => prev + chunk)
        setChoiceIndex(0)
      }
      return
    }
    // Priority 4: the /connect text-field wizard.
    if (connectWizard !== null) {
      if (key.return) {
        vm.submitConnectInput(input)
        setInputValue('')
        return
      }
      if (key.escape || (key.ctrl && lower === 'c')) {
        vm.cancelConnect()
        setInputValue('')
        return
      }
      if (key.leftArrow) {
        moveCursorLeft()
        return
      }
      if (key.rightArrow) {
        moveCursorRight()
        return
      }
      if (key.ctrl && lower === 'a') {
        moveCursorHome()
        return
      }
      if (key.ctrl && lower === 'e') {
        moveCursorEnd()
        return
      }
      if (isBackspaceKey(chunk, key)) {
        deleteBackward()
        return
      }
      if (isForwardDeleteKey(chunk, key)) {
        deleteForward()
        return
      }
      if (key.upArrow || key.downArrow || key.tab) return
      if (chunk !== '' && !key.ctrl && !key.meta) insertText(chunk)
      return
    }
    // Priority 4.5: the /title text-field editor.
    if (titleEditor !== null) {
      if (key.return) {
        vm.submitTitle(input)
        setInputValue('')
        return
      }
      if (key.escape || (key.ctrl && lower === 'c')) {
        vm.cancelTitleEditor()
        setInputValue('')
        return
      }
      if (key.leftArrow) {
        moveCursorLeft()
        return
      }
      if (key.rightArrow) {
        moveCursorRight()
        return
      }
      if (key.ctrl && lower === 'a') {
        moveCursorHome()
        return
      }
      if (key.ctrl && lower === 'e') {
        moveCursorEnd()
        return
      }
      if (isBackspaceKey(chunk, key)) {
        deleteBackward()
        return
      }
      if (isForwardDeleteKey(chunk, key)) {
        deleteForward()
        return
      }
      if (key.upArrow || key.downArrow || key.tab) return
      if (chunk !== '' && !key.ctrl && !key.meta) insertText(chunk)
      return
    }
    // Priority 5: slash-command palette.
    if (commandMenuOpen) {
      if (key.upArrow) {
        setCommandIndex(prev => (prev - 1 + commandMatches.length) % commandMatches.length)
        return
      }
      if (key.downArrow) {
        setCommandIndex(prev => (prev + 1) % commandMatches.length)
        return
      }
      if (key.return) {
        const chosen = commandMatches[effectiveCommandIndex]
        if (chosen !== undefined) {
          const line = input.trimEnd()
          setInputValue('')
          // Execute through the same dispatch the typed line would use.
          vm.send(chosen.name + (line.length > chosen.name.length ? line.slice(chosen.name.length) : ''))
        }
        return
      }
      if (key.escape || (key.ctrl && lower === 'c')) {
        setInputValue('')
        return
      }
      if (key.leftArrow) {
        moveCursorLeft()
        return
      }
      if (key.rightArrow) {
        moveCursorRight()
        return
      }
      if (key.ctrl && lower === 'a') {
        moveCursorHome()
        return
      }
      if (key.ctrl && lower === 'e') {
        moveCursorEnd()
        return
      }
      // Editing keys still operate on the buffer (backspace / typing filters).
      if (isBackspaceKey(chunk, key)) {
        deleteBackward()
        return
      }
      if (isForwardDeleteKey(chunk, key)) {
        deleteForward()
        return
      }
      if (chunk !== '' && !key.ctrl && !key.meta) insertText(chunk)
      return
    }
    // Reserved control chords. Ink reports ctrl+c as key.ctrl with the literal
    // input character 'c' in the chunk.
    if (key.ctrl && lower === 'c') {
      if (running) vm.stop()
      else vm.quit()
      return
    }
    if (key.ctrl && (lower === 'd' || lower === 'q')) {
      vm.quit()
      return
    }
    // Ctrl+T folds or unfolds the agent task panel.
    if (key.ctrl && lower === 't' && !key.meta) {
      setTodosCollapsed(prev => !prev)
      return
    }
    if (key.return) {
      const line = input.trimEnd()
      setInputValue('')
      if (line !== '') vm.send(line)
      return
    }
    // Ctrl+R toggles the last assistant row's reasoning while idle.
    if (!running && input === '' && key.ctrl && lower === 'r' && !key.meta) {
      const lastReasoned = [...state.messages].reverse().find(message =>
        message.role === 'assistant' && message.reasoning !== '' && message.status === 'done')
      if (lastReasoned !== undefined) {
        setExpandedReasoning(prev => (prev === lastReasoned.key ? null : lastReasoned.key))
      }
      return
    }
    if (key.ctrl && lower === 'a') {
      moveCursorHome()
      return
    }
    if (key.ctrl && lower === 'e') {
      moveCursorEnd()
      return
    }
    if (key.leftArrow) {
      moveCursorLeft()
      return
    }
    if (key.rightArrow) {
      moveCursorRight()
      return
    }
    // Non-printable navigation / editing keys.
    if (isBackspaceKey(chunk, key)) {
      deleteBackward()
      return
    }
    if (isForwardDeleteKey(chunk, key)) {
      deleteForward()
      return
    }
    // Prompt history: ↑/↓ walk back through the prompts this process has sent;
    // stepping past the newest restores the draft that was being typed.
    if (key.upArrow || key.downArrow) {
      const recalled = key.upArrow ? vm.historyOlder(input) : vm.historyNewer(input)
      if (recalled !== null) setInputValue(recalled)
      return
    }
    if (key.escape || key.tab) return
    // Anything else printable lands in the buffer, including IME-composed text
    // and shifted symbols. Ctrl/meta chords were handled above.
    if (chunk !== '' && !key.ctrl && !key.meta) insertText(chunk)
  })

  const renderRow = (message: UiMessage): React.JSX.Element => (
    <MessageRow
      key={message.key}
      message={message}
      theme={theme}
      reasoningExpanded={expandedReasoning === message.key}
      chrome={chrome}
    />
  )

  // Ink writes new static items permanently above the live region; re-keying on
  // the session (and on /clear) rebuilds that list instead of repainting it.
  // The Static element is the first child of EVERY return branch below, so React
  // keeps its fiber mounted across board and picker switches. An unmounted Static
  // remounts at index 0 and re-renders the whole transcript as fresh static
  // output: ink appends that to its retained full-static buffer and replays all
  // of it on every taller-than-terminal frame, which floods stdout until the
  // stream's backpressure piles the unsent bytes onto the heap.
  const staticList = (
    <Static key={`${state.sessionId}:${state.transcriptEpoch}`} items={committed}>
      {renderRow}
    </Static>
  )

  const overlays = (
    <>
      {state.error !== null && (
        <Box marginBottom={1}>
          <Text color={theme.error}>{COPY.errorGlyph} {state.error}</Text>
        </Box>
      )}
      <ApprovalModal prompt={pendingApproval} theme={theme} />
      {connectWizard !== null && <ConnectPrompt wizard={connectWizard} theme={theme} />}
      {titleEditor !== null && <TitlePrompt current={titleEditor} theme={theme} />}
      {choicePicker !== null && (
        <ChoiceList
          title={choicePicker.title} items={filteredChoices}
          selected={effectiveChoiceIndex} theme={theme} note={choicePicker.note}
          search={choiceSearch}
        />
      )}
      {commandMenuOpen && <CommandMenu matches={commandMatches} selected={effectiveCommandIndex} theme={theme} />}
    </>
  )

  // The task panel docks above the composer while the checklist has open work;
  // queued prompts announce themselves the same way.
  const todos = state.todos
  const todosVisible = todos !== null
    && todos.length > 0
    && todos.some(todo => todo.status !== 'completed')
    && !todosCollapsed
  const queuedNote = state.queued.length > 0 && (
    <Box marginBottom={1}>
      <Text color={theme.muted} dimColor>
        {COPY.queuedLabel} {state.queued.length} · {collapseFirstLine(state.queued[state.queued.length - 1] ?? '', 48)}
      </Text>
    </Box>
  )

  // Ink erases its own rows between frames, but a frame that reaches the
  // viewport height instead clears the screen, drops the terminal's scrollback,
  // and replays every committed row. A fast answer crosses that line on one
  // chunk and falls back under it on the next, which is the flash output
  // produces while it pours. Keep the live rows inside what the mounted chrome
  // leaves them: the threshold is then never reached, and the clipped head
  // returns when its row settles into `<Static>` (see `live-budget.ts`).
  const chromeRows = (chrome === 'classic'
    ? LIVE_CHROME.classicInput + LIVE_CHROME.statusLine
    : LIVE_CHROME.opencodeComposer)
    + (state.error !== null ? LIVE_CHROME.error : 0)
    + (pendingApproval !== null ? LIVE_CHROME.approval : 0)
    + (pickerOpen ? LIVE_CHROME.sessionPicker : 0)
    + (choicePicker !== null ? LIVE_CHROME.choicePicker : 0)
    + (commandMenuOpen ? LIVE_CHROME.commandMenu : 0)
    + (connectWizard !== null || titleEditor !== null ? LIVE_CHROME.prompt : 0)
    + (todosVisible ? LIVE_CHROME.todoPanel + (todos?.length ?? 0) : 0)
    + (state.queued.length > 0 ? LIVE_CHROME.queued : 0)
  const liveFit = useMemo(
    () => fitLiveMessages(live, liveRowBudget(rows, chromeRows), {
      columns,
      labeled: chrome === 'classic',
      expandedKey: expandedReasoning,
    }),
    [live, rows, chromeRows, columns, chrome, expandedReasoning],
  )
  const liveList = (
    <Box flexDirection="column">
      {liveFit.notice && (
        <Text color={theme.muted} dimColor>
          {`${COPY.liveTailMore}${liveFit.hiddenRows} ${COPY.liveTailRest}`}
        </Text>
      )}
      {liveFit.messages.map(renderRow)}
    </Box>
  )

  const classicInput = (
    <Box marginTop={1}>
      <Text color={theme.brand}>❯ </Text>
      {renderInputWithCursor(input, cursorPos, theme, running, COPY.classicInputPlaceholder)}
    </Box>
  )

  const opencodeComposer = (
    <>
      <Box borderStyle="round" borderColor={theme.brand} marginTop={1} paddingX={1} flexDirection="column">
        <Box>
          <Text color={theme.brand}>{'> '}</Text>
          {renderInputWithCursor(
            input,
            cursorPos,
            theme,
            running,
            connectWizard !== null || titleEditor !== null ? undefined : COPY.composerPlaceholder,
          )}
        </Box>
        <Box marginTop={1} justifyContent="space-between">
          <Text color={theme.muted} dimColor>
            {state.modelLabel} · {COPY.permissionLabel} <Text color={theme.brand}>{state.permissionPreset}</Text>
            <ContextRing state={state} theme={theme} />
          </Text>
          <Text color={running ? theme.warn : theme.ok}>
            {running ? `${spinnerFrame(elapsedMs)} ${COPY.statusRunning} · ${formatElapsed(elapsedMs)}` : COPY.statusIdle}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} justifyContent="flex-end">
        <TokenUsageLine state={state} theme={theme} />
      </Box>
    </>
  )

  // The board replaces the whole chrome: one full-screen monitoring surface
  // over the same view-model state the transcript renders from.
  if (state.boardOpen) {
    return (
      <Box flexDirection="column">
        {staticList}
        <TaskBoard
          state={state}
          theme={theme}
          elapsedMs={elapsedMs}
          cursor={boardCursor}
          panePage={panePage}
          rows={rows}
          columns={columns}
        />
      </Box>
    )
  }

  if (chrome === 'opencode') {
    // /sessions focuses the picker over the code surface.
    if (pickerOpen) {
      return (
        <Box width="100%" height={Math.max(8, rows - 2)} alignItems="center" justifyContent="center">
          {staticList}
          <Box width={Math.min(columnWidth, 78)}>
            <SessionPicker items={filteredSessions} selected={safePickerIndex} search={sessionSearch} theme={theme} />
          </Box>
        </Box>
      )
    }
    // Empty session: a centered welcome page. The content is measured in rows
    // so a terminal resize immediately repositions it.
    if (committed.length === 0 && live.length === 0) {
      const verticalOffset = Math.max(0, Math.floor((rows - 10) / 2))
      return (
        <Box flexDirection="column" width="100%" marginTop={verticalOffset}>
          {staticList}
          <Box width="100%" justifyContent="center">
            <Box width={columnWidth} flexDirection="column">
              <Box justifyContent="center">
                {WORDMARK.map((glyph, index) => (
                  <Text key={glyph} color={WORDMARK_COLORS[index] ?? theme.brand} bold>{glyph}</Text>
                ))}
              </Box>
              <Box justifyContent="center" marginTop={1}>
                <Text color={theme.text}>DeepSeek </Text>
                <Text color={theme.brand} bold>{COPY.welcomeTagline}</Text>
              </Box>
              {overlays}
              {todosVisible && <TaskPanel todos={todos} theme={theme} />}
              {queuedNote}
              {opencodeComposer}
            </Box>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column" width="100%">
        {staticList}
        {liveList}
        {overlays}
        {todosVisible && <TaskPanel todos={todos} theme={theme} />}
        {queuedNote}
        {opencodeComposer}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {staticList}
      {liveList}
      {pickerOpen && <SessionPicker items={filteredSessions} selected={safePickerIndex} search={sessionSearch} theme={theme} />}
      {overlays}
      {todosVisible && <TaskPanel todos={todos} theme={theme} />}
      {queuedNote}
      {classicInput}
      <StatusBar state={state} theme={theme} elapsedMs={elapsedMs} />
    </Box>
  )
}
