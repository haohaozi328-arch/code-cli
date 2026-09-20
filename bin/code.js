#!/usr/bin/env node
// code —— deepseek dsh 终端 AI 编程助手的全局启动器。
// 等价于开发模式的 `pnpm dsh --profile code`：拉起 code profile 的 Ink TUI。
//
// 工作原理：
//   1) 首启（或内置前端版本变化）时，把包内 vendor/dsh-cli-app 释放为
//      node_modules/@dsh-external/dsh-cli-app（cordis 加载器按包名解析插件，
//      需要一个真实存在的包目录）
//   2) 确保 $DSH_HOME/profiles/code 的 profile manifest 存在
//   3) 用随包安装的 @deepseek-ai/dsh 启动器执行 `dsh --profile code`，
//      剩余命令行参数原样透传（如 --plugin、--dump-config 等）
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)))

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

// 释放内置 TUI 前端：npm 对 git 包内的 vendor 目录不做特殊处理，
// 这里在首启时把它放到包自身 node_modules 下的约定包名位置。
function ensureCliApp() {
  const vendor = join(pkgRoot, 'vendor', 'dsh-cli-app')
  const target = join(pkgRoot, 'node_modules', '@dsh-external', 'dsh-cli-app')
  const current = join(target, 'package.json')
  if (existsSync(current)) {
    try {
      const a = JSON.parse(readFileSync(current, 'utf8')).version
      const b = JSON.parse(readFileSync(join(vendor, 'package.json'), 'utf8')).version
      if (a === b) return
    } catch { /* fallthrough: force refresh */ }
  }
  cpSync(vendor, target, { recursive: true })
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
  ensureCliApp()
  ensureProfile()
} catch (err) {
  console.error(`[code] 初始化失败：${err?.message ?? err}`)
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
