/**
 * Interactive terminal startup progress bar for DeepSeek Harness (dsh).
 * Automatically renders a clean progress bar on interactive TTY terminals
 * during CLI startup, and cleanly erases itself when the UI is ready.
 * @module @deepseek-ai/dsh/boot-progress
 */

export class BootProgressBar {
  private active = false
  private timer: NodeJS.Timeout | null = null
  private percent = 15
  private message = '正在启动 DeepSeek Harness...'
  private spinnerIdx = 0
  private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  start(initialMessage = '正在初始化启动环境与网络配置...') {
    if (!process.stdout.isTTY || process.env.NODE_ENV === 'test' || process.env.CI) return
    this.active = true
    this.message = initialMessage
    this.render()
    this.timer = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % this.frames.length
      this.render()
    }, 80)
  }

  update(percent: number, message?: string) {
    if (!this.active) return
    this.percent = Math.min(100, Math.max(0, percent))
    if (message) this.message = message
    this.render()
  }

  private render() {
    if (!this.active || !process.stdout.isTTY) return
    const frame = this.frames[this.spinnerIdx]
    const barWidth = 24
    const filled = Math.round((this.percent / 100) * barWidth)
    const empty = barWidth - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const line = `\r\x1b[36m${frame}\x1b[0m \x1b[32m[${bar}]\x1b[0m \x1b[33m${this.percent.toString().padStart(3)}%\x1b[0m \x1b[90m${this.message}\x1b[0m\x1b[K`
    process.stdout.write(line)
  }

  finish() {
    if (!this.active) return
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.active = false
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[2K')
    }
  }
}

export const bootProgress = new BootProgressBar()
