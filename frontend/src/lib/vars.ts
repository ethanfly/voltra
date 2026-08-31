// {{变量}} 替换引擎（纯函数，无副作用，可单测）
// 语法（PRD §7）：`{{` + 名称（[A-Za-z0-9_.$-]+）+ `}}`
// 规则：
//   - 作用域合并（请求 > 环境 > 项目 > 全局）由调用方完成，这里只认合并后的 map
//   - 未定义变量不替换、原样保留，并收集到 missing 供 UI 标红告警（ENV-4）
//   - 无闭合的 `{{x` 不视为变量
// 替换在前端发送前完成，Go 侧收到最终值，不感知变量

const VAR_TOKEN = /\{\{([A-Za-z0-9_.$-]+)\}\}/g

export interface ResolveResult {
  text: string
  /** 被成功替换的变量名（首次出现序，含重复） */
  replaced: string[]
  /** 未定义的变量名（去重，首次出现序） */
  missing: string[]
}

export function resolveVars(text: string, vars: Record<string, string>): ResolveResult {
  if (!text || text.indexOf('{{') === -1) {
    return { text, replaced: [], missing: [] }
  }
  const replaced: string[] = []
  const missingSet = new Set<string>()
  const out = text.replace(VAR_TOKEN, (whole, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      replaced.push(name)
      return vars[name]
    }
    missingSet.add(name)
    return whole
  })
  return { text: out, replaced, missing: [...missingSet] }
}

/** 提取文本中的变量名（去重、保持首次出现序），用于 UI 高亮与"引用了哪些变量"提示 */
export function extractVarNames(text: string): string[] {
  if (!text) return []
  const names: string[] = []
  const seen = new Set<string>()
  const re = new RegExp(VAR_TOKEN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      names.push(m[1])
    }
  }
  return names
}

/** 文本中变量 token 的位置列表（含未闭合之外的全部合法 token），供装饰/切段用 */
export interface VarToken {
  name: string
  /** 含 `{{` 的起始偏移 */
  start: number
  /** 含 `}}` 的末尾偏移（exclusive） */
  end: number
}

export function findVarTokens(text: string): VarToken[] {
  if (!text || text.indexOf('{{') === -1) return []
  const out: VarToken[] = []
  const re = new RegExp(VAR_TOKEN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** 切段：普通文本 / 变量 token（带 name），用于把高亮 span 叠在原始文本上 */
export interface VarSegment {
  text: string
  /** 非空表示该段是变量 token */
  name?: string
}

export function segmentVars(text: string): VarSegment[] {
  const toks = findVarTokens(text)
  if (!toks.length) return text ? [{ text }] : []
  const out: VarSegment[] = []
  let pos = 0
  for (const t of toks) {
    if (t.start > pos) out.push({ text: text.slice(pos, t.start) })
    out.push({ text: text.slice(t.start, t.end), name: t.name })
    pos = t.end
  }
  if (pos < text.length) out.push({ text: text.slice(pos) })
  return out
}

/** 文本中未定义的变量名（去重、首次出现序）；vars 为合并后的作用域 map */
export function missingVarNames(text: string, vars: Record<string, string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of findVarTokens(text)) {
    if (!seen.has(t.name) && !Object.prototype.hasOwnProperty.call(vars, t.name)) {
      seen.add(t.name)
      out.push(t.name)
    }
  }
  return out
}
