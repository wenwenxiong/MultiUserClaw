/**
 * FileDownloadPlugin — 独立插件，用于在 Markdown 渲染中识别工作区文件路径并渲染为可下载的文件卡片。
 *
 * 使用方式：
 *   import { fileDownloadLinkRenderer } from './FileDownloadPlugin'
 *   // 在 ReactMarkdown components 中：
 *   a: fileDownloadLinkRenderer
 *
 * 识别规则：
 *   - markdown 链接 href 匹配工作区路径模式（workspace/, workspace-xxx/, 或 ~/.openclaw/ 前缀）
 *   - 纯文本中的路径由 remarkFileLinks remark 插件自动转为链接
 */

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileImage, File, Loader2 } from 'lucide-react'
import { getAccessToken } from '../lib/api'

// ---------------------------------------------------------------------------
// 路径识别
// ---------------------------------------------------------------------------

/**
 * 匹配工作区文件路径的模式。
 * 覆盖以下格式：
 *   workspace/output.xlsx
 *   workspace-programmer/output.xlsx
 *   ~/.openclaw/workspace/output.xlsx
 *   /root/.openclaw/workspace/output.xlsx
 *   /home/user/.openclaw/workspace/output.xlsx
 */
const WORKSPACE_PATH_RE =
  /(?:(?:\/[\w.-]+)*\/\.openclaw\/|~\/\.openclaw\/)?workspace(?:-[\w-]+)?\/\S+\.\w{1,10}/

/** 常见文件扩展名 → 确保不误匹配普通单词 */
const FILE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
  'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp',
  'zip', 'tar', 'gz', 'rar', '7z',
  'mp3', 'wav', 'mp4', 'avi', 'mov',
  'py', 'js', 'ts', 'html', 'css',
])

/** 判断一个 href 是否是工作区文件路径 */
export function isWorkspacePath(href: string): boolean {
  if (!href) return false
  // 排除 http(s) 链接
  if (/^https?:\/\//i.test(href)) return false
  // 匹配 workspace/ 或 ~/.openclaw/ 前缀
  return WORKSPACE_PATH_RE.test(href)
}

/**
 * 从路径中提取用于下载 API 的相对路径。
 * 去掉所有 .openclaw/ 之前的前缀，保留 workspace... 部分。
 * 例：
 *   /root/.openclaw/workspace/out/file.md → workspace/out/file.md
 *   ~/.openclaw/workspace/out/file.md     → workspace/out/file.md
 *   workspace/out/file.md                 → workspace/out/file.md
 */
function toDownloadPath(href: string): string {
  // 先尝试解码，防止路径已经被 URL 编码过（如 AI 输出了编码后的路径）
  let decoded = href
  try {
    // 循环解码直到不再变化（处理双重编码）
    let prev = ''
    while (decoded !== prev && decoded.includes('%')) {
      prev = decoded
      decoded = decodeURIComponent(decoded)
    }
  } catch { /* 解码失败就用原始值 */ }
  const match = decoded.match(/workspace(?:-[\w-]+)?\/\S+/)
  return match ? match[0] : decoded
}

/** 从文件名获取扩展名 */
function getExt(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/** 根据扩展名选择图标 */
function FileIcon({ ext }: { ext: string }) {
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return <FileSpreadsheet size={18} className="text-green-400" />
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext))
    return <FileImage size={18} className="text-purple-400" />
  if (['doc', 'docx', 'pdf', 'txt', 'md'].includes(ext))
    return <FileText size={18} className="text-blue-400" />
  return <File size={18} className="text-gray-400" />
}

// ---------------------------------------------------------------------------
// 下载卡片组件
// ---------------------------------------------------------------------------

function FileDownloadCard({ href, children }: { href: string; children: React.ReactNode }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const downloadPath = toDownloadPath(href)
  // 解码文件名，确保显示和下载时用原始名称
  let filename = downloadPath.split('/').pop() || downloadPath
  try { filename = decodeURIComponent(filename) } catch { /* ignore */ }
  const ext = getExt(filename)

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (downloading) return

    setDownloading(true)
    setError('')
    try {
      const token = getAccessToken()
      // 确保路径是完全解码的，再做一次编码，避免双重编码
      let cleanPath = downloadPath
      try {
        let prev = ''
        while (cleanPath !== prev && cleanPath.includes('%')) {
          prev = cleanPath
          cleanPath = decodeURIComponent(cleanPath)
        }
      } catch { /* ignore */ }
      const url = `/api/openclaw/filemanager/download?path=${encodeURIComponent(cleanPath)}`
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(url, { headers })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail || `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      // 延迟 revoke，避免浏览器还没开始下载就被回收
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
        document.body.removeChild(a)
      }, 1000)
    } catch (err: any) {
      console.error('文件下载失败:', err)
      setError('下载失败')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      title={href}
      className="inline-flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg/60 hover:bg-dark-bg hover:border-accent-blue/40 transition-all cursor-pointer group disabled:opacity-60"
    >
      <FileIcon ext={ext} />
      <span className="text-xs text-dark-text group-hover:text-accent-blue transition-colors truncate max-w-[200px]">
        {typeof children === 'string' ? children : filename}
      </span>
      {downloading ? (
        <Loader2 size={14} className="animate-spin text-accent-blue shrink-0" />
      ) : error ? (
        <span className="text-[10px] text-accent-red shrink-0">{error}</span>
      ) : (
        <Download size={14} className="text-dark-text-secondary group-hover:text-accent-blue transition-colors shrink-0" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// 导出：ReactMarkdown 的 a 渲染器
// ---------------------------------------------------------------------------

/**
 * 用作 ReactMarkdown 的 components.a。
 * 工作区路径 → 文件下载卡片，其他链接 → 正常渲染。
 */
export function fileDownloadLinkRenderer({
  href,
  children,
}: {
  href?: string
  children?: React.ReactNode
}) {
  if (href && isWorkspacePath(href)) {
    return <FileDownloadCard href={href}>{children}</FileDownloadCard>
  }

  // 普通链接：保持原样
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// 导出：remark 插件 — 自动将纯文本中的工作区路径转为链接
// ---------------------------------------------------------------------------

/**
 * remark 插件：扫描文本节点，将匹配工作区路径模式的纯文本自动转为 markdown 链接。
 * 这样即使 AI 没有用 [text](url) 格式，只是写了路径，也能被识别。
 */
export function remarkFileLinks() {
  const GLOBAL_RE =
    /(?:(?:\/[\w.-]+)*\/\.openclaw\/|~\/\.openclaw\/)?workspace(?:-[\w-]+)?\/[\w.\/\-\u4e00-\u9fff]+\.\w{1,10}/g

  return (tree: any) => {
    // 处理普通文本节点
    visit(tree, 'text', (node: any, index: number | null, parent: any) => {
      if (!parent || index === null) return
      if (parent.type === 'link') return

      const value: string = node.value
      const matches = [...value.matchAll(GLOBAL_RE)]
      if (matches.length === 0) return

      const children: any[] = []
      let lastEnd = 0

      for (const match of matches) {
        const start = match.index!
        const end = start + match[0].length
        const path = match[0]
        const ext = getExt(path)

        // 只处理已知文件扩展名，避免误匹配
        if (!FILE_EXTENSIONS.has(ext)) continue

        if (start > lastEnd) {
          children.push({ type: 'text', value: value.slice(lastEnd, start) })
        }

        const filename = path.split('/').pop() || path
        children.push({
          type: 'link',
          url: path,
          children: [{ type: 'text', value: filename }],
        })

        lastEnd = end
      }

      if (children.length === 0) return

      if (lastEnd < value.length) {
        children.push({ type: 'text', value: value.slice(lastEnd) })
      }

      parent.children.splice(index, 1, ...children)
    })

    // 处理行内代码节点（AI 经常用反引号包裹路径）
    visit(tree, 'inlineCode', (node: any, index: number | null, parent: any) => {
      if (!parent || index === null) return
      const value: string = node.value
      GLOBAL_RE.lastIndex = 0
      const match = GLOBAL_RE.exec(value)
      if (!match) return
      const path = match[0]
      const ext = getExt(path)
      if (!FILE_EXTENSIONS.has(ext)) return
      const filename = path.split('/').pop() || path
      // 替换整个 inlineCode 节点为 link 节点
      parent.children.splice(index, 1, {
        type: 'link',
        url: path,
        children: [{ type: 'text', value: filename }],
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Minimal AST visitor (避免额外依赖 unist-util-visit)
// ---------------------------------------------------------------------------

function visit(tree: any, type: string, fn: (node: any, index: number | null, parent: any) => void) {
  function walker(node: any, index: number | null, parent: any) {
    if (node.type === type) {
      fn(node, index, parent)
    }
    if (node.children) {
      // 倒序遍历，因为 splice 可能改变长度
      for (let i = node.children.length - 1; i >= 0; i--) {
        walker(node.children[i], i, node)
      }
    }
  }
  walker(tree, null, null)
}
