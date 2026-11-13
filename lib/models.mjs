/**
 * magpie 网关的模型清单 → Vibe AStock「接入 AI」下拉里的条目。
 *
 * 安装时（和 `models` 命令时）把网关当前的模型渲染成一段 TS 常量，插进 ai-models.ts 的标记块，
 * 运行时不发请求。magpie 里加了模型要重跑 `models`，README 的限制一节写了这条。
 */

/** 网关没探测到时也要有一条可选，否则下拉里什么都没有 */
export const FALLBACK_ENTRY = {
  id: "magpie",
  name: "Magpie 网关（手填模型名）",
  description: "网关没探测到模型：先启动 magpie，再跑 vibe-astock-magpie models",
};

const BLOCK_BEGIN = "// magpie-plugin:begin";
const BLOCK_END = "// magpie-plugin:end";

/** 上下文长度：1M / 200K，没有就不写 */
function formatContext(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return "";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * 把网关的 `/v1/models` 结果整理成下拉条目。
 * @param {Array<{id: string, magpie_label?: string, context_window?: number, context_length?: number}>} data
 * @returns {Array<{id: string, name: string, description: string}>}
 */
export function toModelEntries(data) {
  const entries = [];
  const seen = new Set();
  for (const model of data ?? []) {
    const id = typeof model?.id === "string" ? model.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof model.magpie_label === "string" && model.magpie_label ? model.magpie_label : "";
    const context = formatContext(model.context_window ?? model.context_length);
    entries.push({
      id,
      // 下拉里和产品自带的 DeepSeek / GLM 混在一起，加前缀才认得出这条来自 magpie
      name: `Magpie · ${label || id}`,
      description: [id, context].filter(Boolean).join(" · "),
    });
  }
  return entries;
}

/**
 * 渲染要插进 ai-models.ts 的整块（含起止标记）。
 * 每个条目一行，字段用 JSON.stringify 转义，模型名里的引号不会破坏 TS。
 */
export function renderModelBlock(entries) {
  const list = entries?.length ? entries : [FALLBACK_ENTRY];
  const lines = [
    `${BLOCK_BEGIN} 由 vibe-astock-magpie 生成，勿手改：install / models 会覆盖，uninstall 会整块删除`,
    ...list.map(
      (entry) =>
        `  { id: ${JSON.stringify(entry.id)}, name: ${JSON.stringify(entry.name)}, description: ${JSON.stringify(
          entry.description,
        )}, provider: "magpie" },`,
    ),
    BLOCK_END,
  ];
  return lines.join("\n");
}

/** 文本里现在有几条 Magpie 条目（用于 doctor 对比网关） */
export function countModelEntries(text) {
  const begin = text.indexOf(BLOCK_BEGIN);
  const end = text.indexOf(BLOCK_END);
  if (begin < 0 || end < begin) return 0;
  return (text.slice(begin, end).match(/provider: "magpie"/g) ?? []).length;
}
