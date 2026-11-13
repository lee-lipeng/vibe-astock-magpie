/**
 * 「接入 AI」补丁：让 Vibe AStock 的下拉里直接出现 magpie 的每个模型。
 *
 * 为什么必须改源码：模型下拉是编译期常量（desktop/src/verticals/finance/lib/ai-models.ts），
 * 后端虽然认得数据根里的任何 providers 模板，界面却没有入口去选它。
 *
 * 设计约束：
 * - 模型清单放在一对标记之间（`// magpie-plugin:begin` / `:end`），刷新时整块替换，卸载时整块删除；
 * - 其余 4 处是单行插入 / 单行改写，各自带 `// magpie-plugin` 标记，卸载按行还原；
 * - 幂等：重复安装不叠加；锚点找不到就跳过并如实上报，绝不猜位置硬改；
 * - 保留原文件换行风格（Windows 检出是 CRLF，混进 LF 会让 diff 一片红）。
 *
 * 不改这一处也能用：页面里选「其它 OpenAI 兼容端点」，手填 Base URL / Model / Key 即可。
 */
import fs from "node:fs";
import path from "node:path";

export const MARK = "// magpie-plugin";
export const BLOCK_BEGIN = "// magpie-plugin:begin";
export const BLOCK_END = "// magpie-plugin:end";

/** 补丁作用的文件：键名 → 仓库内相对路径 */
const FILES = {
  models: ["desktop", "src", "verticals", "finance", "lib", "ai-models.ts"],
  conn: ["desktop", "src", "verticals", "finance", "lib", "aiConnection.ts"],
  settings: ["desktop", "src", "verticals", "finance", "pages", "Settings.tsx"],
};

/** 模型清单块插在哪一行之前（「其它 OpenAI 兼容端点」那条的上一行） */
const MODEL_ANCHOR = '  { id: "custom", name: "其它 OpenAI 兼容端点",';

/**
 * 单行补丁定义。`find` / `replace` 一律写 `\n`，真实文件的换行由 {@link applyPatchToText} 适配。
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
    {
      id: "default-key",
      file: "settings",
      sentinel: 'setApiKey("magpie")',
      // 选中 Magpie 网关时把 key 预填成 magpie 的本地默认值（README 里的字面量 magpie，
      // 不是密钥）；用户自己填过就不动。
      find: '    setApiId(id); setModelName(modelNameForPreset(id)); setBaseURL(PROVIDER_BASE[m.provider] ?? "");\n',
      replace:
        '    setApiId(id); setModelName(modelNameForPreset(id)); setBaseURL(PROVIDER_BASE[m.provider] ?? "");\n' +
        `    if (m.provider === "magpie" && !apiKey) setApiKey("magpie"); ${MARK}\n`,
    },
  ];
}

/** 补丁要改的文件（去重，按出现顺序） */
export function patchFiles(repoRoot) {
  return [...new Set(Object.values(FILES).map((parts) => path.join(repoRoot, ...parts)))];
}

/** 模型清单文件（doctor / models 命令要单独读它） */
export function modelsFilePath(repoRoot) {
  return path.join(repoRoot, ...FILES.models);
}

/** 把补丁规格绑上仓库路径 */
export function patchesFor(repoRoot, baseURL = "") {
  return patchSpecs(baseURL).map((spec) => ({ ...spec, path: path.join(repoRoot, ...FILES[spec.file]) }));
}

const usesCRLF = (text) => text.includes("\r\n");
const withEol = (text, eol) => (eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);

/**
 * 纯函数：把一条单行补丁应用到文本上。
 * @returns `applied` 已改写 / `already` 已打过 / `anchor-missing` 找不到锚点（调用方跳过，不改文件）
 */
export function applyPatchToText(text, patch) {
  if (text.includes(patch.sentinel)) return { text, state: "already" };
  const eol = usesCRLF(text) ? "\r\n" : "\n";
  const find = withEol(patch.find, eol);
  if (!text.includes(find)) return { text, state: "anchor-missing" };
  return { text: text.replace(find, withEol(patch.replace, eol)), state: "applied" };
}

/**
 * 纯函数：插入或整块替换模型清单。
 * @param block {@link import("./models.mjs").renderModelBlock} 渲染出来的整块（含起止标记）
 * @returns `applied` 已写入 / `already` 内容没变 / `anchor-missing` 找不到插入点
 */
export function upsertModelBlock(text, block) {
  const eol = usesCRLF(text) ? "\r\n" : "\n";
  const rendered = withEol(block, eol);
  const begin = text.indexOf(BLOCK_BEGIN);
  const end = text.indexOf(BLOCK_END);
  if (begin >= 0 && end > begin) {
    // 已有整块：连标记一起换掉，块外一个字节都不动
    const next = text.slice(0, begin) + rendered + text.slice(end + BLOCK_END.length);
    return { text: next, state: next === text ? "already" : "applied" };
  }
  const anchor = withEol(MODEL_ANCHOR, eol);
  if (!text.includes(anchor)) return { text, state: "anchor-missing" };
  return { text: text.replace(anchor, rendered + eol + anchor), state: "applied" };
}

/**
 * 纯函数：摘掉所有补丁。
 * 顺序是承重的：先还原改写型补丁（它那一行本身带标记），再删模型清单块，最后删残留的标记行。
 */
export function revertPatchesFromText(text, specs = patchSpecs("")) {
  let out = text;
  for (const spec of specs) {
    if (spec.restore && out.includes(spec.replace)) out = out.split(spec.replace).join(spec.restore);
  }
  const kept = [];
  let inBlock = false;
  for (const line of out.split("\n")) {
    if (line.includes(BLOCK_BEGIN)) {
      inBlock = true;
      continue;
    }
    if (line.includes(BLOCK_END)) {
      inBlock = false;
      continue;
    }
    if (inBlock || line.includes(MARK)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * 给仓库打补丁：模型清单块 + 4 处单行补丁。
 * @param block 模型清单整块；不给就只打单行补丁（`--no-ui` 之外的降级路径）
 * @returns `applied` / `skipped`（含原因）/ `files`（真正写过的文件）
 */
export function applyPatches({ repoRoot, baseURL, block, dryRun = false }) {
  const applied = [];
  const skipped = [];
  const files = [];

  /** 同一文件只读一次、写一次 */
  const edit = (filePath, transform) => {
    if (!fs.existsSync(filePath)) return null;
    const src = fs.readFileSync(filePath, "utf8");
    const next = transform(src);
    if (next !== src) {
      if (!dryRun) fs.writeFileSync(filePath, next, "utf8");
      files.push(filePath);
    }
    return next;
  };

  // 模型清单文件：先整块，再单行（两者都改同一个文件，必须一次写完）
  const modelsPath = modelsFilePath(repoRoot);
  edit(modelsPath, (src) => {
    let out = src;
    if (block) {
      const result = upsertModelBlock(out, block);
      out = result.text;
      if (result.state === "applied") applied.push("model-entries");
      else skipped.push({ id: "model-entries", why: result.state === "already" ? "已应用" : "锚点缺失（上游改过结构）" });
    }
    for (const patch of patchesFor(repoRoot, baseURL).filter((p) => p.file === "models")) {
      const result = applyPatchToText(out, patch);
      out = result.text;
      if (result.state === "applied") applied.push(patch.id);
      else skipped.push({ id: patch.id, why: result.state === "already" ? "已应用" : "锚点缺失（上游改过结构）" });
    }
    return out;
  });

  for (const patch of patchesFor(repoRoot, baseURL).filter((p) => p.file !== "models")) {
    const result = edit(patch.path, (src) => {
      const appliedText = applyPatchToText(src, patch);
      if (appliedText.state === "applied") applied.push(patch.id);
      else skipped.push({ id: patch.id, why: appliedText.state === "already" ? "已应用" : "锚点缺失（上游改过结构）" });
      return appliedText.text;
    });
    if (result === null) skipped.push({ id: patch.id, why: "文件不存在" });
  }

  return { applied, skipped, files };
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
