import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as jsonc from 'jsonc-parser'

const COMMAND_ID = 'ai-copy.copyReference'
const CONFIG_KEYBINDING = 'keybinding'
const DEFAULT_KEYBINDING = 'cmd+alt+k'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, copyReference))

  // 把自定义快捷键同步到用户 keybindings.json，让右键菜单能显示出来
  syncKeybinding(context).catch((error) => console.error(error))
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ai-copy.keybinding')) {
        syncKeybinding(context).catch((error) => console.error(error))
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
  vscode.window.showInformationMessage(`已复制: ${reference}`)
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

/** 把 cmd 翻译成 ctrl，保持 mac 与 win/linux 一致的默认手感 */
function resolveKeybinding(value: string): string {
  if (process.platform === 'darwin') {
    return value
  }
  return value.replace(/\bcmd\b/gi, 'ctrl')
}

function getKeybindingsPath(context: vscode.ExtensionContext): string {
  // globalStorageUri 形如 <userData>/User/globalStorage/<publisher>.<name>
  const userDir = path.dirname(path.dirname(context.globalStorageUri.fsPath))
  return path.join(userDir, 'keybindings.json')
}

/** 维护 keybindings.json 中归属本插件的那一条快捷键 */
async function syncKeybinding(context: vscode.ExtensionContext) {
  const configured = vscode.workspace
    .getConfiguration('ai-copy')
    .get<string>(CONFIG_KEYBINDING, DEFAULT_KEYBINDING)
  const keybinding = resolveKeybinding((configured || DEFAULT_KEYBINDING).trim())

  const filePath = getKeybindingsPath(context)

  let text = '[]'
  try {
    text = await fs.promises.readFile(filePath, 'utf8')
  } catch {
    // 文件不存在时按空数组处理
  }
  if (!text.trim()) {
    text = '[]'
  }

  const errors: jsonc.ParseError[] = []
  const parsed = jsonc.parse(text, errors, { allowTrailingComma: true }) as unknown
  if (errors.length > 0 || !Array.isArray(parsed)) {
    vscode.window.showWarningMessage('AI Copy: keybindings.json 解析失败，已跳过快捷键同步')
    return
  }

  const entries = parsed as Array<Record<string, unknown>>
  const index = entries.findIndex((entry) => entry?.command === COMMAND_ID)
  const desired = { key: keybinding, command: COMMAND_ID }

  if (
    index >= 0 &&
    entries[index].key === keybinding &&
    Object.keys(entries[index]).length === Object.keys(desired).length
  ) {
    return
  }

  const edits = jsonc.modify(text, [index >= 0 ? index : entries.length], desired, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  })
  const updated = jsonc.applyEdits(text, edits)
  if (updated === text) {
    return
  }

  await fs.promises.writeFile(filePath, updated, 'utf8')
}