# vibe-astock-magpie

Connect [Vibe AStock](https://github.com/simonlin1212/vibe-astock) — an A-share short-line review workbench — to a local
[magpie](https://github.com/yetone/magpie) gateway, plus a magpie page plugin that tells users what to paste.

Vibe AStock v2 speaks **OpenAI-compatible Chat Completions** only (`POST {base_url}/chat/completions`); magpie serves exactly
that at `http://127.0.0.1:3425/v1`. No product code has to change for the models to flow.

## Install

```sh
# inside the Vibe AStock checkout
npx vibe-astock-magpie install

# or point at it from anywhere
npx vibe-astock-magpie install --repo /path/to/vibe-astock
```

The installer:

1. probes `http://127.0.0.1:3425/v1/models` and writes `<repo>/.local/providers/magpie.json` with a working default model
   (prefers magpie's `auto/*` routing groups); a gateway that is not running is not fatal — the model is just left empty;
2. adds a **Magpie gateway** entry to the *Connect AI* model picker: five lines in two frontend files, each marked
   `// magpie-plugin`, idempotent and reversible.

Then restart Vibe AStock and fill in:

| Field | Value |
|---|---|
| Model picker | **Magpie 网关** |
| Base URL | `http://127.0.0.1:3425/v1` |
| Model | `auto/glm-5.3-flash` (any `provider/model` from `/v1/models`) |
| API Key | `magpie` — magpie's own local key, not an upstream vendor key |

Without the tool, the stock UI works too: *Connect AI → Other OpenAI-compatible endpoint*, same three values.

## Commands

```
vibe-astock-magpie install     [--repo DIR] [--base-url URL] [--model ID] [--key KEY] [--no-ui] [--force] [--dry-run]
vibe-astock-magpie uninstall   [--repo DIR]
vibe-astock-magpie verify      [--repo DIR] [--tests 1,2,7,8] [--model ID] [--write]
vibe-astock-magpie doctor      [--repo DIR]
```

`verify` reuses Vibe AStock's own provider matrix (`orchestrator/src/finance/provider_matrix.ts`): ten small rounds covering
text, single/chained/parallel tool calls, tool-error recovery, long output, a tool-free JSON closing turn, server-side JSON
Schema, multi-turn context and image input. Results land in `.local/provider-matrix/magpie/<time>/`; `--write` copies the
suggested `direct` block into the data-root template only.

## Measured (2026-11-13, model `auto/glm-5.3-flash`)

8 pass · 1 fail · 1 timeout: everything the six-stage research loop needs (tool calls, chaining, parallel calls, error
recovery, long output, multi-turn) passes; server-side JSON Schema is **not** enforced by this model, so structured output
falls back to prompt mode; image input timed out, so image-based material import is out. `direct.structured_output` is
therefore `"prompt"` — the product's own validators still check every artifact.

## The magpie page plugin

`magpie-page/` is a `page` package for magpie's Plugins tab: it shows the base URL, key and model naming to paste into
Vibe AStock, with copy buttons. It declares no permissions and makes no network requests of its own.
See [PUBLISH.md](PUBLISH.md) for the registry pull request.

## License

MIT. Not affiliated with Vibe AStock (Apache-2.0) or magpie (MIT).
