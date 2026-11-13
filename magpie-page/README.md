# @lee-lipeng/page-vibe-astock

magpie 窗口里的一个说明页：把 [Vibe AStock](https://github.com/simonlin1212/vibe-astock) 接到本网关该填什么，
连地址、key、模型名一起给出来，并能读一次 `GET /v1/models` 显示实时模型清单。

安装（在 magpie 里）：**Plugins › Discover** 搜 “Vibe AStock”，或

```sh
magpie plugin add @lee-lipeng/page-vibe-astock
magpie plugin
```

## 页面做什么

- 显示网关地址 `http://127.0.0.1:3425/v1` 与本地 key `magpie`，一键复制。
- 给出装 Vibe AStock 插件的命令：`npx vibe-astock-magpie install`。
- 读一次 `/v1/models`，列出 `provider/model` 形式的模型 id，每个都能复制。
  浏览器跨域被拦时降级成一句说明 + `curl` 命令，不影响 Vibe AStock —— 它从本机后端直连网关。
- 底部链到 Vibe AStock、magpie 和本插件仓库。

## 权限与网络

- 不声明任何 `permissions`：不读 magpie 的用量、模型、账号。
- 唯一的网络请求是页面里的 `fetch('http://127.0.0.1:3425/v1/models')`，失败即降级，没有重试、没有上报。

## 发布

见主仓库的 [PUBLISH.md](../PUBLISH.md) 第 3 节：复制到 `magpie-community/plugins/packages/vibe-astock/`，
包名改成 `@magpie-community/page-vibe-astock`，`registry.json` 加 [`registry-entry.json`](../registry-entry.json) 那条。
