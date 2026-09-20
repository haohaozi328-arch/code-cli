# 打包维护说明（PACKAGING）

本仓库是 **打包产物仓库**：只包含可发布内容，不包含 monorepo 源码。
源码位于私有 monorepo（dsh-cli），本仓的产物在每次发布时按其最新代码重新生成。

## 组成与数据流

```
monorepo (D:\workspace\DeepSeek\dsh-cli)
  ├─ pnpm build:lib:host           → packages/bundle/cli-app/lib/（tsdown bundle）
  ├─ pnpm --filter @dsh-external/dsh-cli-app pack → 生成 tgz（workspace:* 已替换为版本号）
  └─ tar 解包 → 本仓 vendor/dsh-cli-app（随仓分发）

github:haohaozi328-arch/code-cli（本仓）
  ├─ bin/code.js        全局命令入口：释放 vendor 前端 → 确保 $DSH_HOME/profiles/code 存在 → spawn dsh --profile code
  ├─ package.json       dependencies: @deepseek-ai/dsh（精确版本）+ ink/react/zod 等前端运行时
  └─ vendor/dsh-cli-app/  内置 TUI 前端包（含全部 fork 本地 UI 修改），bin/code.js 首启时释放为
                          node_modules/@dsh-external/dsh-cli-app
```

安装链路：`npm i -g github:...` → clone 本仓 → npm 从公开 registry 拉
`@deepseek-ai/*` 依赖树。首启时 bin/code.js 把 vendor/dsh-cli-app 复制到
node_modules/@dsh-external/dsh-cli-app；`dsh-base` 等 bundle 插件名与
`@dsh-external/dsh-cli-app` 均由 cordis loader 在 node_modules 中解析，
全局安装后同层可见，无需额外链接。

> 设计说明：有意不使用 bundleDependencies/file: 依赖——实测 npm 11 的
> 全局/git 安装路径对这两者存在空目录占位等兼容性问题（依赖壳有目录无内容）

## 版本对齐契约

- `@deepseek-ai/dsh` 的 pin 版本必须 **与 fork 基线兼容的已发布版本**：
  fork 停留在上游 `0.1.3-alpha.1`（未发布），registry 上与该基线最近的发布是
  `0.1.3-alpha.2`，故 pin 之。cli-app tgz 内 peerDependencies 为
  `^0.1.3-alpha.1`（tuple 0.1.3），满足 `0.1.3-alpha.2`。
- 升级时：先 bump `package.json` 中 `@deepseek-ai/dsh` 的 pin，整体重跑下方
  “重新发布”步骤并在全局安装后 `code --dump-config` 验证组合挂载无 MISSING。

## 重新发布（复版）步骤

在 monorepo 根目录：

```powershell
# 1. 重建 TUI 前端产物
pnpm build:lib:host

# 2. 打新 tgz，并解包进本仓内嵌依赖目录
pnpm --filter @dsh-external/dsh-cli-app pack --pack-destination %TEMP%
tar -xzf %TEMP%\dsh-external-dsh-cli-app-0.0.0.tgz -C <本仓>\node_modules\@dsh-external\dsh-cli-app --strip-components=1

# 3. 更新本仓 package.json 里 @deepseek-ai/dsh 的 pin（如需），提交并推送
```

然后验证（在装有本包的目标机器上）：

```powershell
npm uninstall -g dsh-code-cli
npm install -g github:haohaozi328-arch/code-cli
code --dump-config   # 应列出 # == @deepseek-ai/dsh-base 与 @dsh-external/dsh-cli-app，无报错
code                 # 交互打开 TUI
```

## 已知事项

- `code` 与 VS Code 自带 `code` 命令同名，PATH 顺序决定生效者。
- 依赖树含 node-pty 原生模块，安装时按平台拉取预编译二进制，必要时回退 node-gyp 构建。
- `$DSH_HOME/profiles/code` 由 `bin/code.js` 首启时自动生成；若用户已手工
  建过同名 profile，不会覆盖。
