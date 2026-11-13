/**
 * 下拉补丁的纯函数测试：不碰真仓库，用一份最小的 ai-models.ts 样本。
 * 跑：npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import { MARK, applyPatchToText, patchesFor, revertPatchesFromText } from "../lib/patch.mjs";

const SAMPLE = `export type ProviderId =
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

function patchText(text, file, baseURL = "http://127.0.0.1:3425/v1") {
  let out = text;
  const states = [];
  for (const p of patchesFor(baseURL, "/repo").filter((x) => x.file.endsWith(file))) {
    const r = applyPatchToText(out, p);
    out = r.text;
    states.push({ id: p.id, state: r.state });
  }
  return { out, states };
}

test("五处补丁都能打上，且带标记", () => {
  const { out, states } = patchText(SAMPLE, "ai-models.ts");
  assert.deepEqual(states.map((s) => s.state), ["applied", "applied", "applied", "applied"]);
  assert.equal((out.match(new RegExp(MARK.replace("/", "\\/"), "g")) || []).length, 4);
  assert.match(out, /\| "magpie" \/\/ magpie-plugin/);
  assert.match(out, /magpie: "http:\/\/127\.0\.0\.1:3425\/v1"/);
  assert.match(out, /id: "magpie", name: "Magpie 网关"/);
  assert.match(out, /id === "custom" \|\| id === "magpie"/);
});

test("重复打补丁是幂等的（第二次全部 already）", () => {
  const once = patchText(SAMPLE, "ai-models.ts").out;
  const twice = patchText(once, "ai-models.ts");
  assert.deepEqual(twice.states.map((s) => s.state), ["already", "already", "already", "already"]);
  assert.equal(twice.out, once);
});

test("摘掉补丁后与原文一致", () => {
  const once = patchText(SAMPLE, "ai-models.ts").out;
  const back = revertPatchesFromText(once, patchesFor("", "/repo"));
  assert.equal(back, SAMPLE);
});

test("锚点缺失时不动文件（上游改结构也不改坏）", () => {
  const weird = "export type ProviderId = | \"a\";\n";
  const { out, states } = patchText(weird, "ai-models.ts");
  assert.equal(out, weird);
  assert.ok(states.every((s) => s.state === "anchor-missing"));
});

test("标签补丁单独文件也能打/摘", () => {
  const { out } = patchText(CONN_SAMPLE, "aiConnection.ts");
  assert.match(out, /magpie: "Magpie 网关"/);
  assert.match(out, /glm: "智谱 GLM API"/, "原来的标签不能被吃掉");
  assert.equal(revertPatchesFromText(out, patchesFor("", "/repo")), CONN_SAMPLE);
});

test("插入型补丁必须把锚点原样留在替换结果里（否则摘补丁会删掉别人的行）", () => {
  for (const p of patchesFor("http://127.0.0.1:3425/v1", "/repo")) {
    if (!p.find.endsWith("\n")) continue; // 改写整行的补丁靠 restore 还原
    assert.ok(p.replace.includes(p.find), `${p.id} 的 replace 里丢了锚点`);
  }
});

test("模板文件字段合法（env_key 大写、base_url 是本机 http）", async () => {
  const { readTemplate } = await import("../lib/install.mjs");
  const t = readTemplate();
  assert.equal(t.id, "magpie");
  assert.match(t.env_key, /^[A-Z][A-Z0-9_]*$/);
  assert.match(t.base_url, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  assert.equal(t.default_model, null, "通用模板不带默认模型，安装时才探测");
});
