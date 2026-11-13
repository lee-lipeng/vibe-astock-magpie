#!/usr/bin/env node
/**
 * vibe-astock-magpie · 命令行入口
 *
 *   install    把 magpie 网关接进一个 Vibe AStock 仓库（模板 + 可选的下拉补丁）
 *   uninstall  摘掉模板与补丁，回到原样
 *   verify     用 Vibe AStock 自己的兼容矩阵实测这条线，--write 把结论写回模板
 *   doctor     体检：仓库、数据根、模板、网关、模型、补丁现状
 *
 * 约定：所有命令退出码 0 = 正常完成（含「网关没启动」这类可降级情况）；
 * 2 = 前置条件不满足（找不到仓库、缺模板、参数非法）；1 = 未预期异常。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_BASE,
  dataRootOf,
  findRepo,
  installTemplate,
  normalizeBaseURL,
  pickModel,
  probeModels,
  templatePath,
  uninstallTemplate,
} from "../lib/install.mjs";
import { applyPatches, patchState, revertPatches } from "../lib/patch.mjs";

const MAX_MODELS_PRINTED = 12;

const HELP = `vibe-astock-magpie ${readVersion()}

用法: vibe-astock-magpie <命令> [选项]

命令:
  install     接进 Vibe AStock：写 providers 模板，可选给「接入 AI」下拉补一条 Magpie 网关
  uninstall   摘掉模板与下拉补丁
  verify      实测这条线（复用 Vibe AStock 的兼容矩阵），--write 把结论写回模板
  doctor      体检：仓库 / 数据根 / 模板 / 网关 / 模型 / 补丁

通用选项:
  --repo DIR        Vibe AStock 仓库根（默认从当前目录往上找，或 $VIBE_ASTOCK_HOME）
  --data-root DIR   数据根（默认 $VRA_DATA_ROOT 或 <仓库>/.local）
  --dry-run         只打印要做的事

install 选项:
  --base-url URL    网关地址，默认 ${DEFAULT_BASE}
  --model ID        模型名（provider/model 或 auto/xxx）；不给就现场探测
  --key KEY         探测用的本地 key，默认 magpie（只用于探测，不写进模板）
  --no-ui           不打下拉补丁（只装模板；页面里用「其它 OpenAI 兼容端点」手填）

verify 选项:
  --tests 1,2,7,8   只跑这几项（1-10）
  --model ID        覆盖模板里的模型名
  --key KEY         本地 key，默认 magpie
  --timeout-min N   单次请求超时（分钟）
  --write           把建议的 direct 段写回 <数据根>/providers/magpie.json`;

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** `--key value` / `--key=value` / `--flag`；没有值的长选项记为 true */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** 取字符串型选项：`--repo` 后面忘了给值时是 true，这里统一当没给 */
const str = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

const say = (line = "") => console.log(line);
const warn = (line) => console.warn(line);

function fail(message, code = 2) {
  console.error(`[x] ${message}`);
  process.exit(code);
}

function resolveRepo(args) {
  const explicit = str(args.repo) ?? process.env.VIBE_ASTOCK_HOME?.trim();
  const repo = explicit || findRepo(process.cwd());
  if (!repo) fail("找不到 Vibe AStock 仓库：用 --repo D:\\GitHub\\vibe-astock 指一下，或设 VIBE_ASTOCK_HOME");
  if (!fs.existsSync(path.join(repo, "orchestrator", "src", "providers.ts"))) {
    fail(`${repo} 看起来不是 Vibe AStock 仓库（缺 orchestrator/src/providers.ts）`);
  }
  return path.resolve(repo);
}

// ── install ─────────────────────────────────────────────────────────────
async function cmdInstall(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const dryRun = Boolean(args["dry-run"]);
  const key = str(args.key) ?? "magpie";

  let baseURL;
  try {
    baseURL = normalizeBaseURL(str(args["base-url"]) ?? DEFAULT_BASE);
  } catch (e) {
    fail(e.message);
  }

  say(`仓库    ${repo}`);
  say(`数据根  ${dataRoot}`);
  say(`网关    ${baseURL}`);

  let model = str(args.model) ?? null;
  if (!model) {
    const probe = await probeModels(baseURL, key);
    if (probe.ok) {
      model = pickModel(probe.ids);
      say(`探测    ${probe.ids.length} 个模型，默认选 ${model}`);
      for (const id of probe.ids.slice(0, MAX_MODELS_PRINTED)) say(`          - ${id}`);
      if (probe.ids.length > MAX_MODELS_PRINTED) say(`          … 另有 ${probe.ids.length - MAX_MODELS_PRINTED} 个，见 /v1/models`);
    } else {
      warn(`探测    ${probe.url} 失败：${probe.why}`);
      if (probe.hint) warn(`        ${probe.hint}`);
      warn("        模板照样装上，默认模型留空，稍后在页面里填。");
    }
  }

  const result = installTemplate({ dataRoot, baseURL, model, dryRun });
  const actionText = { created: "新建", updated: "更新", unchanged: "无变化" }[result.action];
  say(`模板    ${actionText} → ${result.path}${dryRun ? "（dry-run，未写入）" : ""}`);

  if (args["no-ui"]) {
    say("下拉    已跳过（--no-ui）：页面里选「其它 OpenAI 兼容端点」手填地址即可");
  } else {
    const patched = applyPatches({ repoRoot: repo, baseURL, dryRun });
    for (const id of patched.applied) say(`下拉    ${dryRun ? "将打补丁" : "补丁"} ${id}`);
    for (const skip of patched.skipped) {
      if (skip.why === "已应用") continue;
      warn(`下拉    跳过 ${skip.id}：${skip.why}`);
    }
    if (!patched.applied.length && !patched.skipped.some((s) => s.why === "已应用")) {
      warn("下拉    这一版页面结构不同，没打上补丁；用「其它 OpenAI 兼容端点」手填即可");
    }
  }

  say("");
  say("下一步:");
  say(`  1) 实测   vibe-astock-magpie verify --repo "${repo}" --write`);
  say(`  2) 重启   ${path.join(repo, "start-vibe-astock.cmd")}（macOS / Linux: scripts/start）`);
  say(
    `  3) 页面   接入 AI → 模型选「Magpie 网关」→ Model 填 ${
      result.template.default_model ?? "<GET /v1/models 里的 id>"
    } → API Key 填 ${key}`,
  );
}

// ── uninstall ───────────────────────────────────────────────────────────
function cmdUninstall(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const dryRun = Boolean(args["dry-run"]);

  const template = uninstallTemplate({ dataRoot, dryRun });
  say(template.removed ? `模板    已删除 ${template.path}` : `模板    没有 ${template.path}，跳过`);

  const files = revertPatches({ repoRoot: repo, dryRun });
  if (files.length) for (const file of files) say(`下拉    已摘除 ${path.relative(repo, file)}`);
  else say("下拉    没有补丁需要摘除");

  say("");
  say("卸载完成。重启（或刷新页面）后生效。");
}

// ── doctor ──────────────────────────────────────────────────────────────
async function cmdDoctor(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const tplPath = templatePath(dataRoot);
  let problems = 0;
  const ok = (line) => say(`OK    ${line}`);
  const bad = (line) => {
    problems++;
    say(`FAIL  ${line}`);
  };
  const skip = (line) => say(`SKIP  ${line}`);

  say(`仓库    ${repo}`);
  say(`数据根  ${dataRoot}`);
  say("");
  ok("Vibe AStock 仓库：orchestrator/src/providers.ts 在");

  let template = null;
  if (!fs.existsSync(tplPath)) {
    bad(`模板不存在：${tplPath}（先跑 install）`);
  } else {
    try {
      template = JSON.parse(fs.readFileSync(tplPath, "utf8"));
      ok(`模板可解析：id=${template.id} env_key=${template.env_key} base_url=${template.base_url}`);
      if (template.id !== "magpie") bad(`模板 id 应为 magpie，实际 ${template.id}`);
    } catch (e) {
      bad(`模板不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const baseURL = template?.base_url ?? DEFAULT_BASE;
  const probe = await probeModels(baseURL, str(args.key) ?? "magpie");
  if (!probe.ok) {
    bad(`网关 ${probe.url} 不可达：${probe.why}${probe.hint ? `（${probe.hint}）` : ""}`);
  } else {
    ok(`网关 ${probe.url} 可达，${probe.ids.length} 个模型`);
    const model = template?.default_model;
    if (!model) skip("模板没有默认模型：在页面里填一个，或 install 时给 --model");
    else if (probe.ids.includes(model)) ok(`默认模型 ${model} 在清单里`);
    else bad(`默认模型 ${model} 不在网关清单里（重跑 install --model ... 或改模板）`);
  }

  const state = patchState({ repoRoot: repo });
  if (state.patched) ok(`「接入 AI」下拉补丁已打：${state.files.map((f) => path.relative(repo, f)).join(", ")}`);
  else skip("没有下拉补丁：页面里用「其它 OpenAI 兼容端点」手填地址");

  if (template?.direct) {
    ok(`实测记录：supported=${template.direct.supported} structured_output=${template.direct.structured_output}（${template.direct.verified_at}）`);
  } else {
    skip("还没实测（跑 verify --write 会写进 direct 段）");
  }

  say("");
  say(problems ? `有 ${problems} 项要处理` : "全部通过");
  process.exit(problems ? 2 : 0);
}

// ── verify ──────────────────────────────────────────────────────────────
async function cmdVerify(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const tplPath = templatePath(dataRoot);
  if (!fs.existsSync(tplPath)) fail(`找不到 ${tplPath}：先跑 install`);

  const matrixEntry = path.join(repo, "orchestrator", "src", "finance", "provider_matrix.ts");
  if (!fs.existsSync(matrixEntry)) fail(`这一版 Vibe AStock 没有 ${matrixEntry}，无法实测`);
  if (!fs.existsSync(path.join(repo, "orchestrator", "node_modules"))) {
    fail(`缺 ${path.join(repo, "orchestrator", "node_modules")}：先在仓库里跑一次安装（scripts\\setup-windows.cmd 或 scripts/setup）`);
  }

  const template = JSON.parse(fs.readFileSync(tplPath, "utf8"));
  const model = str(args.model) ?? template.direct?.default_model ?? template.default_model ?? "";
  if (!model) fail("模板里没有默认模型：install 时探测，或用 --model 指定");
  const key = str(args.key) ?? "magpie";
  say(`[verify] ${template.name ?? "magpie"} · ${template.base_url} · 模型 ${model}`);

  const cliArgs = [matrixEntry, "--provider", "magpie", "--model", model];
  const tests = str(args.tests);
  const timeoutMin = str(args["timeout-min"]);
  if (tests) cliArgs.push("--tests", tests);
  if (timeoutMin) cliArgs.push("--timeout-min", timeoutMin);

  const started = Date.now();
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, cliArgs, {
      cwd: repo,
      stdio: "inherit",
      env: { ...process.env, MAGPIE_API_KEY: key },
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (e) => {
      console.error(`[x] 起不来：${e.message}`);
      resolve(1);
    });
  });

  const resultDir = findLatestResult(dataRoot);
  if (!resultDir) fail(`没找到结果文件（矩阵退出码 ${exitCode}，多半在发请求前就退出了，看上面的报错）`, 1);

  const results = JSON.parse(fs.readFileSync(path.join(resultDir, "results.json"), "utf8"));
  const VERDICT = { pass: "通过", partial: "部分", fail: "失败", error: "报错" };
  say("");
  say(`结果 ${path.relative(repo, resultDir)}（${Math.round((Date.now() - started) / 1000)} 秒）`);
  say(`合计 ${Object.entries(results.tally ?? {}).map(([k, v]) => `${VERDICT[k] ?? k} ${v}`).join(" · ") || "无"}`);
  for (const item of results.cases ?? []) {
    const flag = item.verdict === "pass" ? "✓" : item.verdict === "partial" ? "~" : "✗";
    say(`${flag} ${String(item.no).padStart(2)}. ${item.name} — ${VERDICT[item.verdict] ?? item.verdict}：${String(item.detail).slice(0, 160)}`);
  }
  say("");
  say(`direct 段建议：${JSON.stringify(results.suggestion)}`);

  if (args.write && results.suggestion) {
    const s = results.suggestion;
    const next = {
      ...template,
      direct: {
        supported: s.supported,
        base_url: template.base_url,
        default_model: model,
        structured_output: s.structured_output,
        verified_at: s.verified_at,
        notes: s.notes,
      },
    };
    fs.writeFileSync(tplPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    say(`[verify] 已写回 ${tplPath}（包里的 provider.json 未改动）`);
  }
}

/** 最近一次矩阵结果目录（没有就返回 null） */
function findLatestResult(dataRoot) {
  const root = path.join(dataRoot, "provider-matrix", "magpie");
  if (!fs.existsSync(root)) return null;
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "results.json")))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

// ── 入口 ────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (!command || command === "help" || args.help || args.h) {
  say(HELP);
  process.exit(0);
}

try {
  if (command === "install") await cmdInstall(args);
  else if (command === "uninstall") cmdUninstall(args);
  else if (command === "verify") await cmdVerify(args);
  else if (command === "doctor") await cmdDoctor(args);
  else fail(`未知命令 ${command}\n\n${HELP}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e), 1);
}
