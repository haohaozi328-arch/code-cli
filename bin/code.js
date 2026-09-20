#!/usr/bin/env node
// code —— deepseek dsh 终端 AI 编程助手的全局启动器。
// 等价于开发模式的 `pnpm dsh --profile code`：拉起 code profile 的 Ink TUI。
//
// 工作原理：
//   1) 首启时创建 $DSH_HOME/profiles/code 的 profile manifest
//      （bundles: @deepseek-ai/dsh-base + @dsh-external/dsh-cli-app）
//   2) 用随包安装的 @deepseek-ai/dsh 启动器执行 `dsh --profile code`，
//      剩余命令行参数原样透传（如 --plugin、--dump-config 等）
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function dshHome() {
  return process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? homedir(), '.dsh')
}

const PROFILE_MANIFEST = {
  name: 'dsh-profile-code',
  private: true,
  dependencies: {},
  dsh: {
    profile: {
      bundles: ['@deepseek-ai/dsh-base', '@dsh-external/dsh-cli-app'],
      patchReload: 'startup',
    },
  },
}

function ensureProfile() {
  const dir = join(dshHome(), 'profiles', 'code')
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(manifest, JSON.stringify(PROFILE_MANIFEST, null, 2) + '\n', 'utf8')
  }
}

try {
  ensureProfile()
} catch (err) {
  console.error(`[code] 初始化 profile 失败：${err?.message ?? err}`)
  process.exit(1)
}

let bin
try {
  bin = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')
} catch {
  console.error('[code] 未找到 @deepseek-ai/dsh 启动器，请重新安装本包。')
  process.exit(1)
}

const child = spawn(process.execPath, [bin, '--profile', 'code', ...process.argv.slice(2)], {
  stdio: 'inherit',
})
child.on('error', (err) => {
  console.error(`[code] 启动失败：${err.message}`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
