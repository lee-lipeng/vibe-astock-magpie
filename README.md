# vibe-astock-magpie

把 [magpie](https://github.com/yetone/magpie) 本地网关接进 [Vibe AStock](https://github.com/simonlin1212/vibe-astock)（A 股短线复盘与跟踪工作台），
并给 magpie 的 Plugins 页带一个说明页。

- **Vibe AStock 侧**：写一份 `providers` 模板到数据根 + 可选给「接入 AI」的模型下拉补一条 *Magpie 网关*；带实测（复用产品自己的兼容矩阵）和体检。
- **magpie 侧**：`magpie-page/` 是一个 magpie page 插件，装好后在 magpie 窗口里告诉用户该填什么，并读一次网关的模型清单。

> Vibe AStock 从 v2 起只认 **OpenAI 兼容的 Chat Completions 端点**（`POST {base_url}/chat/completions`）。
> magpie 正好说这套协议（`http://127.0.0.1:3425/v1`），所以两者能直接对接，不需要改产品代码。

---

## 三条路，按需选

| 方式 | 要装东西吗 | 界面里能看到 | 适合 |
|---|---|---|---|
| **A. 装本插件**（推荐） | 要（Node 22.18+） | 「接入 AI」下拉里有 *Magpie 网关* | 想一次配好、带实测记录 |
| **B. 只放模板** | 不要，手写一个 JSON | 下拉里没有，命令行/后台默认可用 | 只在命令行跑研究 |
| **C. 什么都不装** | 不要 | 选「其它 OpenAI 兼容端点」手填三项 | 试一次 |

### A. 装插件

```sh
# 在 Vibe AStock 仓库目录里
npx vibe-astock-magpie install

# 或者指定仓库位置（在别的目录执行时）
npx vibe-astock-magpie install --repo D:\GitHub\vibe-astock

# 只装模板、不打下拉补丁
npx vibe-astock-magpie install --repo D:\GitHub\vibe-astock --no-ui
```

安装器会：

1. 探测 `http://127.0.0.1:3425/v1/models`，把可用的模型名（优先 `auto/*` 路由组）写进
   `<仓库>/.local/providers/magpie.json`；网关没启动也能装，只是默认模型留空。
2. 给 `desktop/src/verticals/finance/lib/ai-models.ts` 和 `aiConnection.ts` 各加几行
   （每行带 `// magpie-plugin` 标记），让下拉里出现 *Magpie 网关*。

然后重启产品、在页面里填：

| 字段 | 值 |
|---|---|
| 模型 | **Magpie 网关** |
| Base URL | `http://127.0.0.1:3425/v1`（已自动填） |
| Model | `auto/glm-5.3-flash`（安装时探测到的，可换成任意 `provider/model`） |
| API Key | `magpie`（magpie 自己的本地 key，不是上游厂商的 key） |

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
vibe-astock-magpie uninstall   [--repo DIR]
vibe-astock-magpie verify      [--repo DIR] [--tests 1,2,7,8] [--model ID] [--write]
vibe-astock-magpie doctor      [--repo DIR]
```

- `verify` 直接调 Vibe AStock 自己的 `orchestrator/src/finance/provider_matrix.ts`，真跑 10 个小回合
  （文本、单/连续/并行工具调用、工具失败自修复、长输出、工具后分句收尾、服务端 JSON Schema、多轮上下文、图片输入），
  结论落在 `.local/provider-matrix/magpie/<时间>/`，`--write` 才把建议的 `direct` 段写回模板。
- `doctor` 检查：仓库、数据根、模板能否解析、网关可达性、默认模型在不在清单里、补丁现状、有没有实测记录。
- `uninstall` 删模板 + 逐行摘掉补丁，仓库回到原样（`git status` 干净）。

## 实测结论（2026-11-13，模型 `auto/glm-5.3-flash`）

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
| 10 | 图片输入 | ⏱ 超时（180 s）→ 资料导入里的图片/截图用不了，文字资料不受影响 |

所以模板写的是 `direct.structured_output = "prompt"`、`supported = true`：核心能力（工具循环、多轮、长输出）都在，
产品自己的校验照旧兜底；损失的是命中率，不是正确性。

换成别的模型（`codex/*`、`kimi-code-cn/*`、`google/models/*` …）结论可能不同，重跑一次 `verify --write` 即可。

## 为什么是「补丁」而不是「插件 API」

Vibe AStock 后端已经支持**数据根里的任意 provider 模板**（`<数据根>/providers/<id>.json`，优先级高于产品自带模板），
但「接入 AI」的模型下拉是编译期常量，没有动态来源。所以：

- 模板 → 走产品**已有的**扩展点，零改代码；
- 下拉里那一行 → 只能改前端静态清单，5 行，带标记、可逆、锚点缺失时自动跳过。

上游如果以后让下拉读后端模板清单，这个补丁就可以退休（`--no-ui` 现在就能不用它）。

## 目录

```
provider.json          Vibe AStock provider 模板（通用版，default_model 留空）
bin/cli.mjs            命令入口：install / uninstall / verify / doctor
lib/install.mjs        仓库定位、数据根、模板读写、网关探测
lib/patch.mjs          「接入 AI」下拉补丁（幂等、可逆、锚点缺失安全）
test/patch.test.mjs    纯函数测试（npm test）
magpie-page/           magpie page 插件：装进 magpie 的 Plugins 页
PUBLISH.md             发布到 npm / GitHub / magpie 插件市场的步骤
```

## 常见问题

**端口不是 3425？** magpie 用 `MAGPIE_ADDR` 改监听地址，安装时给 `--base-url` 即可。

**magpie 装在另一台机器？** Vibe AStock 的地址校验只放行 `https` 和 `localhost / 127.0.0.1 / [::1]`。
给 magpie 一个 https 域名（Tailscale Serve、Caddy 反代），别直接填 `http://192.168.x.x:3425`。

**key 填什么？** magpie 自己的本地 key，默认字面量就是 `magpie`。上游厂商的 key 在 magpie 里配。

**`git pull` 之后下拉里没了？** 上游改动会覆盖被补丁的文件，重跑一次 `install` 即可（幂等）。

**会改我仓库里的东西吗？** 只有两件事：`<数据根>/providers/magpie.json`（数据根本来就被 `.gitignore`），
以及前端那两个 `.ts` 文件里的几行。`uninstall` 全部撤回。

## 许可

MIT。与 Vibe AStock（Apache-2.0）和 magpie（MIT）都无隶属关系，是社区插件。
