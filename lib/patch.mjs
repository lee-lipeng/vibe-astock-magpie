/**
 * 「接入 AI」下拉补丁：给 Vibe AStock 的静态模型清单补一条 Magpie 网关。
 *
 * 为什么要改源码：Vibe AStock 的模型下拉是编译期常量（desktop/src/verticals/finance/lib/ai-models.ts），
 * 后端虽然认得数据根里的任何 providers 模板，界面却没有入口去选它。补丁只加 5 行，每行带 // magpie-plugin
 * 标记，uninstall 逐行摘掉；锚点找不到时安静跳过（上游改结构也不会把仓库改坏）。
 *
 * 不改这一处也能用：页面里选「其它 OpenAI 兼容端点」，手填 Base URL / Model / Key 即可。
 */
import fs from "node:fs";
import path from "node:path";

export const MARK = "// magpie-plugin";

const AI_MODELS_FILE = ["desktop", "src", "verticals", "finance", "lib", "ai-models.ts"];
const AI_CONN_FILE = ["desktop", "src", "verticals", "finance", "lib", "aiConnection.ts"];

/** 补丁清单：find 是要找的锚点，replace 是替换结果；restore 用于「改写整行」型补丁的还原 */
export function patchesFor(baseURL, repoRoot = ".") {
  const modelsFile = path.join(repoRoot, ...AI_MODELS_FILE);
  const connFile = path.join(repoRoot, ...AI_CONN_FILE);
  return [
    {
      id: "type-union",
      file: modelsFile,
      find: "export type ProviderId =\n",
      replace: `export type ProviderId =\n  | "magpie" ${MARK}\n`,
    },
    {
      id: "provider-base",
      file: modelsFile,
      find: '  "openai-compatible": "",\n',
      replace: `  magpie: "${baseURL}", ${MARK}\n  "openai-compatible": "",\n`,
    },
    {
      id: "model-entry",
      file: modelsFile,
      find: '  { id: "custom", name: "其它 OpenAI 兼容端点",',
      replace:
        `  { id: "magpie", name: "Magpie 网关", description: "本机 magpie 网关 · 模型名填 provider/model（先看 /v1/models）", provider: "magpie" }, ${MARK}\n` +
        '  { id: "custom", name: "其它 OpenAI 兼容端点",',
    },
    {
      id: "preset-no-model",
      file: modelsFile,
      find: 'export const modelNameForPreset = (id: string): string => (id === "custom" ? "" : id);',
      replace: `export const modelNameForPreset = (id: string): string => (id === "custom" || id === "magpie" ? "" : id); ${MARK}`,
      restore: 'export const modelNameForPreset = (id: string): string => (id === "custom" ? "" : id);',
    },
    {
      id: "source-label",
      file: connFile,
      // ⚠️ 必须是「另起一行」而不是「接在原来那行后面」：摘补丁是按含标记的整行删的，
      //    接在别人那行后面会把原来的 glm / kimi / qwen 一起删掉（踩过）。
      find: '  glm: "智谱 GLM API", kimi: "Kimi API", qwen: "通义千问 API",\n',
      replace:
        '  glm: "智谱 GLM API", kimi: "Kimi API", qwen: "通义千问 API",\n' +
        `  magpie: "Magpie 网关", ${MARK}\n`,
    },
  ];
}

/** 纯函数：把一条补丁应用到文本上。已应用 → 原样返回；锚点缺失 → 抛 anchor 错（调用方决定跳过） */
export function applyPatchToText(text, patch) {
  if (text.includes(patch.replace.trim())) return { text, state: "already" };
  if (!text.includes(patch.find)) return { text, state: "anchor-missing" };
  return { text: text.replace(patch.find, patch.replace), state: "applied" };
}

/** 纯函数：从文本上摘掉补丁（先还原改写型，再删带标记的插入行） */
export function revertPatchesFromText(text, patches) {
  let out = text;
  for (const p of patches) {
    if (p.restore && out.includes(p.replace)) out = out.split(p.replace).join(p.restore);
  }
  return out
    .split("\n")
    .filter((line) => !line.includes(MARK))
    .join("\n");
}

export function applyPatches({ repoRoot, baseURL, dryRun = false }) {
  const applied = [];
  const skipped = [];
  const touched = new Set();
  for (const p of patchesFor(baseURL, repoRoot)) {
    if (!fs.existsSync(p.file)) { skipped.push({ id: p.id, why: "文件不存在" }); continue; }
    const src = fs.readFileSync(p.file, "utf8");
    const { text, state } = applyPatchToText(src, p);
    if (state === "already") { skipped.push({ id: p.id, why: "已应用" }); continue; }
    if (state === "anchor-missing") { skipped.push({ id: p.id, why: "锚点缺失（上游改过结构）" }); continue; }
    if (!dryRun) fs.writeFileSync(p.file, text, "utf8");
    applied.push(p.id);
    touched.add(p.file);
  }
  return { applied, skipped, files: [...touched] };
}

export function revertPatches({ repoRoot, dryRun = false }) {
  const reverted = [];
  for (const file of new Set(patchesFor("", repoRoot).map((p) => p.file))) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(MARK)) continue;
    const next = revertPatchesFromText(src, patchesFor("", repoRoot));
    if (!dryRun) fs.writeFileSync(file, next, "utf8");
    reverted.push(file);
  }
  return reverted;
}

/** 补丁现状：有没有标记行 */
export function patchState({ repoRoot }) {
  const files = [...new Set(patchesFor("", repoRoot).map((p) => p.file))];
  const present = files.filter((f) => fs.existsSync(f) && fs.readFileSync(f, "utf8").includes(MARK));
  return { patched: present.length > 0, files: present };
}
