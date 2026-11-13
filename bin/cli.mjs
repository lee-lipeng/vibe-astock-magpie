#!/usr/bin/env node
/**
 * vibe-astock-magpie · 命令行入口
 *
 *   install    把 magpie 网关接进一个 Vibe AStock 仓库（模板 + 可选的下拉补丁）
 *   uninstall  摘掉模板与补丁，回到原样
 *   verify     用 Vibe AStock 自己的兼容矩阵实测这条线，--write 把结论写回模板
 *   doctor     体检：仓库、数据根、模板、网关、模型、补丁现状
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_BASE,
  dataRootOf,
  findRepo,
  installTemplate,
  pickModel,
  probeModels,
  readTemplate,
  templatePath,
  uninstallTemplate,
} from "../lib/install.mjs";
import { applyPatches, patchState, revertPatches } from "../lib/patch.mjs";

const HELP = `vibe-astock-magpie ${JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version}

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
  --force           覆盖已存在的模板

verify 选项:
  --tests 1,2,7,8   只跑这几项
  --model ID        覆盖模板里的模型名
  --key KEY         本地 key，默认 magpie
  --timeout-min N   单次请求超时（分钟）
  --write           把建议的 direct 段写回 <数据根>/providers/magpie.json`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const eq = a.indexOf("=");
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i++; } else { out[key] = true; }
  }
  return out;
}

const say = (s = "") => console.log(s);
const warn = (s) => console.warn(s);

function resolveRepo(args) {
  const repo = args.repo || process.env.VIBE_ASTOCK_HOME || findRepo(process.cwd());
  if (!repo) {
    console.error("[x] 找不到 Vibe AStock 仓库：用 --repo D:\\GitHub\\vibe-astock 指一下，或设 VIBE_ASTOCK_HOME");
    process.exit(2);
  }
  if (!fs.existsSync(path.join(repo, "orchestrator", "src", "providers.ts"))) {
    console.error(`[x] ${repo} 看起来不是 Vibe AStock 仓库（缺 orchestrator/src/providers.ts）`);
    process.exit(2);
  }
  return path.resolve(repo);
}

// ── install ─────────────────────────────────────────────────────────────
async function cmdInstall(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const baseURL = String(args["base-url"] || DEFAULT_BASE);
  if (!/^https?:\/\//.test(baseURL)) { console.error(`[x] --base-url 不是 http(s) 地址：${baseURL}`); process.exit(2); }
  const dryRun = Boolean(args["dry-run"]);
  const key = String(args.key || "magpie");

  say(`仓库    ${repo}`);
  say(`数据根  ${dataRoot}`);
  say(`网关    ${baseURL}`);

  let model = args.model ? String(args.model) : null;
  if (!model) {
    const probe = await probeModels(baseURL, key);
    if (probe.ok) {
      model = pickModel(probe.ids);
      say(`探测    拿到 ${probe.ids.length} 个模型，默认选 ${model}`);
      if (probe.ids.length <= 40) for (const id of probe.ids) say(`          - ${id}`);
    } else {
      warn(`探测    ${probe.url} 失败：${probe.why}`);
      warn("        网关可能没启动。模板照样装上，默认模型留空，稍后在页面里填。");
    }
  }

  const t = installTemplate({ dataRoot, baseURL, model, force: Boolean(args.force), dryRun });
  say(`模板    ${t.note} → ${t.path}`);

  if (args["no-ui"]) {
    say("下拉    已跳过（--no-ui）：页面里选「其它 OpenAI 兼容端点」手填地址即可");
  } else {
    const r = applyPatches({ repoRoot: repo, baseURL, dryRun });
    for (const id of r.applied) say(`下拉    补丁 ${id}`);
    for (const s of r.skipped) {
      if (s.why === "已应用") continue;
      warn(`下拉    跳过 ${s.id}：${s.why}`);
    }
    if (!r.applied.length && !r.skipped.some((s) => s.why === "已应用")) {
      warn("下拉    没有可打的补丁：这一版页面结构不同，用「其它 OpenAI 兼容端点」手填即可");
    }
  }

  say("");
  say("下一步:");
  say("  1) 实测   vibe-astock-magpie verify --repo " + repo + " --write");
  say("  2) 重启   " + path.join(repo, "start-vibe-astock.cmd"));
  say(`  3) 页面   接入 AI → 模型选「Magpie 网关」→ Model 填 ${t.template.default_model ?? "<GET /v1/models 里的 id>"} → API Key 填 ${key}`);
}

// ── uninstall ───────────────────────────────────────────────────────────
function cmdUninstall(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const dryRun = Boolean(args["dry-run"]);
  const t = uninstallTemplate({ dataRoot, dryRun });
  say(t.removed ? `模板    已删除 ${t.path}` : `模板    没有 ${t.path}，跳过`);
  const files = revertPatches({ repoRoot: repo, dryRun });
  if (files.length) for (const f of files) say(`下拉    已摘除 ${path.relative(repo, f)}`);
  else say("下拉    没有补丁需要摘除");
  say("");
  say("卸载完成。重启（或刷新页面）后生效。");
}

// ── doctor ──────────────────────────────────────────────────────────────
async function cmdDoctor(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const tplPath = templatePath(dataRoot);
  let bad = 0;
  const ok = (s) => say(`OK    ${s}`);
  const no = (s) => { bad++; say(`FAIL  ${s}`); };
  const skip = (s) => say(`SKIP  ${s}`);

  say(`仓库    ${repo}`);
  say(`数据根  ${dataRoot}`);
  say("");

  ok(`Vibe AStock 仓库：orchestrator/src/providers.ts 在`);

  let tpl = null;
  if (!fs.existsSync(tplPath)) no(`模板不存在：${tplPath}（先跑 install）`);
  else {
    try {
      tpl = JSON.parse(fs.readFileSync(tplPath, "utf8"));
      ok(`模板可解析：id=${tpl.id} env_key=${tpl.env_key} base_url=${tpl.base_url}`);
      if (tpl.id !== "magpie") no(`模板 id 应为 magpie，实际 ${tpl.id}`);
    } catch (e) {
      no(`模板不是合法 JSON：${e.message}`);
    }
  }

  const base = tpl?.base_url || DEFAULT_BASE;
  const probe = await probeModels(base, String(args.key || "magpie"));
  if (!probe.ok) no(`网关 ${probe.url} 不可达：${probe.why}`);
  else {
    ok(`网关 ${probe.url} 可达，${probe.ids.length} 个模型`);
    const model = tpl?.default_model;
    if (!model) skip("模板没有默认模型：在页面里填一个，或 install 时给 --model");
    else if (probe.ids.includes(model)) ok(`默认模型 ${model} 在清单里`);
    else no(`默认模型 ${model} 不在网关清单里（改模板或重跑 install --force --model ...）`);
  }

  const ps = patchState({ repoRoot: repo });
  if (ps.patched) ok(`「接入 AI」下拉补丁已打：${ps.files.map((f) => path.relative(repo, f)).join(", ")}`);
  else skip("没有下拉补丁：页面里用「其它 OpenAI 兼容端点」手填地址");

  if (tpl?.direct) ok(`实测记录：supported=${tpl.direct.supported} structured_output=${tpl.direct.structured_output} (${tpl.direct.verified_at})`);
  else skip("还没实测（跑 verify --write 会写进 direct 段）");

  say("");
  say(bad ? `有 ${bad} 项要处理` : "全部通过");
  process.exit(bad ? 2 : 0);
}

// ── verify ──────────────────────────────────────────────────────────────
async function cmdVerify(args) {
  const repo = resolveRepo(args);
  const dataRoot = dataRootOf(repo, args["data-root"]);
  const tplPath = templatePath(dataRoot);
  if (!fs.existsSync(tplPath)) { console.error(`[x] 找不到 ${tplPath}：先跑 install`); process.exit(2); }
  const profile = JSON.parse(fs.readFileSync(tplPath, "utf8"));
  const model = String(args.model || profile.direct?.default_model || profile.default_model || "");
  if (!model) { console.error("[x] 模板里没有默认模型：install 时探测，或用 --model 指定"); process.exit(2); }
  const key = String(args.key || "magpie");
  say(`[verify] ${profile.name ?? "magpie"} · ${profile.base_url} · 模型 ${model}`);

  const cliArgs = ["orchestrator/src/finance/provider_matrix.ts", "--provider", "magpie", "--model", model];
  if (args.tests) cliArgs.push("--tests", String(args.tests));
  if (args["timeout-min"]) cliArgs.push("--timeout-min", String(args["timeout-min"]));

  const started = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, cliArgs, { cwd: repo, stdio: "inherit", env: { ...process.env, MAGPIE_API_KEY: key } });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", (e) => { console.error(`[x] 起不来：${e.message}`); resolve(1); });
  });

  const root = path.join(dataRoot, "provider-matrix", "magpie");
  let dir = null;
  if (fs.existsSync(root)) {
    dir = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name))
      .filter((d) => fs.existsSync(path.join(d, "results.json")))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
  }
  if (!dir) { console.error("[x] 没找到结果文件（矩阵可能在发请求前就退出了）"); process.exit(code || 1); }

  const results = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
  const VERDICT = { pass: "通过", partial: "部分", fail: "失败", error: "报错" };
  say("");
  say(`结果 ${path.relative(repo, dir)}（${Math.round((Date.now() - started) / 1000)} 秒）`);
  say(`合计 ${Object.entries(results.tally ?? {}).map(([k, v]) => `${VERDICT[k] ?? k} ${v}`).join(" · ") || "无"}`);
  for (const c of results.cases ?? []) {
    const flag = c.verdict === "pass" ? "✓" : c.verdict === "partial" ? "~" : "✗";
    say(`${flag} ${String(c.no).padStart(2)}. ${c.name} — ${VERDICT[c.verdict] ?? c.verdict}：${String(c.detail).slice(0, 160)}`);
  }
  say("");
  say(`direct 段建议：${JSON.stringify(results.suggestion)}`);

  if (args.write && results.suggestion) {
    const s = results.suggestion;
    const next = {
      ...profile,
      direct: {
        supported: s.supported,
        base_url: profile.base_url,
        default_model: model,
        structured_output: s.structured_output,
        verified_at: s.verified_at,
        notes: s.notes,
      },
    };
    fs.writeFileSync(tplPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    say(`[verify] 已写回 ${tplPath}（包里的 provider.json 未改动）`);
  }
  process.exit(0);
}

// ── 入口 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const args = parseArgs(argv);
const cmd = args._[0];

if (!cmd || cmd === "help" || args.help || args.h) { say(HELP); process.exit(0); }

try {
  if (cmd === "install") await cmdInstall(args);
  else if (cmd === "uninstall") cmdUninstall(args);
  else if (cmd === "verify") await cmdVerify(args);
  else if (cmd === "doctor") await cmdDoctor(args);
  else { console.error(`未知命令 ${cmd}`); say(HELP); process.exit(2); }
} catch (e) {
  console.error(`[x] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
