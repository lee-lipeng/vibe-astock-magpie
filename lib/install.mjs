/**
 * Vibe AStock 侧的安装动作：探测网关、写 providers 模板、卸载。
 * 只碰 <数据根>/providers/ 这一个目录 —— 产品代码除了「接入 AI」下拉补丁（见 patch.mjs）之外不动。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(HERE, "..");
export const TEMPLATE_SRC = path.join(PKG_ROOT, "provider.json");

export const DEFAULT_BASE = "http://127.0.0.1:3425/v1";

/** 从任意目录往上找 Vibe AStock 仓库根：认 orchestrator/src/providers.ts */
export function findRepo(start = process.cwd()) {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "orchestrator", "src", "providers.ts"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function dataRootOf(repoRoot, override) {
  return path.resolve(override || process.env.VRA_DATA_ROOT || path.join(repoRoot, ".local"));
}

export function templatePath(dataRoot) {
  return path.join(dataRoot, "providers", "magpie.json");
}

export function readTemplate() {
  return JSON.parse(fs.readFileSync(TEMPLATE_SRC, "utf8"));
}

/** 现场探测 GET {base}/models；网关没起来返回 null（安装照常进行） */
export async function probeModels(baseURL, key = "magpie") {
  const url = `${String(baseURL).replace(/\/+$/, "")}/models`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, url, why: `HTTP ${res.status}` };
    const body = await res.json();
    const ids = Array.isArray(body?.data) ? body.data.map((m) => m?.id).filter((x) => typeof x === "string") : [];
    return ids.length ? { ok: true, url, ids } : { ok: false, url, why: "模型清单为空" };
  } catch (e) {
    return { ok: false, url, why: e instanceof Error ? e.message : String(e) };
  }
}

/** 优先路由组（auto/*，带故障转移），否则第一个 */
export function pickModel(ids) {
  if (!ids?.length) return null;
  return ids.find((id) => id.startsWith("auto/")) ?? ids[0];
}

export function installTemplate({ dataRoot, baseURL, model, force = false, dryRun = false }) {
  const tpl = readTemplate();
  const dst = templatePath(dataRoot);
  const next = { ...tpl, base_url: baseURL, default_model: model ?? null };
  let note = "新建";
  if (fs.existsSync(dst) && !force) {
    const cur = JSON.parse(fs.readFileSync(dst, "utf8"));
    next.base_url = cur.base_url || next.base_url;
    next.default_model = cur.default_model || next.default_model;
    note = "已存在，保留用户填过的值（--force 覆盖）";
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  return { path: dst, template: next, note };
}

export function uninstallTemplate({ dataRoot, dryRun = false }) {
  const dst = templatePath(dataRoot);
  if (!fs.existsSync(dst)) return { removed: false, path: dst };
  if (!dryRun) fs.rmSync(dst);
  return { removed: true, path: dst };
}
