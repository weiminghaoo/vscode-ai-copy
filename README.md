# AI Copy VS Code Extension

一个极简的 VS Code 扩展：把当前文件 / 选区快速复制成 AI 工具（Claude Code、Codex、ChatGPT 等）可直接识别的代码引用。

## 功能特性

- **一键复制引用**：快捷键或右键菜单，复制 `@路径` 形式的代码引用
- **自动带上行号**：选中代码后复制会带上行号范围，方便 AI 精确定位
- **可自定义快捷键**：通过设置项配置，自动同步到 VS Code

## 使用方法

### 复制引用

在编辑器中打开文件（可选中代码），然后：

- 使用快捷键（默认 **Mac** `Cmd+Option+K`，**Windows/Linux** `Ctrl+Alt+K`）
- 或在编辑器中右键选择 **Copy AI Reference**

复制结果格式：

| 场景 | 结果 |
| --- | --- |
| 未选中 | `@src/extension.ts` |
| 选中单行 | `@src/extension.ts#L37` |
| 选中多行 | `@src/extension.ts#L37-42` |

### 自定义快捷键

在设置中搜索 `ai-copy.keybinding`，填写 VS Code 快捷键语法（如 `cmd+shift+c`）。

修改后扩展会把它写进你的 `keybindings.json`，右键菜单里也会同步显示当前快捷键。

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 打包
npm run package
```

## 反馈

如有问题或建议，请访问 https://github.com/weiminghaoo/vscode-ai-copy/issues 提交 issue。