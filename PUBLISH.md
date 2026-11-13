# 发布

三处可以分别发：npm 包、GitHub 仓库、magpie 插件市场的 page 包。下面只用 git 和 npm 命令，`gh` 不是必需的。

## 0. 自检

```sh
npm test
node bin/cli.mjs doctor --repo /path/to/vibe-astock
node bin/cli.mjs install --repo /path/to/vibe-astock --dry-run
```

## 1. GitHub

先在网页上建一个空仓库（别勾 README / .gitignore），然后：

```sh
git remote add origin git@github.com:lee-lipeng/vibe-astock-magpie.git
git push -u origin main
```

换用户名或仓库名时，下面三处写死的 `lee-lipeng/vibe-astock-magpie` 要一起改：

- `package.json` 的 `repository`
- `README.md` / `README.en.md` 里两张截图的 raw 地址（用绝对地址是因为 npm 不解析相对图片）
- `magpie-page/package.json` 的 `repository`

## 2. npm

```sh
npm whoami                     # 没登录先 npm login
npm view vibe-astock-magpie    # 404 表示名字没被占
npm publish --access public
```

发完验证：`npx vibe-astock-magpie --help`。

## 3. magpie 插件市场

magpie 的 Plugins 页读 [`magpie-community/plugins`](https://github.com/magpie-community/plugins) 的 `registry.json`，
包体放在同仓库的 `packages/<名字>/`。

1. Fork `magpie-community/plugins`。
2. 把 `magpie-page/` 复制成 `packages/vibe-astock/`，包名改成 `@magpie-community/page-vibe-astock`，
   `repository.directory` 改成 `packages/vibe-astock`。
3. `registry.json` 加一条，内容抄 [`registry-entry.json`](registry-entry.json)：

   ```json
   {
     "package": "@magpie-community/page-vibe-astock",
     "name": "Vibe AStock",
     "kind": "page",
     "icon": null,
     "summary": {
       "en": "Wire Vibe AStock to this gateway: the base URL, key and model names to paste, in four steps",
       "zh": "把 Vibe AStock 接到本网关：该填的地址、key 和模型名，四步接完"
     }
   }
   ```

4. 本地验一遍（需要 Bun）：

   ```sh
   bun scripts/check.mjs vibe-astock
   magpie plugin add ./packages/vibe-astock && magpie plugin
   ```

5. 提 PR。说明里写清：这是 page，不是 provider；不声明任何 `permissions`；页面不发网络请求，所以不需要 `_magpie/bridge.js`。

## 4. 之后

```sh
npm version patch
git push --follow-tags
npm publish
```

page 包只在文案变化时才需要跟一次 PR，它不依赖 npm 版本。
