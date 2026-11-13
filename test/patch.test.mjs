/**
 * 纯函数测试：补丁的幂等 / 可逆 / 换行安全 / 锚点缺失，模板与地址处理。
 * 跑：npm test
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MARK, applyPatchToText, patchSpecs, revertPatchesFromText } from "../lib/patch.mjs";
import { dataRootOf, installTemplate, normalizeBaseURL, pickModel, templatePath } from "../lib/install.mjs";

const BASE = "http://127.0.0.1:3425/v1";

const MODELS_SAMPLE = `export type ProviderId =
  | "deepseek" | "silicon"
  | "openai-compatible"
  | "cli-codex" | "cli-claude" | "cli-codebuddy";

export const PROVIDER_BASE: Partial<Record<ProviderId, string>> = {
  deepseek: "https://api.deepseek.com",
  "openai-compatible": "",
};

export const AI_MODELS: ModelConfig[] = [
  { id: "gpt-5.4", name: "OpenAI GPT-5.4", description: "x", provider: "openai-api" },
  { id: "custom", name: "其它 OpenAI 兼容端点", description: "任意", provider: "openai-compatible" },
];

export const modelNameForPreset = (id: string): string => (id === "custom" ? "" : id);
`;

const CONN_SAMPLE = `const SOURCE_LABELS: Record<string, string> = {
  glm: "智谱 GLM API", kimi: "Kimi API", qwen: "通义千问 API",
};
`;

/** 对某个文件的样本依次应用补丁 */
function patchText(text, file, baseURL = BASE) {
  let out = text;
  const states = [];
  for (const spec of patchSpecs(baseURL).filter((s) => s.file === file)) {
    const result = applyPatchToText(out, spec);
    out = result.text;
    states.push({ id: spec.id, state: result.state });
  }
  return { out, states };
}

test("五处补丁都能打上，且都带标记", () => {
  const { out, states } = patchText(MODELS_SAMPLE, "models");
  assert.deepEqual(
    states.map((s) => s.state),
    ["applied", "applied", "applied", "applied"],
  );
  assert.equal(out.split(MARK).length - 1, 4);
  assert.match(out, /\| "magpie" \/\/ magpie-plugin/);
  assert.match(out, /magpie: "http:\/\/127\.0\.0\.1:3425\/v1", \/\/ magpie-plugin/);
  assert.match(out, /id: "magpie", name: "Magpie 网关"/);
  assert.match(out, /id === "custom" \|\| id === "magpie"/);
});

test("重复打补丁幂等（第二次全部 already，文本不变）", () => {
  const once = patchText(MODELS_SAMPLE, "models").out;
  const twice = patchText(once, "models");
  assert.deepEqual(
    twice.states.map((s) => s.state),
    ["already", "already", "already", "already"],
  );
  assert.equal(twice.out, once);
});

test("摘掉补丁后与原文逐字节一致", () => {
  const once = patchText(MODELS_SAMPLE, "models").out;
  assert.equal(revertPatchesFromText(once), MODELS_SAMPLE);
});

test("CRLF 文件：插入行用 CRLF，摘下后仍与原文件逐字节一致", () => {
  const crlf = MODELS_SAMPLE.replace(/\n/g, "\r\n");
  const patched = patchText(crlf, "models").out;
  assert.ok(patched.includes('| "magpie" // magpie-plugin\r\n'), "插入行应跟随文件用 CRLF");
  assert.ok(!/[^\r]\n/.test(patched), "不应混进裸 LF");
  assert.equal(revertPatchesFromText(patched), crlf);
});

test("锚点缺失时不动文件（上游改结构也不会改坏）", () => {
  const weird = 'export type ProviderId = | "a";\n';
  const { out, states } = patchText(weird, "models");
  assert.equal(out, weird);
  assert.ok(states.every((s) => s.state === "anchor-missing"));
});

test("标签补丁另起一行，不会吃掉原来的 glm / kimi / qwen", () => {
  const { out } = patchText(CONN_SAMPLE, "conn");
  assert.match(out, /magpie: "Magpie 网关"/);
  assert.match(out, /glm: "智谱 GLM API"/);
  assert.equal(revertPatchesFromText(out), CONN_SAMPLE);
});

test("插入型补丁必须把锚点原样留在替换结果里", () => {
  for (const spec of patchSpecs(BASE)) {
    if (!spec.find.endsWith("\n")) continue; // 改写整行的补丁靠 restore 还原
    assert.ok(spec.replace.includes(spec.find), `${spec.id} 的 replace 里丢了锚点`);
  }
});

test("网关地址规范化：去尾斜杠、放行 https 与本机 http、拒绝远程 http 与凭据", () => {
  assert.equal(normalizeBaseURL("http://127.0.0.1:3425/v1/"), BASE);
  assert.equal(normalizeBaseURL("  https://gw.example.com/v1  "), "https://gw.example.com/v1");
  assert.equal(normalizeBaseURL("http://localhost:3425/v1"), "http://localhost:3425/v1");
  assert.throws(() => normalizeBaseURL("http://192.168.1.20:3425/v1"), /https/);
  assert.throws(() => normalizeBaseURL("http://user:pass@127.0.0.1:3425/v1"), /用户名密码/);
  assert.throws(() => normalizeBaseURL("ftp://127.0.0.1/v1"), /只支持 http/);
  assert.throws(() => normalizeBaseURL("not a url"), /合法 URL/);
  assert.throws(() => normalizeBaseURL(""), /合法 URL/);
});

test("默认模型优先取路由组", () => {
  assert.equal(pickModel(["trae-cn/glm-5.3", "auto/glm-5.3-flash"]), "auto/glm-5.3-flash");
  assert.equal(pickModel(["only/model"]), "only/model");
  assert.equal(pickModel([]), null);
});

test("模板安装：显式参数优先，未给时沿用已装的值", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-test-"));
  try {
    const first = installTemplate({ dataRoot, baseURL: BASE, model: "auto/a" });
    assert.equal(first.action, "created");
    assert.equal(first.template.default_model, "auto/a");

    const kept = installTemplate({ dataRoot });
    assert.equal(kept.action, "unchanged");
    assert.equal(kept.template.default_model, "auto/a");
    assert.equal(kept.template.base_url, BASE);

    const changed = installTemplate({ dataRoot, model: "auto/b" });
    assert.equal(changed.action, "updated");
    assert.equal(changed.template.default_model, "auto/b");

    const saved = JSON.parse(fs.readFileSync(templatePath(dataRoot), "utf8"));
    assert.equal(saved.id, "magpie");
    assert.match(saved.env_key, /^[A-Z][A-Z0-9_]*$/);
    assert.equal(saved.default_model, "auto/b");
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("数据根：参数优先，其次 VRA_DATA_ROOT，最后 <仓库>/.local", () => {
  const prev = process.env.VRA_DATA_ROOT;
  try {
    delete process.env.VRA_DATA_ROOT;
    assert.equal(dataRootOf("/repo"), path.resolve("/repo/.local"));
    process.env.VRA_DATA_ROOT = "/data";
    assert.equal(dataRootOf("/repo"), path.resolve("/data"));
    assert.equal(dataRootOf("/repo", "/explicit"), path.resolve("/explicit"));
    // `--data-root` 忘了给值时是 true，按没给处理
    assert.equal(dataRootOf("/repo", true), path.resolve("/data"));
  } finally {
    if (prev === undefined) delete process.env.VRA_DATA_ROOT;
    else process.env.VRA_DATA_ROOT = prev;
  }
});
