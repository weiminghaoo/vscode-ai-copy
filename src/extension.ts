import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { getKeybindingsPath, resolveKeybinding, updateKeybindingsText } from './keybindings'

const COMMAND_ID = 'ai-copy.copyReference'
const CONFIG_KEYBINDING = 'keybinding'
const CUSTOM_KEYBINDING_CONTEXT = 'ai-copy.customKeybinding'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, copyReference))

  // 把自定义快捷键同步到用户 keybindings.json，让右键菜单能显示出来
  applyKeybinding(context).catch((error) => console.error(error))
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ai-copy.keybinding')) {
        applyKeybinding(context).catch((error) => console.error(error))
      }
    }),
  )
}

/**
 * 复制当前编辑器（或右键选中的文件）的 AI 引用。
 * 格式：@相对路径 / @相对路径#L12 / @相对路径#L12-30
 */
async function copyReference(resource?: vscode.Uri) {
  const reference = buildReference(resource)
  if (!reference) {
    vscode.window.showWarningMessage('AI Copy: 没有可引用的文件')
    return
  }

  await vscode.env.clipboard.writeText(reference)
  showTransientMessage(`已复制: ${reference}`, NOTIFICATION_TIMEOUT_MS)
}

/** 复制提示自动关闭的时间（毫秒）。VS Code 对进度通知有约 800ms 的最短显示时间。 */
const NOTIFICATION_TIMEOUT_MS = 1000

/**
 * VS Code 没有给通知提供超时参数，这里用 withProgress 的通知形式
 * 让提示在几秒后自动消失（代价是通知里会带一个进度环）。
 */
async function showTransientMessage(message: string, timeoutMs: number) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    () => new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  )
}

function buildReference(resource?: vscode.Uri): string | undefined {
  const editor = vscode.window.activeTextEditor

  // 优先使用当前编辑器，这样能带上选区行号
  if (editor) {
    const base = refFromUri(editor.document.uri)
    if (!base) {
      return undefined
    }

    const selection = editor.selection
    if (selection.isEmpty) {
      return base
    }

    const startLine = selection.start.line + 1
    const endLine = selection.end.line + 1
    return startLine === endLine ? `${base}#L${startLine}` : `${base}#L${startLine}-${endLine}`
  }

  // 回退：右键菜单传入的文件
  return resource ? refFromUri(resource) : undefined
}

function refFromUri(uri: vscode.Uri): string | undefined {
  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    return undefined
  }
  return `@${vscode.workspace.asRelativePath(uri)}`
}

/** 读取当前配置里的自定义快捷键（留空表示用插件默认绑定） */
function getConfiguredKeybinding(): string {
  return vscode.workspace.getConfiguration('ai-copy').get<string>(CONFIG_KEYBINDING, '').trim()
}

/**
 * 应用快捷键设置：
 * - 留空：走 package.json 里的平台默认绑定（mac 为 cmd+alt+k，其他为 ctrl+alt+k），
 *   并清掉 keybindings.json 里遗留的自定义条目
 * - 自定义：禁用默认绑定，把绑定写进 keybindings.json（右键菜单会显示该快捷键）
 */
async function applyKeybinding(context: vscode.ExtensionContext) {
  const configured = getConfiguredKeybinding()
  const isCustom = configured.length > 0

  await vscode.commands.executeCommand('setContext', CUSTOM_KEYBINDING_CONTEXT, isCustom)
  await syncKeybinding(context, isCustom ? resolveKeybinding(configured) : null)
}

/** 维护 keybindings.json 中归属本插件的那一条快捷键，keybinding 为 null 时删除 */
async function syncKeybinding(context: vscode.ExtensionContext, keybinding: string | null) {
  const filePath = getKeybindingsPath(context.globalStorageUri.fsPath)

  let text = '[]'
  try {
    text = await fs.promises.readFile(filePath, 'utf8')
  } catch {
    // 文件不存在时按空数组处理
  }
  if (!text.trim()) {
    text = '[]'
  }

  const updated = updateKeybindingsText(text, COMMAND_ID, keybinding)
  if (updated === undefined) {
    vscode.window.showWarningMessage('AI Copy: keybindings.json 解析失败，已跳过快捷键同步')
    return
  }
  if (updated === text) {
    return
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, updated, 'utf8')
}