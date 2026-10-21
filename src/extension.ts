import * as vscode from 'vscode'

let port: number
let statusBarItem: vscode.StatusBarItem

export function activate(context: vscode.ExtensionContext) {
  // 获取当前项目路径
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('请先打开一个工作区')
    return
  }

  const projectPath = workspaceFolders[0].uri.fsPath
  const portKey = `opencode-port-${projectPath}`

  // 从全局状态获取或生成端口号
  const cachedPort = context.globalState.get<number>(portKey)
  if (cachedPort) {
    port = cachedPort
  } else {
    // 生成新的唯一端口号
    port = generateUniquePort(context.globalState)
    context.globalState.update(portKey, port)
  }
  console.log('opencode port:', port)

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBarItem.text = `$(terminal) oc:${port}`
  statusBarItem.tooltip = `复制 opencode[${port}] 启动命令`
  statusBarItem.command = 'opencode-conn.copyCommand'
  statusBarItem.show()

  // 复制命令
  const copyCommandDisposable = vscode.commands.registerCommand('opencode-conn.copyCommand', async () => {
    const command = `opencode --port ${port}`
    await vscode.env.clipboard.writeText(command)
    vscode.window.showInformationMessage(`已复制: ${command}`)
  })

  // 添加文件路径到终端
  let addFilepathDisposable = vscode.commands.registerCommand('opencode-conn.addFilepathToTerminal', async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }
      await vscode.env.clipboard.writeText(fileRef)
      vscode.window.showInformationMessage(`已复制文件路径`)
    // Wait for the terminal to be ready
    let tries = 3
    let connected = false
    do {
      try {
        await fetch(`http://localhost:${port}/app`)
        connected = true
        break
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 20))
      tries--
    } while (tries > 0)''

    // If connected, append the prompt to the terminal
    if (connected) {
      await appendPrompt(port, `In ${fileRef}`)
    }
  })

  context.subscriptions.push(copyCommandDisposable, addFilepathDisposable, statusBarItem)
}

async function appendPrompt(port: number, text: string) {
  await fetch(`http://localhost:${port}/tui/append-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
}

function getActiveFile() {
  const activeEditor = vscode.window.activeTextEditor
  if (!activeEditor) {
    return
  }

  const document = activeEditor.document
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) {
    return
  }

  // Get the relative path from workspace root
  const relativePath = vscode.workspace.asRelativePath(document.uri)
  let filepathWithAt = `@${relativePath}`

  // Check if there's a selection and add line numbers
  const selection = activeEditor.selection
  if (!selection.isEmpty) {
    // Convert to 1-based line numbers
    const startLine = selection.start.line + 1
    const endLine = selection.end.line + 1

    if (startLine === endLine) {
      // Single line selection
      filepathWithAt += `#L${startLine}`
    } else {
      // Multi-line selection
      filepathWithAt += `#L${startLine}-${endLine}`
    }
  }

  return filepathWithAt
}

function generateUniquePort(globalState: vscode.Memento): number {
  // 获取所有已使用的端口
  const allKeys = globalState.keys()
  const usedPorts = new Set<number>()

  for (const key of allKeys) {
    if (key.startsWith('opencode-port-')) {
      const port = globalState.get<number>(key)
      if (port) {
        usedPorts.add(port)
      }
    }
  }

  // 生成唯一的端口号
  let newPort: number
  do {
    newPort = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
  } while (usedPorts.has(newPort))

  return newPort
}

// This method is called when your extension is deactivated
export function deactivate() {
  statusBarItem?.dispose()
}
