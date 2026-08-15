# dsh-plugin-ponytail

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面的鞭子彩蛋插件，灵感来自 Claude Code 的 "ponytail" 小鞭子。在输入框底部的 composer dock 里放一个开关按钮，点击后鼠标变成一根跟随指针的鞭子；在对话输出区点击时，鞭子按物理效果抽动（带刚性杆子、重力下垂尾部的 verlet 物理 + 随机爆裂声 + 火花），并给模型发送一条催促加快工作的消息。

## 功能

- 在 `conversation.composer.dock` 区域（composer 卡片下方）新增 `🪢 鞭子` 按钮。
- 开启后，系统光标被一根鞭子取代：手柄固定在 135°（左上方向），身体由根部的硬杆渐变到尾部的软鞭，尾部受重力下垂。
- 在对话区（而非输入框）点击，鞭子抽响，并通过输入机发送一条催促消息（多套文案轮换，不连续重复）。
- 爆裂声随机播放插件自身 `public/` 目录下的 MP3（`whip1..4.mp3`），由客户端插件宿主提供，不依赖 Web 应用自身资源。

## 安装

这是面向 dsh web profile 的**客户端 bundle 插件**。在 `~/.dsh/profiles/web/package.json` 里分两处添加：

**1. 作为依赖**（从本仓库安装）：

```json
{
  "dependencies": {
    "dsh-client-ui-ponytail": "github:makuralymi/dsh-plugin-ponytail"
  }
}
```

本地开发则用路径链接：

```json
{
  "dependencies": {
    "dsh-client-ui-ponytail": "link:/path/to/dsh-plugin-ponytail"
  }
}
```

**2. 加入 bundle 列表**，放在 `@deepseek-ai/dsh-web-app` 之后：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-client-ui-ponytail"
      ]
    }
  }
}
```

然后在 profile 目录执行 `pnpm install` 并重启 `dsh web`。插件的 `cordis.patch.yml` 会自动插入插件行；浏览器半区通过 `dsh.client` 发布，由 client-modules 宿主发现。

## 使用

重启 GUI 并刷新页面。点击 composer 下方的 `🪢 鞭子` 打开鞭子模式，然后在对话区任意位置点击抽鞭。按 `Esc` 或再次点击开关即可关闭。

## 从源码构建

该插件在 DeepSeek Harness 工作区内构建（依赖共享的 tsdown 客户端 bundle 预设）：

```sh
pnpm install
pnpm --filter dsh-client-ui-ponytail bundle
```

仓库已随附 `lib/` 预构建产物，只有修改 `src/` 时才需要重新构建。

## 目录结构

- `src/client/` — 浏览器半区（dock 条目、鞭子物理、爆裂声、催促文案）。
- `src/index.ts` — Node 半区（空 `apply`，纯 UI 插件）。
- `public/` — 爆裂声文件（`whip1..4.mp3`），由 `/plugins/<id>/public/` 提供。
- `cordis.patch.yml` — 将插件行插入 web profile。

## 许可证

MIT
