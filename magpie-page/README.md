# @lee-lipeng/page-vibe-astock

magpie 窗口里的一个说明页：把 [Vibe AStock](https://github.com/simonlin1212/vibe-astock) 接到本网关，四步接完 ——
该填的地址、key、模型名都摆出来，一键复制。

安装（在 magpie 里）：**Plugins › Discover** 搜 “Vibe AStock”，或

```sh
magpie plugin add @lee-lipeng/page-vibe-astock
magpie plugin
```

本地开发时可以直接装目录：

```sh
magpie plugin add ./magpie-page
```

## 页面做什么

1. 网关地址 `http://127.0.0.1:3425/v1` 与本地 key `magpie`，一键复制。
2. 给出接 Vibe AStock 的命令：`npx vibe-astock-magpie install`。
3. 表格列出 Base URL / Model / API Key 三项该填什么（模型名到 magpie 自己的模型列表里复制）。
4. 提醒点「测试并保存」，并写明已知边界：服务端 JSON Schema 不生效（走提示词）、图片输入不支持。

底部链到 Vibe AStock、magpie 和插件主仓库。

## 权限与网络

- **不声明任何 `permissions`**：不读用量、模型、账号，不碰 magpie 的会话与资料库。
- **不发任何网络请求**：页面里没有 `fetch`。magpie 的网关不带 CORS 头，页面里读 `/v1/models` 一定会被浏览器拦下，
  所以不摆这个按钮；模型名在 magpie 的模型列表里复制即可。
- 不引入外部字体、图片或脚本，深浅色跟随 `prefers-color-scheme`。

## 发布

见主仓库的 [PUBLISH.md](../PUBLISH.md) 第 3 节：复制到 `magpie-community/plugins/packages/vibe-astock/`，
包名改成 `@magpie-community/page-vibe-astock`，`registry.json` 加 [`registry-entry.json`](../registry-entry.json) 那条。
