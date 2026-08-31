<script setup lang="ts">
// CodeMirror 6 封装：语言（json/xml/html/javascript/text）、JSON lint、format 暴露
// 主题只用 CSS 变量（var(--bg-sunken) 等），明暗切换无需重建编辑器
// {{变量}} 高亮（ENV-4/5）：已定义=品牌色、未定义=红色波浪线，title 悬浮当前值（secret 打码）；
// 响应查看器传 var-highlight=false（响应体里的 `{{` 是合法文本，不应告警）
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, keymap, Decoration } from '@codemirror/view'
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
}>(), { language: 'text', height: '100%', readOnly: false, placeholder: '', varHighlight: true })

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
    fontSize: '12px',
    backgroundColor: 'var(--bg-sunken)',
    color: 'var(--text)',
  },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '6px 0' },
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
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--brand)' },
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
.ce-ph {
  position: absolute;
  top: 6px;
  left: 30px;
  font-size: 12px;
  color: var(--text-faint);
  pointer-events: none;
}
</style>
