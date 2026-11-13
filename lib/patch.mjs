/**
 * 「接入 AI」下拉补丁：给 Vibe AStock 的静态模型清单补一条 Magpie 网关。
 *
 * 为什么必须改源码：Vibe AStock 的模型下拉是编译期常量（desktop/src/verticals/finance/lib/ai-models.ts），
 * 后端虽然认得数据根里的任何 providers 模板，界面却没有入口去选它。
 *
 * 设计约束：
 * - 每处插入都单独占一行并带 `// magpie-plugin` 标记，卸载时按标记整行删除，不会碰到别人的代码；
 * - 幂等：靠 sentinel 判断「已打过」，重复安装不会叠加；
 * - 安全降级：锚点找不到就跳过并如实上报，绝不猜位置硬改；
 * - 保留原文件换行风格（Windows 检出是 CRLF，混进 LF 会让 diff 一片红）。
 *
 * 不改这一处也能用：页面里选「其它 OpenAI 兼容端点」，手填 Base URL / Model / Key 即可。
 */
import fs from "node:fs";
import path from "node:path";

export const MARK = "// magpie-plugin";

/** 补丁作用的文件：键名 → 仓库内相对路径 */
const FILES = {
  models: ["desktop", "src", "verticals", "finance", "lib", "ai-models.ts"],
  conn: ["desktop", "src", "verticals", "finance", "lib", "aiConnection.ts"],
};

/**
 * 补丁定义。`find` / `replace` 一律写 `\n`，真实文件的换行由 {@link applyPatchToText} 按文件实际风格适配。
 * - `sentinel`：出现即视为已打（幂等判据，与换行无关）；
 * - `restore`：改写整行型补丁的原文，卸载时按它还原（否则按标记整行删除会把别人的代码删掉）。
 */
export function patchSpecs(baseURL) {
  return [
    {
      id: "type-union",
      file: "models",
      sentinel: '| "magpie" ' + MARK,
      find: "export type ProviderId =\n",
      replace: `export type ProviderId =\n  | "magpie" ${MARK}\n`,
    },
    {
      id: "provider-base",
      file: "models",
      sentinel: `magpie: "${baseURL}"`,
      find: '  "openai-compatible": "",\n',
      replace: `  magpie: "${baseURL}", ${MARK}\n  "openai-compatible": "",\n`,
    },
    {
      id: "model-entry",
      file: "models",
      sentinel: 'id: "magpie", name: "Magpie 网关"',
      find: '  { id: "custom", name: "其它 OpenAI 兼容端点",',
      replace:
        `  { id: "magpie", name: "Magpie 网关", description: "本机 magpie 网关 · 模型名填 provider/model（先看 /v1/models）", provider: "magpie" }, ${MARK}\n` +
        '  { id: "custom", name: "其它 OpenAI 兼容端点",',
    },
    {
      id: "preset-no-model",
      file: "models",
      sentinel: '|| id === "magpie"',
      find: 'export const modelNameForPreset = (id: string): string => (id === "custom" ? "" : id);',
      replace: `export const modelNameForPreset = (id: string): string => (id === "custom" || id === "magpie" ? "" : id); ${MARK}`,
      restore: 'export const modelNameForPreset = (id: string): string => (id === "custom" ? "" : id);',
    },
    {
      id: "source-label",
      file: "conn",
      sentinel: 'magpie: "Magpie 网关"',
      // ⚠️ 必须另起一行，不能接在原来那行后面：卸载是按含标记的整行删的，接在别人行尾会把
      //    glm / kimi / qwen 一起删掉（真踩过，test 里有一条护栏）。
      find: '  glm: "智谱 GLM API", kimi: "Kimi API", qwen: "通义千问 API",\n',
      replace:
        '  glm: "智谱 GLM API", kimi: "Kimi API", qwen: "通义千问 API",\n' +
        `  magpie: "Magpie 网关", ${MARK}\n`,
    },
  ];
}

/** 补丁要改的文件（去重，按出现顺序） */
export function patchFiles(repoRoot) {
  return [...new Set(Object.values(FILES).map((parts) => path.join(repoRoot, ...parts)))];
}

/** 把补丁规格绑上仓库路径 */
export function patchesFor(repoRoot, baseURL = "") {
  return patchSpecs(baseURL).map((spec) => ({ ...spec, path: path.join(repoRoot, ...FILES[spec.file]) }));
}

const usesCRLF = (text) => text.includes("\r\n");
const withEol = (text, eol) => (eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);

/**
 * 纯函数：把一条补丁应用到文本上。
 * @returns `applied` 已改写 / `already` 已打过 / `anchor-missing` 找不到锚点（调用方跳过，不改文件）
 */
export function applyPatchToText(text, patch) {
  if (text.includes(patch.sentinel)) return { text, state: "already" };
  const eol = usesCRLF(text) ? "\r\n" : "\n";
  const find = withEol(patch.find, eol);
  if (!text.includes(find)) return { text, state: "anchor-missing" };
  return { text: text.replace(find, withEol(patch.replace, eol)), state: "applied" };
}

/** 纯函数：摘掉补丁。先还原改写型补丁，再删带标记的插入行。 */
export function revertPatchesFromText(text, specs = patchSpecs("")) {
  let out = text;
  for (const spec of specs) {
    if (spec.restore && out.includes(spec.replace)) out = out.split(spec.replace).join(spec.restore);
  }
  return out
    .split("\n")
    .filter((line) => !line.includes(MARK))
    .join("\n");
}

/**
 * 给仓库打补丁。
 * @returns `applied` / `skipped`（含原因）/ `files`（真正写过的文件）
 */
export function applyPatches({ repoRoot, baseURL, dryRun = false }) {
  const applied = [];
  const skipped = [];
  const files = new Set();
  for (const patch of patchesFor(repoRoot, baseURL)) {
    if (!fs.existsSync(patch.path)) {
      skipped.push({ id: patch.id, why: "文件不存在" });
      continue;
    }
    const src = fs.readFileSync(patch.path, "utf8");
    const { text, state } = applyPatchToText(src, patch);
    if (state !== "applied") {
      skipped.push({ id: patch.id, why: state === "already" ? "已应用" : "锚点缺失（上游改过结构）" });
      continue;
    }
    if (!dryRun) fs.writeFileSync(patch.path, text, "utf8");
    applied.push(patch.id);
    files.add(patch.path);
  }
  return { applied, skipped, files: [...files] };
}

/** 摘掉所有补丁；返回真正改过的文件 */
export function revertPatches({ repoRoot, dryRun = false }) {
  const specs = patchSpecs("");
  const reverted = [];
  for (const file of patchFiles(repoRoot)) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(MARK)) continue;
    if (!dryRun) fs.writeFileSync(file, revertPatchesFromText(src, specs), "utf8");
    reverted.push(file);
  }
  return reverted;
}

/** 补丁现状 */
export function patchState({ repoRoot }) {
  const files = patchFiles(repoRoot).filter(
    (file) => fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(MARK),
  );
  return { patched: files.length > 0, files };
}
