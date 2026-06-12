# opencode-conn VS Code Extension

一个 Visual Studio Code 扩展，用于将 [opencode](https://opencode.ai) 与你的开发工作流集成。

## 功能特性

- **端口管理**: 扩展启动时自动生成唯一端口号，根据项目路径缓存，确保同一项目使用相同端口
- **状态栏显示**: 在 VS Code 状态栏显示当前端口号，点击可复制 `opencode --port xxx` 命令
- **文件引用**: 使用快捷键快速将当前文件路径和选区添加到 opencode

## 使用方法

### 1. 安装前置条件

确保已安装 [opencode CLI](https://opencode.ai)

### 2. 启动 opencode

点击状态栏中的 `opencode:端口号`，复制启动命令，然后在终端中运行：

```bash
opencode --port <端口号>
```

### 3. 添加文件引用

在编辑器中打开文件并选择代码（可选），使用快捷键：

- **Mac**: `Cmd+Option+K`
- **Windows/Linux**: `Ctrl+Alt+K`

文件引用会自动添加到 opencode，格式如：

- `@src/extension.ts` - 当前文件
- `@src/extension.ts#L37` - 单行选区
- `@src/extension.ts#L37-42` - 多行选区

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

如有问题或建议，请访问 https://github.com/weiminghaoo/opencode-conn/issues 提交 issue。
