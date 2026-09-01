<script setup lang="ts">
// 树节点行（folder / request）：方法色标、激活态、双击内联重命名、
// 原生 DnD（before/after/inside）、右键菜单（向父级 emit）
// 递归渲染：SFC 通过文件名隐式自引用
import { computed, ref, watch } from 'vue'
import { ChevronRight, ChevronDown, Pencil, Trash2, FilePlus2 } from 'lucide-vue-next'
import type { TreeNode, Request, ID, Folder } from '../../types/models'
import { isExpanded, toggleExpanded, setExpanded } from '../../stores/ui-state'
import { activeRequest, openRequest } from '../../stores/tabs'
import {
  currentProject,
  renameNode,
  moveNode,
  isDescendant,
  addRequest,
} from '../../stores/workspace'
import { nodeIcon } from '../../lib/tree-icons'
import { dragNodeId, dragIsCollection, dropTarget, resetDnd, type DropPos } from './dnd-state'
import { t } from '../../locales/zh-CN'

const L = t()

const props = withDefaults(
  defineProps<{ node: TreeNode; level?: number; externalRename?: ID | null }>(),
  { level: 0, externalRename: null },
)

const emit = defineEmits<{
  (e: 'menu', node: TreeNode, x: number, y: number): void
  (e: 'rename-done'): void
  (e: 'focus-rename', id: ID): void
  (e: 'delete', node: TreeNode): void
}>()

const isRequest = computed(() => props.node.kind === 'request')
// 模板里无法对 Folder | Request 收窄，提供两个已收窄的引用
const req = computed<Request | null>(() => (isRequest.value ? (props.node as Request) : null))
const kids = computed<TreeNode[]>(() => (isRequest.value ? [] : (props.node as { items: TreeNode[] }).items))
const expanded = computed(() => isExpanded(props.node.id))
const isActive = computed(() => isRequest.value && activeRequest.value?.id === props.node.id)
const indent = computed(() => ({ paddingInlineStart: 8 + props.level * 14 + 'px' }))

function methodClass(r: Request): string {
  if (r.protocol === 'ws') return 'm-WS'
  const m = (r.method || 'GET').toUpperCase()
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m)
    ? 'm-' + m
    : 'm-UNKNOWN'
}

// ---------- 内联重命名 ----------
const renaming = ref(false)
const renameText = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename() {
  renameText.value = props.node.name
  renaming.value = true
  setTimeout(() => renameInput.value?.select(), 0)
}
function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  const v = renameText.value.trim()
  if (v && v !== props.node.name) renameNode(props.node.id, v)
  emit('rename-done')
}
function cancelRename() {
  renaming.value = false
  emit('rename-done')
}

// 新建/右键"重命名"：面板把 externalRename 设为本节点 id。
// immediate:true——新建节点的行是挂载后才发现 externalRename 已等于其 id（同一 handler 内同步设置），
// 非 immediate 的 watch 只捕获"变更"，会漏掉"挂载即匹配"的聚焦
watch(
  () => props.externalRename,
  (v) => {
    if (v === props.node.id) startRename()
  },
  { immediate: true },
)

// ---------- hover 快捷按钮 ----------
/** 文件夹行：新建请求（作为该文件夹最后一个子节点），展开父级并聚焦改名 */
function onHoverNewRequest() {
  if (isRequest.value) return
  const r = addRequest(props.node as Folder)
  setExpanded(props.node.id, true)
  emit('focus-rename', r.id)
}
function onHoverDelete() {
  emit('delete', props.node)
}

// ---------- 点击 ----------
function onClick() {
  if (renaming.value) return
  if (req.value) openRequest(req.value)
  else toggleExpanded(props.node.id)
}

// ---------- 右键菜单 ----------
function onContext(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  emit('menu', props.node, e.clientX, e.clientY)
}

// ---------- 拖拽 ----------
const isDropTarget = computed(() => dropTarget.value?.id === props.node.id)
const dropPos = computed<DropPos | null>(() =>
  isDropTarget.value ? dropTarget.value!.pos : null,
)

function onDragStart(e: DragEvent) {
  dragNodeId.value = props.node.id
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.node.id)
}

function onDragOver(e: DragEvent) {
  if (!dragNodeId.value || dragNodeId.value === props.node.id) return
  if (dragIsCollection.value) return // 集合只能与集合排序
  const p = currentProject.value
  // 悬停节点在拖拽源子树内：不显示落点
  if (p && isDescendant(p, dragNodeId.value, props.node.id)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / rect.height
  let pos: DropPos
  if (isRequest.value) {
    pos = ratio < 0.5 ? 'before' : 'after'
  } else {
    pos = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
  }
  if (dropTarget.value?.id !== props.node.id || dropTarget.value?.pos !== pos) {
    dropTarget.value = { id: props.node.id, pos }
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const dragId = dragNodeId.value
  const t = dropTarget.value
  dragNodeId.value = null
  dropTarget.value = null
  if (!dragId || !t) return
  moveNode(dragId, t.id, t.pos)
}

function onDragEnd() {
  resetDnd()
}
</script>

<template>
  <div
    :class="['tn-row', { 'tn-request': isRequest, active: isActive }]"
    :style="indent"
    :draggable="!renaming"
    @click="onClick"
    @dblclick="startRename"
    @contextmenu="onContext"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <!-- 落点指示：before -->
    <div v-if="dropPos === 'before'" class="tn-drop-line before"></div>

    <button
      v-if="!isRequest"
      class="tn-chevron"
      :class="{ open: expanded }"
      @click.stop="toggleExpanded(node.id)"
    >
      <ChevronDown v-if="expanded" :size="12" />
      <ChevronRight v-else :size="12" />
    </button>
    <span v-else class="tn-chevron-placeholder"></span>

    <template v-if="renaming">
      <input
        ref="renameInput"
        v-model="renameText"
        class="tn-rename"
        @click.stop
        @blur="commitRename"
        @keyup.enter="commitRename"
        @keyup.esc.stop="cancelRename"
      />
    </template>
    <template v-else>
      <component :is="nodeIcon(node)" :size="13" class="tn-ico" />
      <span class="tn-name" :title="node.name">
        <template v-if="req">
          <span :class="['tn-method', methodClass(req)]">{{ req.protocol === 'ws' ? 'WS' : req.method }}</span>
        </template>
        {{ node.name }}
      </span>
      <!-- hover 快捷按钮：文件夹多一个"新建请求"；请求只有改名/删除 -->
      <span class="tn-acts">
        <button v-if="!isRequest" class="tn-act" :title="L.tree.newRequest" @click.stop="onHoverNewRequest">
          <FilePlus2 :size="13" />
        </button>
        <button class="tn-act" :title="L.common.rename" @click.stop="startRename">
          <Pencil :size="13" />
        </button>
        <button class="tn-act tn-act-del" :title="L.common.delete" @click.stop="onHoverDelete">
          <Trash2 :size="13" />
        </button>
      </span>
    </template>

    <!-- 落点指示：after -->
    <div v-if="dropPos === 'after'" class="tn-drop-line after"></div>
  </div>

  <div v-if="!req && expanded" :class="['tn-kids', { 'drop-inside': dropPos === 'inside' }]">
    <TreeNodeRow
      v-for="child in kids"
      :key="child.id"
      :node="child"
      :level="level + 1"
      :external-rename="externalRename"
      @menu="(n, x, y) => $emit('menu', n, x, y)"
      @rename-done="$emit('rename-done')"
      @focus-rename="(id) => $emit('focus-rename', id)"
      @delete="(n) => $emit('delete', n)"
    />
  </div>
</template>

<style scoped>
.tn-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--row-h);
  padding-right: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--text-dim);
  transition: background var(--ease);
  border-radius: var(--radius-sm);
}
.tn-row:hover {
  background: var(--bg-hover);
}
.tn-row.tn-request {
  color: var(--text);
}
.tn-row.active {
  background: var(--bg-active);
  color: var(--text);
}
.tn-row.active .tn-ico {
  color: var(--brand);
}
.tn-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.tn-chevron:hover {
  background: var(--border);
  color: var(--text);
}
.tn-chevron-placeholder {
  width: 16px;
  flex-shrink: 0;
}
.tn-ico {
  color: var(--text-faint);
  flex-shrink: 0;
}
.tn-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-method {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  min-width: 30px;
}
/* hover 快捷按钮：默认隐藏，行 hover 时淡入（对齐 .coll-del 的 reveal 模式） */
.tn-acts {
  display: flex;
  gap: 2px;
  opacity: 0;
  flex-shrink: 0;
}
.tn-row:hover .tn-acts {
  opacity: 1;
}
.tn-act {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.tn-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.tn-act-del:hover {
  background: var(--error-weak);
  color: var(--error);
}
.tn-rename {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--brand);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 12px;
  outline: none;
}
.tn-drop-line {
  position: absolute;
  left: 4px;
  right: 4px;
  height: 2px;
  border-radius: 1px;
  background: var(--brand);
  pointer-events: none;
  z-index: 2;
}
.tn-drop-line.before {
  top: -1px;
}
.tn-drop-line.after {
  bottom: -1px;
}
.tn-kids {
  border-radius: var(--radius-sm);
}
.tn-kids.drop-inside {
  outline: 2px solid var(--brand);
  outline-offset: -1px;
  background: var(--brand-weak);
}
</style>
