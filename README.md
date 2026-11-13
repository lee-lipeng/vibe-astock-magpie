# vibe-astock-magpie

把 [magpie](https://github.com/yetone/magpie) 本地网关接进 [Vibe AStock](https://github.com/simonlin1212/vibe-astock)（A 股短线复盘与跟踪工作台）。

装完之后，Vibe AStock 的「接入 AI」下拉里直接列出网关的**每一个模型** —— 挑一个，点「测试并保存」，结束。
不用抄 URL、不用记模型名、不用填 key。

![接入 AI：下拉里直接选 Magpie 模型](https://raw.githubusercontent.com/lee-lipeng/vibe-astock-magpie/main/docs/settings-dropdown.png)

<details>
<summary>magpie 侧还有一个说明页（装进 Plugins 页）</summary>

![magpie 里的 Vibe AStock 页面](https://raw.githubusercontent.com/lee-lipeng/vibe-astock-magpie/main/docs/magpie-page.png)

</details>

> Vibe AStock 从 v2 起只认 **OpenAI 兼容的 Chat Completions 端点**（`POST {base_url}/chat/completions`），
> magpie 正好说这套协议（默认 `http://127.0.0.1:3425/v1`），所以两者能直接对接，产品代码一行不用改。

---

## 环境要求

| 项 | 要求 |
|---|---|
| Node.js | ≥ 22.18（用到原生 `fetch`、`node --test`；Vibe AStock 本身也要这个版本） |
| Vibe AStock | v2.1.x 源码安装（已实测 v2.1.6）；免安装包不带源码，用不了下拉补丁 |
| magpie | 已启动，默认监听 `127.0.0.1:3425`（`MAGPIE_ADDR` 可改） |
| 操作系统 | Windows / macOS / Linux 都行；脚本只用 Node 标准库，无第三方依赖 |

## 三条路，按需选

| 方式 | 要装东西吗 | 界面里能看到 | 适合 |
|---|---|---|---|
| **A. 装本插件**（推荐） | 要（Node 22.18+） | 「接入 AI」下拉里直接列出网关的每个模型，选一个就行 | 想一次配好、带实测记录 |
| **B. 只放模板** | 不要，手写一个 JSON | 下拉里没有，命令行 / 后台默认可用 | 只在命令行跑研究 |
| **C. 什么都不装** | 不要 | 选「其它 OpenAI 兼容端点」手填三项 | 试一次 |

### A. 装插件（推荐）

```sh
# 在 Vibe AStock 仓库目录里
npx vibe-astock-magpie install

# 或者在别处执行，显式指仓库
npx vibe-astock-magpie install --repo /path/to/vibe-astock

# 只装模板、不动前端
npx vibe-astock-magpie install --repo /path/to/vibe-astock --no-ui
```

> 还没发布到 npm 时，用源码跑：`git clone` 本仓库后 `node bin/cli.mjs install --repo <Vibe AStock 路径>`。

安装器做两件事：

1. 探测 `http://127.0.0.1:3425/v1/models`，把默认模型（优先 `auto/*` 路由组）写进
   `<仓库>/.local/providers/magpie.json`。网关没启动也能装，只是默认模型留空。
2. 把网关当前的**每个模型**渲染成下拉条目，整块插进 `ai-models.ts` 的标记之间；
   另加 5 行小补丁（类型、Base URL、来源名、key 预填），每行带 `// magpie-plugin` 标记。

然后重启产品（`scripts\start.cmd` 或 `scripts/start`），页面里只剩一步：

**接入 AI → API 接入 → 下拉里挑一个 `Magpie · …` → 点「测试并保存」。**

Base URL（`http://127.0.0.1:3425/v1`）、Model（该模型 id）、API Key（`magpie`，magpie 的本地默认 key）
都会跟着带出来。

> 在 magpie 里加了新的 provider / 路由组之后，跑一次 `vibe-astock-magpie models` 再刷新页面
> —— 下拉是编译期常量，运行时不发请求（原因见[下文](#为什么不运行时拉取)）。`doctor` 会告诉你有没有过期。

### B. 只放模板（不要 Node 工具链）

把 [`provider.json`](provider.json) 复制成 `<仓库>/.local/providers/magpie.json`，
把 `default_model` 改成 `GET /v1/models` 里的一个 id。之后命令行研究可以：

```powershell
# .local/config.json
{ "provider": { "profile": "magpie" }, "defaults": { "model": "auto/glm-5.3-flash" } }
# 环境变量里放 key（模板只存变量名，不存 key）
$env:MAGPIE_API_KEY = "magpie"
```

### C. 什么都不装

页面「接入 AI」→ *其它 OpenAI 兼容端点* → Base URL `http://127.0.0.1:3425/v1`、Model `auto/glm-5.3-flash`、Key `magpie`。
缺点：产品不知道这家实测过什么，结构化输出一律走提示词，运行记录里也只写「自定义端点」。

---

## 命令

```
vibe-astock-magpie install     [--repo DIR] [--base-url URL] [--model ID] [--key KEY] [--no-ui] [--force] [--dry-run]
vibe-astock-magpie models      [--repo DIR] [--base-url URL] [--key KEY] [--dry-run]
vibe-astock-magpie uninstall   [--repo DIR] [--dry-run]
vibe-astock-magpie verify      [--repo DIR] [--tests 1,2,7,8] [--model ID] [--write]
vibe-astock-magpie doctor      [--repo DIR]
```

- `install`：写模板 + 刷新下拉清单 + 打 5 行补丁。幂等，重复跑只补没打的。
- `models`：只刷新下拉里的模型清单。
- `verify`：调 Vibe AStock 自己的 `orchestrator/src/finance/provider_matrix.ts` 真跑 10 个小回合
  （文本、单/连续/并行工具调用、工具失败自修复、长输出、工具后分句收尾、服务端 JSON Schema、多轮上下文、图片输入），
  结果落在 `.local/provider-matrix/magpie/<时间>/`；`--write` 才把建议的 `direct` 段写回模板。
- `doctor`：仓库、数据根、模板能否解析、网关可达性、默认模型在不在清单里、下拉条数与网关是否一致、补丁现状、有没有实测记录。
- `uninstall`：删模板 + 摘掉补丁（含整块模型清单），仓库回到原样。

退出码：`0` 正常（含「网关没启动」这类可降级情况）、`2` 前置条件不满足、`1` 未预期异常。

## 实测结论

2026-11-13，模型 `auto/glm-5.3-flash`，Vibe AStock v2.1.6：

| # | 项目 | 结果 |
|---|---|---|
| 1 | 单次文本 | ✅ |
| 2 | 单工具调用 | ✅ |
| 3 | 连续三轮工具调用 | ✅ |
| 4 | 并行工具调用 | ✅ |
| 5 | 工具失败自修复 | ✅ |
| 6 | 长输出（1–200 编号齐全） | ✅ |
| 7 | 工具后分轮收尾（不带工具的 JSON 轮） | ✅ |
| 8 | 服务端 JSON Schema 约束 | ❌ 回复不是 JSON → 结构化输出走**提示词** |
| 9 | 多轮上下文延续 | ✅ |
| 10 | 图片输入 | ⏱ 超时（180 s）→ 资料导入里的图片 / 截图用不了，文字资料不受影响 |

所以模板写的是 `direct.structured_output = "prompt"`、`supported = true`：研究真正依赖的能力（工具循环、多轮、长输出）都在，
产品自己的校验照旧兜底 —— 损失的是命中率，不是正确性。

换别的模型（`codex/*`、`kimi-code-cn/*`、`google/models/*` …）结论可能不同，重跑一次 `verify --write` 即可。

## 工作原理

Vibe AStock 后端已经支持**数据根里的任意 provider 模板**（`<数据根>/providers/<id>.json`，优先级高于产品自带模板），
但「接入 AI」的模型下拉是编译期常量，没有动态来源。所以：

| 改动 | 位置 | 形态 |
|---|---|---|
| provider 模板 | `<数据根>/providers/magpie.json` | 产品已有的扩展点，零改代码 |
| 模型清单 | `desktop/src/.../lib/ai-models.ts` | 一对标记之间的整块，刷新时整块替换、卸载时整块删除 |
| 类型、Base URL、预设名、来源名、key 预填（5 行） | `ai-models.ts`、`aiConnection.ts`、`Settings.tsx` | 各一行，带 `// magpie-plugin` 标记 |

所有补丁都幂等、可逆；锚点找不到（上游改了结构）就跳过并如实上报，不会猜位置硬改。

### 为什么不运行时拉取

magpie 的网关不带 CORS 头、`OPTIONS` 直接 404，页面里 `fetch('/v1/models')` 必被浏览器拦下。
要绕开就得再改 Vite 代理或后端路由 —— 为了省一条 `models` 命令去动两个运行时，不划算。

上游如果以后让下拉读后端模板清单，这些补丁就可以退休（`--no-ui` 现在就能不用它们）。

## 安全与隐私

- 插件**不收集、不上报**任何数据，不联网（除了向本机 `127.0.0.1:3425` 读模型清单）。
- 模板里只存**环境变量名**（`MAGPIE_API_KEY`），不存 key；key 默认值 `magpie` 只是 magpie 的本地字面量，
  在页面里预填到浏览器 localStorage，和手动输入走同一条产品路径。
- 上游厂商的 API key / 订阅登录始终留在 magpie 里，Vibe AStock 只跟网关说话。
- 改的只有上面表格里那几处，`uninstall` 之后 `git status` 干净（三个文件逐字节还原，测试覆盖）。

## 已知限制

- **下拉不会自动跟着 magpie 变**：加模型后要跑 `models`（见上）。
- **图片输入不支持**：`auto/glm-5.3-flash` 这条线超时，所以「从截图或表格识别」用不了。
- **服务端 JSON Schema 不生效**：结构化输出走提示词，靠产品自己的校验兜底。
- **免安装包用不了**：`desktop/dist` 是打包好的页面，补丁改的是源码；要用就重新 `npm run build`。
- **远程 magpie 需要 https**：Vibe AStock 只放行 `https` 与 `localhost / 127.0.0.1 / [::1]`。

## 目录

```
provider.json          Vibe AStock provider 模板（通用版，default_model 留空）
bin/cli.mjs            命令入口：install / models / uninstall / verify / doctor
lib/install.mjs        仓库定位、数据根、模板读写、网关探测
lib/models.mjs         网关清单 → 下拉条目（上下文格式化、兜底项）
lib/patch.mjs          「接入 AI」补丁：模型清单块 + 5 行小补丁
test/patch.test.mjs    纯函数测试（16 项）
magpie-page/           magpie page 插件（装进 magpie 的 Plugins 页）
docs/                  README 用的截图
PUBLISH.md             发布到 npm / GitHub / magpie 插件市场的步骤
```

## 开发

```sh
npm test                          # 16 项纯函数测试，不需要网关
node bin/cli.mjs doctor --repo /path/to/vibe-astock
node bin/cli.mjs install --repo /path/to/vibe-astock --dry-run
```

改完补丁后建议在临时仓库上验一遍往返（`install` → `uninstall` → 与 `git show HEAD:` 逐字节比对），
`test/` 里已经覆盖了文本层面的幂等与还原。

## 常见问题

**端口不是 3425？** magpie 用 `MAGPIE_ADDR` 改监听地址，安装时给 `--base-url` 即可。

**magpie 装在另一台机器？** 给它一个 https 域名（Tailscale Serve、Caddy 反代），别直接填 `http://192.168.x.x:3425`。

**key 填什么？** magpie 自己的本地 key，默认字面量就是 `magpie`。上游厂商的 key 在 magpie 里配。

**在 magpie 里加了模型，下拉里没有？** 跑一次 `vibe-astock-magpie models`，再 Ctrl+F5。

**`git pull` 之后下拉里没了？** 上游改动会覆盖被补丁的文件，重跑一次 `install` 即可（幂等）。

**卸载干净吗？** 会删模板、摘掉所有标记行与清单块。`uninstall` 之后 `git status` 只应剩你自己原本的改动。

**和 Vibe Research 冲突吗？** 不冲突。两者共用 `VRA_` 前缀的环境变量，但本插件只碰 Vibe AStock 仓库里的三个前端文件与它的数据根。

## 许可

MIT。与 [Vibe AStock](https://github.com/simonlin1212/vibe-astock)（Apache-2.0）和
[magpie](https://github.com/yetone/magpie)（MIT）都无隶属关系，是社区插件。
