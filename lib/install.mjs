/**
 * Vibe AStock 侧的安装动作：定位仓库、探测网关、读写 providers 模板。
 *
 * 只碰两个位置：`<数据根>/providers/magpie.json` 与（可选）前端两个 .ts 文件里的补丁行。
 * 产品代码、配置、台账一律不动。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_SRC = path.join(path.resolve(HERE, ".."), "provider.json");

/** magpie 默认监听地址（OpenAI 兼容前缀 /v1，见 magpie README） */
export const DEFAULT_BASE = "http://127.0.0.1:3425/v1";

const PROBE_TIMEOUT_MS = 5000;

/** 从 start 往上找 Vibe AStock 仓库根：认 orchestrator/src/providers.ts */
export function findRepo(start = process.cwd()) {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 8; depth++) {
    if (fs.existsSync(path.join(dir, "orchestrator", "src", "providers.ts"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 数据根：显式参数 > VRA_DATA_ROOT > <仓库>/.local */
export function dataRootOf(repoRoot, override) {
  const explicit = typeof override === "string" && override.trim() ? override.trim() : "";
  const fromEnv = process.env.VRA_DATA_ROOT?.trim() || "";
  return path.resolve(explicit || fromEnv || path.join(repoRoot, ".local"));
}

export function templatePath(dataRoot) {
  return path.join(dataRoot, "providers", "magpie.json");
}

export function readTemplate() {
  return JSON.parse(fs.readFileSync(TEMPLATE_SRC, "utf8"));
}

/**
 * 校验并规范化网关地址：去掉尾部斜杠（产品侧是 `{base_url}/chat/completions`，多一个斜杠会 404）。
 * 规则与 Vibe AStock 的 providerUrlError 对齐：远程必须 https，http 只放行本机回环。
 * @returns 规范化后的地址
 */
export function normalizeBaseURL(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`网关地址不是合法 URL：${raw || "(空)"}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("网关地址不能带用户名密码、查询参数或片段；凭据请填到 API Key");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`网关地址只支持 http / https，收到 ${url.protocol}`);
  }
  if (url.protocol === "https:") return raw;
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
  if (url.protocol === "http:" && loopback) return raw;
  throw new Error("远程网关必须用 https；http 只允许 localhost / 127.0.0.1 / [::1]");
}

/**
 * 现场探测 `GET {base}/models`。网关没起来不是致命错误 —— 模板照装，模型留空。
 * @returns {{ok: true, url: string, ids: string[], models: object[]} | {ok: false, url: string, why: string, hint?: string}}
 */
export async function probeModels(baseURL, key = "magpie") {
  const url = `${baseURL}/models`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const hint =
        res.status === 404
          ? "地址通常以 /v1 结尾，例如 http://127.0.0.1:3425/v1"
          : res.status === 401 || res.status === 403
            ? "key 不对：magpie 的本地 key 默认是 magpie"
            : undefined;
      return { ok: false, url, why: `HTTP ${res.status}`, ...(hint ? { hint } : {}) };
    }
    const body = await res.json();
    const models = Array.isArray(body?.data) ? body.data.filter((m) => m && typeof m.id === "string") : [];
    const ids = models.map((m) => m.id);
    return models.length ? { ok: true, url, ids, models } : { ok: false, url, why: "模型清单为空" };
  } catch (e) {
    return { ok: false, url, why: e instanceof Error ? e.message : String(e) };
  }
}

/** 挑默认模型：优先路由组（auto/*，带故障转移），否则第一个 */
export function pickModel(ids) {
  if (!ids?.length) return null;
  return ids.find((id) => id.startsWith("auto/")) ?? ids[0];
}

/**
 * 写数据根里的模板。
 * 语义：显式传进来的 baseURL / model 优先；没传就沿用已装的那份；都没有才用包里的默认值。
 * @returns {{path: string, template: object, action: "created" | "updated" | "unchanged"}}
 */
export function installTemplate({ dataRoot, baseURL, model, dryRun = false }) {
  const dst = templatePath(dataRoot);
  const exists = fs.existsSync(dst);
  const current = exists ? JSON.parse(fs.readFileSync(dst, "utf8")) : null;
  const base = readTemplate();
  const template = {
    ...base,
    base_url: baseURL || current?.base_url || base.base_url,
    default_model: model ?? current?.default_model ?? null,
    // 实测记录是跑 verify 攒下来的，重装不能丢
    ...(current?.direct ? { direct: current.direct } : {}),
  };
  const same = exists && JSON.stringify(current) === JSON.stringify(template);
  if (!dryRun && !same) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  }
  return { path: dst, template, action: !exists ? "created" : same ? "unchanged" : "updated" };
}

/** 删数据根里的模板；返回是否真的删了 */
export function uninstallTemplate({ dataRoot, dryRun = false }) {
  const dst = templatePath(dataRoot);
  if (!fs.existsSync(dst)) return { removed: false, path: dst };
  if (!dryRun) fs.rmSync(dst);
  return { removed: true, path: dst };
}
