/**
 * 这个模块是纯函数，不依赖 vscode，方便单独测试。
 * 用于在保留注释与原有格式的前提下，维护 keybindings.json 里属于本插件的那一条。
 */

import * as path from 'path'

/** 跳过空白、行注释与块注释 */
function skipWsAndComments(text: string, i: number): number {
  while (i < text.length) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++
      }
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++
      }
      i += 2
    } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
    } else {
      break
    }
  }
  return i
}

/** text[i] 必须是引号，返回闭合引号之后的位置 */
function scanString(text: string, i: number): number {
  i++
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '"') {
      return i + 1
    }
    i++
  }
  return i
}

/** 从位置 i 开始跳过一个完整的 JSON 值，返回其结束位置 */
function scanValue(text: string, i: number): number {
  i = skipWsAndComments(text, i)
  const ch = text[i]

  if (ch === '"') {
    return scanString(text, i)
  }

  if (ch === '{' || ch === '[') {
    const close = ch === '{' ? '}' : ']'
    i++
    while (i < text.length) {
      i = skipWsAndComments(text, i)
      const c = text[i]
      if (c === close) {
        return i + 1
      }
      if (c === '"') {
        i = scanString(text, i)
      } else if (c === '{' || c === '[') {
        i = scanValue(text, i)
      } else {
        i++
      }
    }
    return i
  }

  while (i < text.length && ',]} \t\n\r'.indexOf(text[i]) === -1) {
    i++
  }
  return i
}

interface Span {
  start: number
  end: number
}

interface RootArray {
  elements: Span[]
  openBracket: number
  closeBracket: number
  trailingComma: boolean
}

/** 解析根数组，返回每个顶层元素的区间与括号位置；不是数组时返回 undefined */
function parseRootArray(text: string): RootArray | undefined {
  const openBracket = skipWsAndComments(text, 0)
  if (text[openBracket] !== '[') {
    return undefined
  }

  let i = openBracket + 1
  const elements: Span[] = []
  let trailingComma = false
  for (;;) {
    i = skipWsAndComments(text, i)
    const c = text[i]
    if (c === undefined) {
      return undefined
    }
    if (c === ']') {
      return { elements, openBracket, closeBracket: i, trailingComma }
    }

    const start = i
    const end = scanValue(text, start)
    elements.push({ start, end })

    trailingComma = false
    i = skipWsAndComments(text, end)
    if (text[i] === ',') {
      trailingComma = true
      i++
    }
  }
}

/** 解析对象里的顶层属性，返回 key -> 值区间 */
function parseObjectProps(text: string, span: Span): Map<string, Span> {
  const props = new Map<string, Span>()
  let i = skipWsAndComments(text, span.start)
  if (text[i] !== '{') {
    return props
  }

  i++
  for (;;) {
    i = skipWsAndComments(text, i)
    const c = text[i]
    if (c === undefined || c === '}') {
      return props
    }

    if (c !== '"') {
      i = scanValue(text, i)
      i = skipWsAndComments(text, i)
      if (text[i] === ',') {
        i++
      }
      continue
    }

    const keyStart = i
    const keyEnd = scanString(text, i)
    let key = ''
    try {
      key = JSON.parse(text.slice(keyStart, keyEnd)) as string
    } catch {
      key = text.slice(keyStart + 1, keyEnd - 1)
    }

    i = skipWsAndComments(text, keyEnd)
    if (text[i] === ':') {
      i++
    }
    i = skipWsAndComments(text, i)
    const valueStart = i
    const valueEnd = scanValue(text, valueStart)
    props.set(key, { start: valueStart, end: valueEnd })

    i = skipWsAndComments(text, valueEnd)
    if (text[i] === ',') {
      i++
    }
  }
}

/**
 * 在 keybindings.json 文本里更新/追加/删除指定命令的快捷键。
 * - 保留文件里的注释、其他绑定与整体格式
 * - `keybinding` 传 null 表示删除该条（恢复使用插件默认绑定）
 * - 内容无需变化时返回原文本
 * - 无法解析（不是数组）时返回 undefined
 */
export function updateKeybindingsText(
  text: string,
  commandId: string,
  keybinding: string | null,
): string | undefined {
  const root = parseRootArray(text)
  if (!root) {
    return undefined
  }

  const quotedCommand = JSON.stringify(commandId)

  let index = -1
  let props: Map<string, Span> | undefined
  for (let i = 0; i < root.elements.length; i++) {
    const candidate = parseObjectProps(text, root.elements[i])
    const command = candidate.get('command')
    if (command && text.slice(command.start, command.end) === quotedCommand) {
      index = i
      props = candidate
      break
    }
  }

  // 删除：恢复默认绑定时用
  if (keybinding === null) {
    return index < 0 ? text : removeElement(text, root, index)
  }

  const quotedKey = JSON.stringify(keybinding)

  if (index >= 0 && props) {
    const key = props.get('key')
    if (key) {
      if (text.slice(key.start, key.end) === quotedKey) {
        return text
      }
      return text.slice(0, key.start) + quotedKey + text.slice(key.end)
    }

    // 有 command 但没有 key，就在对象开头补一个
    const element = root.elements[index]
    return text.slice(0, element.start + 1) + ` "key": ${quotedKey},` + text.slice(element.start + 1)
  }

  // 没有找到，追加一条
  const separator = root.elements.length > 0 && !root.trailingComma ? ',' : ''
  const entry = `{\n    "key": ${quotedKey},\n    "command": ${quotedCommand}\n  }`

  // 插到右括号前，并替换掉右括号前的空白，避免出现 "} ," 或多余空行
  let insertAt = root.closeBracket
  while (insertAt > 0 && ' \t\r\n'.indexOf(text[insertAt - 1]) !== -1) {
    insertAt--
  }

  const insertion = `${separator}\n  ${entry}\n`
  return text.slice(0, insertAt) + insertion + text.slice(root.closeBracket)
}

/** 删掉第 index 个元素，并顺带清掉一个逗号与多余空白 */
function removeElement(text: string, root: RootArray, index: number): string {
  const element = root.elements[index]
  const next = root.elements[index + 1]
  const prev = root.elements[index - 1]

  if (next) {
    // 连同后面的逗号与缩进一起删掉
    return text.slice(0, element.start) + text.slice(next.start)
  }
  if (prev) {
    // 最后一个元素：连同前面的逗号一起删掉
    return text.slice(0, prev.end) + text.slice(element.end)
  }
  // 唯一元素：只留下空数组
  return text.slice(0, root.openBracket + 1) + text.slice(element.end)
}

/** 非 macOS 平台把 cmd 翻译成 ctrl，保持各平台默认手感一致 */
export function resolveKeybinding(value: string, platform: string = process.platform): string {
  if (platform === 'darwin') {
    return value
  }
  return value.replace(/\bcmd\b/gi, 'ctrl')
}

/** 由 globalStorageUri 反推 keybindings.json 的位置 */
export function getKeybindingsPath(globalStorageFsPath: string): string {
  return path.join(path.dirname(path.dirname(globalStorageFsPath)), 'keybindings.json')
}