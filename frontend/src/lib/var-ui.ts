// {{变量}} UI 辅助：未定义检测 + 原生悬浮提示文本（ENV-4/5）
// 输入框类控件无法在文本内部渲染装饰，用「红色波浪下划线 + title」表达：
//   - 含未定义变量 → 输入框加 .var-bad 类（波浪红线），title 标注哪些未定义
//   - 全部已定义 → title 列出 `名称 = 当前值`（secret 打码）
import { extractVarNames } from './vars'
import { varMeta } from '../stores/env'

/** 文本中未定义的变量名（去重、首次出现序）；无变量或全部已定义返回空 */
export function missingIn(text: string): string[] {
  const names = extractVarNames(text)
  if (!names.length) return []
  return names.filter((n) => !varMeta(n).defined)
}

/** 输入框 title：文本含变量时返回逐行 `名称 = 值`（未定义/打码标注），否则 undefined */
export function varTitle(text: string): string | undefined {
  const names = extractVarNames(text)
  if (!names.length) return undefined
  return names
    .map((n) => {
      const m = varMeta(n)
      return m.defined ? `${n} = ${m.display}` : `${n}（未定义）`
    })
    .join('\n')
}
