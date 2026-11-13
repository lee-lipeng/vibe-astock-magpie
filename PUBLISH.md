# 发布

三件东西可以分别发：**npm 包**（别人 `npx vibe-astock-magpie` 就能装）、**GitHub 仓库**（源码与 issue）、
**magpie 插件市场的 page 包**（在 magpie 的 Plugins 页被搜到）。

`gh` 不是必需的，下面用 git 和 npm 的命令；有 `gh` 的话每条都能少一步。

---

## 0. 先自检

```sh
npm test                     # 7 项：补丁幂等、可逆、锚点缺失安全、模板字段
node bin/cli.mjs doctor --repo /path/to/vibe-astock
node bin/cli.mjs install --repo /path/to/vibe-astock --dry-run
```

## 1. GitHub

仓库名建议 `vibe-astock-magpie`（`package.json` 的 `repository` 已经指向 `lee-lipeng/vibe-astock-magpie`，换名字要一起改）。

```sh
git init -b main
git add -A
git commit -m "feat: connect Vibe AStock to a magpie gateway (provider template + UI preset + magpie page)"
git remote add origin git@github.com:lee-lipeng/vibe-astock-magpie.git
git push -u origin main
```

没有现成仓库时，先在 github.com 新建一个空仓库（不要勾 README / .gitignore，否则要先 pull）。

## 2. npm

```sh
npm whoami                     # 没登录先 npm login
npm view vibe-astock-magpie    # 404 = 名字没被占；被占就换名或改成 @lee-lipeng/vibe-astock-magpie
npm publish --access public
```

发完验证：

```sh
npx vibe-astock-magpie@0.1.0 --help
```

> 改了 `package.json` 的 `name` 记得同步 `bin/cli.mjs` 里的帮助文本和 README 里的 `npx` 命令。

## 3. magpie 插件市场（page 包）

magpie 的 Plugins 页读的是 [`magpie-community/plugins`](https://github.com/magpie-community/plugins) 的 `registry.json`，
包体放在同一个仓库的 `packages/<名字>/` 下。流程：

1. Fork `magpie-community/plugins`。
2. 把本仓库的 `magpie-page/` 整个复制成 `packages/vibe-astock/`，并把 `package.json` 的 `name` 改成
   `@magpie-community/page-vibe-astock`（社区包的命名约定；`repository.directory` 改成 `packages/vibe-astock`）。
3. 在 `registry.json` 里加一条（[`registry-entry.json`](registry-entry.json) 是现成的条目，直接抄）：

   ```json
   {
     "package": "@magpie-community/page-vibe-astock",
     "name": "Vibe AStock",
     "kind": "page",
     "icon": null,
     "summary": {
       "en": "Wire Vibe AStock to this gateway: base URL, key and model names to paste, with a live model list",
       "zh": "把 Vibe AStock 接到本网关：该填的地址、key 和模型名，带实时模型清单"
     }
   }
   ```

4. 本地验一遍（需要 Bun）：

   ```sh
   bun scripts/check.mjs vibe-astock
   magpie plugin add ./packages/vibe-astock && magpie plugin
   ```

5. 提 PR，说明里写清：装的是什么（Vibe AStock 的 page，不是 provider）、不声明任何 `permissions`、
   页面只读 `127.0.0.1:3425/v1/models`（跨域失败会降级成文字说明，不影响任何功能）。

> page 包不接任何账号、不发请求，所以 `registry.json` 里 `"kind": "page"` 且没有 `providers` 字段 ——
> 这正是社区仓库 README「The market」那节描述的无登录条目。

## 4. 之后每次发版

```sh
npm version patch|minor|major
git push --follow-tags
npm publish
```

magpie 那边的 page 包只在页面文案变化时才需要跟着提 PR（它不依赖 npm 包版本）。
