# Notion 公式自动转换工具

> **社区维护版 v3.5.1** · Fork 自 [skyance/Notion-Formula-Auto-Conversion-Tool](https://github.com/skyance/Notion-Formula-Auto-Conversion-Tool)

将粘贴到 Notion 的 LaTeX 公式文本批量转换为 Notion 原生公式，减少逐条编辑的工作量。本 Fork 主要修复 Notion 新域名、悬浮按钮消失，以及块级公式转换问题。

> [!IMPORTANT]
> **已完成代码修改与 JavaScript 语法检查，但尚未在真实 Notion 页面完成端到端验证。** 请先复制页面备份，在测试页面验证后再批量使用。

## 💻 演示

原项目功能演示（**不是**本 Fork 的新版本测试）：

https://github.com/user-attachments/assets/b14c5afa-d8dc-4266-bc95-e6b8627f6643

## ✨ 功能

- **一键批量转换**：扫描当前页面中已加载的可编辑内容。
- **支持 LaTeX 定界符**：行内公式 `$...$`、`\(...\)`；块级公式 `$$...$$`、`\[...\]`。
- **悬浮按钮**：支持拖动、折叠、点击停止与转换进度显示。
- **快捷入口**：支持从 Tampermonkey 菜单启动转换，保留累计转换计数。
- **混排行公式降级**：独立占一行的块公式尝试转换为公式块；混在文字中的块级定界符按行内公式处理。
- **简单表格**：尝试识别部分简单表格的行内公式；不支持数据库表格。

## 🛠️ 安装（本 Fork）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 在 Tampermonkey 中**禁用原 Greasy Fork 版本**，避免重复运行。
3. 打开 [Fork 版本的脚本源码](https://raw.githubusercontent.com/printsdf/Notion-Formula-Auto-Conversion-Tool/main/Notion-Formula-Auto-Conversion-Tool.js)。
4. 如果浏览器没有弹出脚本安装界面，在 Tampermonkey 中选择「添加新脚本」，复制完整源码并保存。
5. 打开或刷新 [Notion](https://app.notion.com/) 页面。

本 Fork 的 `@updateURL` 和 `@downloadURL` 已指向本仓库 `main` 分支，避免旧版 Greasy Fork 更新覆盖修复内容。自动更新是否触发取决于 Tampermonkey 设置，也可以手动更新。

## 🎯 使用方法

将保留 LaTeX 定界符的文字粘贴到 Notion，点击右下角 **M 悬浮按钮**，或从 Tampermonkey 菜单执行「🔄 执行公式转换」。

**行内公式例子：**

~~~text
爱因斯坦质能方程 $E=mc^2$，也可写为 \(E=mc^2\)。
~~~

**块级公式例子（建议单独占一行）：**

~~~text
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
~~~

也支持 `\[ ... \]` 形式。按 `Esc` 或再次点击按钮可请求停止；已经完成的转换不会自动撤销。

### 从 AI 回答复制公式

建议要求 AI **保留原始 LaTeX/KaTeX 公式和 `$...$` / `$$...$$` 定界符**。不同模型网页的「复制回答」「复制 Markdown」行为可能不同，最好先确认粘贴到 Notion 后仍然保留定界符。必要时使用「复制 Markdown」或纯文本粘贴。

## 🔧 v3.5.1 修改记录

| 问题 | 修复方式 |
| --- | --- |
| [#16：Notion 更换域名](https://github.com/skyance/Notion-Formula-Auto-Conversion-Tool/issues/16) | 增加 `app.notion.com`，保留旧网址匹配 |
| [#15：悬浮图标消失](https://github.com/skyance/Notion-Formula-Auto-Conversion-Tool/issues/15) | 取消对旧顶部工具栏元素存在与否的强制判断 |
| [#17：块公式出现字面量 `/block equation`](https://github.com/skyance/Notion-Formula-Auto-Conversion-Tool/issues/17) | 改为逐字符输入 `/`，等待斜杠菜单，输入 `math` 并查找块级公式项 |
| 转换失败可能损坏内容 | 增加选区验证和部分失败恢复；不能保证所有故障场景都能自动恢复 |
| 对已有公式及代码区域的误扫描 | 排除部分公式块和代码块编辑区域 |

以上为代码层面的修复；**是否完全解决这些 Issues，仍需在用户的 Notion 页面中测试确认。**

## ⚠️ 已知限制

- 仅处理页面中当前已加载的可编辑内容；长文档中未渲染的部分可能不会扫描。
- **不支持数据库表格**；简单表格行内公式支持情况取决于 Notion 的 DOM 结构。
- 块级公式转换依赖 Notion 的斜杠菜单、菜单项名称和公式编辑器。Notion 改版后可能再次失效。
- 个别失败场景可能无法自动恢复文本；请先在复制页面中测试 `$x^2$` 和 `$$x^2$$`。
- 悬浮按钮不出现时，检查脚本启用状态、网址是否匹配以及 Tampermonkey 菜单的「悬浮按钮：显示」设置。
- 若公式被错误转换成普通文字，请停止批量运行并反馈 Notion 当前页面的表现。

发现问题请到 [本 Fork 的 Issues](https://github.com/printsdf/Notion-Formula-Auto-Conversion-Tool/issues) 提交反馈。

## 🤝 致谢与许可

基于 [原项目](https://github.com/skyance/Notion-Formula-Auto-Conversion-Tool) 维护。感谢 **skyance、0xstride、fengjy73、Sparidae、ckrvxr** 以及在 Issues 中反馈和提供修复思路的社区成员。

许可证沿用原项目，详见 [LICENSE](./LICENSE)。
