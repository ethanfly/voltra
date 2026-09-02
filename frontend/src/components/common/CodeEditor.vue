<script setup lang="ts">
// CodeMirror 6 封装：语言（json/xml/html/javascript/text）、JSON lint、format 暴露
// 主题只用 CSS 变量（var(--bg-sunken) 等），明暗切换无需重建编辑器
// {{变量}} 高亮（ENV-4/5）：已定义=品牌色、未定义=红色波浪线，title 悬浮当前值（secret 打码）；
// 响应查看器传 var-highlight=false（响应体里的 `{{` 是合法文本，不应告警）
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, keymap, Decoration, lineNumbers } from '@codemirror/view'
import {
  EditorState,
  Compartment,
  StateEffect,
  StateField,
  RangeSet,
  RangeSetBuilder,
  type Extension,
  type Text,
} from '@codemirror/state'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { linter, lintGutter } from '@codemirror/lint'
import { findVarTokens } from '../../lib/vars'
import { env, currentEnv, varMeta } from '../../stores/env'
import { currentProject } from '../../stores/workspace'

export type CodeLang = 'json' | 'xml' | 'html' | 'javascript' | 'text'

const props = withDefaults(defineProps<{
  modelValue: string
  language?: CodeLang
  height?: number | string
  readOnly?: boolean
  placeholder?: string
  varHighlight?: boolean
  lineNumbers?: boolean
}>(), { language: 'text', height: '100%', readOnly: false, placeholder: '', varHighlight: true, lineNumbers: false })

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

function langExt(lang: CodeLang): Extension[] {
  switch (lang) {
    case 'json':
      return [json(), lintGutter(), jsonLinter()]
    case 'xml':
      return [xml()]
    case 'html':
      return [html()]
    case 'javascript':
      return [javascript()]
    default:
      return []
  }
}

/** raw JSON 的轻量 lint：解析失败整篇标红（{{变量}} 未替换时同样会报错，属预期提示） */
function jsonLinter() {
  return linter((view) => {
    const doc = view.state.doc.toString()
    if (!doc.trim()) return []
    try {
      JSON.parse(doc)
      return []
    } catch (e) {
      return [
        {
          from: 0,
          to: view.state.doc.length,
          severity: 'error',
          message: (e as Error).message,
        },
      ]
    }
  })
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--bg-sunken)',
    color: 'var(--text)',
  },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  // 左右留白：原 '6px 0' 文字贴左右边缘（用户实测反馈"看着难受"）；一处改动作用于
  // 所有 CM6 用法（脚本 / Body raw / GraphQL / 响应 Pretty / 代码生成 / WS 输入）
  '.cm-content': { padding: '8px 14px' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-sunken)',
    color: 'var(--text-faint)',
    border: 'none',
    paddingLeft: '4px',
  },
  '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
  '.cm-activeLineGutter': { color: 'var(--text-dim)' },
  '.ce-var': { color: 'var(--brand)', fontWeight: '600' },
  '.ce-var-bad': {
    color: 'var(--error)',
    textDecoration: 'underline wavy var(--error)',
  },
  '&.cm-focused': { outline: 'none' },
  // 光标颜色/宽度在 <style scoped> 的 :deep(.cm-cursor) 用 !important 强制（主题对象写法未生效）
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--brand-weak)',
  },
})

const wrap = ref<HTMLElement | null>(null)
let view: EditorView | null = null

const readOnlyComp = new Compartment()

// ---------- {{变量}} 高亮 ----------
/** 环境/项目/全局变量变更时由外部 dispatch 该 effect，触发装饰重算 */
const varRecompute = StateEffect.define()

function computeVarSet(doc: Text): RangeSet<Decoration> {
  const toks = findVarTokens(doc.toString())
  if (!toks.length) return RangeSet.empty
  const b = new RangeSetBuilder<Decoration>()
  for (const t of toks) {
    const m = varMeta(t.name)
    const deco = m.defined
      ? Decoration.mark({ class: 'ce-var', attrs: { title: `${t.name} = ${m.display}` } })
      : Decoration.mark({ class: 'ce-var-bad', attrs: { title: `${t.name}（未定义）` } })
    b.add(t.start, t.end, deco)
  }
  return b.finish()
}

const varField = StateField.define<RangeSet<Decoration>>({
  create: (state) => computeVarSet(state.doc),
  update(set, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(varRecompute))) {
      return computeVarSet(tr.state.doc)
    }
    return set
  },
  provide: (f) => EditorView.decorations.from(f),
})

function buildExtensions(): Extension[] {
  const exts: Extension[] = [
    baseTheme,
    readOnlyComp.of(EditorState.readOnly.of(props.readOnly)),
    EditorView.lineWrapping,
    syntaxHighlighting(defaultHighlightStyle),
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...completionKeymap, indentWithTab]),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
    }),
  ]
  if (props.language !== 'text') exts.push(...langExt(props.language))
  if (props.varHighlight) exts.push(varField)
  if (props.lineNumbers) exts.push(lineNumbers())
  return exts
}

function mount() {
  if (!wrap.value) return
  view = new EditorView({
    parent: wrap.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions(),
    }),
  })
}

/** 语言变化需要重建（语言扩展静态绑定） */
function remount() {
  view?.destroy()
  view = null
  mount()
}

onMounted(mount)
onBeforeUnmount(() => view?.destroy())

watch(() => props.language, remount)
watch(
  () => props.modelValue,
  (v) => {
    if (!view) return
    if (v !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: v },
      })
    }
  },
)
watch(
  () => props.readOnly,
  (v) => {
    if (!view) return
    if (view.state.facet(EditorState.readOnly) !== v) {
      view.dispatch({ effects: readOnlyComp.reconfigure(EditorState.readOnly.of(v)) })
    }
  },
)
// 变量作用域变化（换环境 / 改值 / 增删 / 切项目）→ 重算高亮，不动文档。
// watch 放在 setup 而非模块级：组件模块加载时 stores 已就绪，避免循环依赖求值期 TDZ
watch(
  () => ({
    eid: env.currentEnvId,
    g: env.globalVars,
    pv: currentProject.value?.variables,
    ev: currentEnv.value?.variables,
  }),
  () => {
    if (view && props.varHighlight) view.dispatch({ effects: varRecompute.of(null) })
  },
  { deep: true },
)

/** JSON 美化；返回 'ok' 已格式化 / 'error' 解析失败 / 'noop' 非 JSON 或空 */
function format(): 'ok' | 'error' | 'noop' {
  if (!view || props.language !== 'json' || props.readOnly) return 'noop'
  const text = view.state.doc.toString()
  if (!text.trim()) return 'noop'
  try {
    const pretty = JSON.stringify(JSON.parse(text), null, 2)
    if (pretty !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: pretty } })
    }
    return 'ok'
  } catch {
    return 'error'
  }
}

defineExpose({ format, getView: () => view })
</script>

<template>
  <div ref="wrap" class="ce" :style="{ height: typeof height === 'number' ? height + 'px' : height }">
    <div v-if="!modelValue && placeholder" class="ce-ph">{{ placeholder }}</div>
  </div>
</template>

<style scoped>
.ce {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--border);
}
.ce :deep(.cm-editor) {
  height: 100%;
}
/* 深色下光标必须显式指定：CM6 基类是 border-left:1.2px solid black（浅色 #ddd 只对
   .dark 类生效，而我们用 html 的 data-theme、从不给编辑器加 .dark 类）。黑色光标在深色
   背景上几乎不可见（用户实测反馈），主题对象里的 borderLeftColor 又未生效——用
   :deep + !important 强制品牌色 + 加宽到 2px，保证明暗两套主题都清晰 */
.ce :deep(.cm-cursor) {
  border-left-color: var(--brand) !important;
  border-left-width: 2px !important;
}
.ce-ph {
  position: absolute;
  /* 与 .cm-content 的 padding 8px 14px 对齐（无行号槽的 text/js 下文字起点） */
  top: 8px;
  left: 14px;
  font-size: 13px;
  color: var(--text-faint);
  pointer-events: none;
}
</style>
