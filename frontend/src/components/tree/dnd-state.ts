// 树拖拽（集合排序 + 树内重排/移入子目录）：用鼠标拖拽实现，不用原生 HTML5 DnD
//
// 为什么不用原生 DnD（dragstart/dragover/drop）：逻辑上没问题，但在 WKWebView
// （macOS 桌面端）里 HTML5 拖拽经常触发不了 / drop 不落，用户实测反复"拖不动"。
// 鼠标拖拽（mousedown → mousemove → mouseup 落点判定）跨 webview 稳定，
// 代价是需自己算落点 + 画指示（指示复用组件里既有的 dropTarget 高亮 CSS）。
//
// 落点：before / after（同级排序）/ inside（仅文件夹，拖入）。
// 行在垂直方向不重叠，按 y 命中唯一一行（getBoundingClientRect 命中测试）；
// 行内 before/after 按 y 比例判定，文件夹额外有 inside 中段。
import { ref } from 'vue'
import type { ID } from '../../types/models'
import { currentProject, isDescendant, moveNode, reorderCollections } from '../../stores/workspace'

export type DropPos = 'before' | 'after' | 'inside'
export type RowKind = 'collection' | 'folder' | 'request'

// ---------- 瞬态状态（不落盘） ----------
export const dragNodeId = ref<ID | null>(null)
export const dragKind = ref<RowKind | null>(null)
export const dropTarget = ref<{ id: ID; pos: DropPos } | null>(null)
/** 跟随光标的拖拽标签（原生 DnD"幽灵图"的替身） */
export const dragGhost = ref<{ name: string; x: number; y: number } | null>(null)

export function resetDnd() {
  dragNodeId.value = null
  dragKind.value = null
  dropTarget.value = null
  dragGhost.value = null
}

// ---------- 行注册表：把当前渲染中的行（el + kind）登记，供命中测试 ----------
interface RegRow {
  id: ID
  el: HTMLElement
  kind: RowKind
}
const registry = new Map<ID, RegRow>()
export function registerRow(id: ID, el: HTMLElement, kind: RowKind) {
  registry.set(id, { id, el, kind })
}
export function unregisterRow(id: ID) {
  registry.delete(id)
}

// ---------- 命中测试：返回光标落在哪一行的哪个落点 ----------
function hitTest(x: number, y: number, dragId: ID, dragK: RowKind): { id: ID; pos: DropPos } | null {
  const p = currentProject.value
  for (const row of registry.values()) {
    // 拖自己不算；集合只跟集合排、树节点不落到集合根上
    if (row.id === dragId) continue
    if (dragK === 'collection' && row.kind !== 'collection') continue
    if (dragK !== 'collection' && row.kind === 'collection') continue
    // 树节点不能拖进自身/后代的子树
    if (p && dragK !== 'collection' && isDescendant(p, dragId, row.id)) continue
    const r = row.el.getBoundingClientRect()
    if (y < r.top || y >= r.bottom) continue // 行垂直不重叠，y 命中唯一行
    if (r.height <= 0) continue
    const ratio = (y - r.top) / r.height
    let pos: DropPos
    if (row.kind === 'request') pos = ratio < 0.5 ? 'before' : 'after'
    else if (row.kind === 'folder') pos = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
    else pos = ratio < 0.5 ? 'before' : 'after' // collection
    return { id: row.id, pos }
  }
  return null
}

// ---------- 拖拽主循环 ----------
let lastDragEndAt = 0
/** 刚结束一次拖拽（吞掉紧随其后的 click，避免"拖完又点开节点"） */
export function wasJustDragged(): boolean {
  return Date.now() - lastDragEndAt < 200
}

let startX = 0
let startY = 0
let curX = 0
let curY = 0
let started = false
let activeId: ID | null = null
let activeKind: RowKind | null = null
let rafId = 0

function autoScroll() {
  const sc = document.querySelector<HTMLElement>('.sb-body')
  if (!sc || sc.scrollHeight <= sc.clientHeight) return
  const r = sc.getBoundingClientRect()
  if (curY < r.top + 44) sc.scrollTop -= 10
  else if (curY > r.bottom - 44) sc.scrollTop += 10
}

function tick() {
  if (!activeId || !activeKind) return
  autoScroll()
  dropTarget.value = hitTest(curX, curY, activeId, activeKind)
  const g = dragGhost.value
  if (g) {
    g.x = curX
    g.y = curY
  }
  rafId = requestAnimationFrame(tick)
}

/** 行 mousedown 入口：左键且目标非可交互子元素（按钮/输入框）时进入潜在拖拽 */
export function startRowDrag(e: MouseEvent, id: ID, kind: RowKind, name: string) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('button, input, textarea, select, a')) return
  startX = e.clientX
  startY = e.clientY
  curX = startX
  curY = startY
  started = false
  activeId = id
  activeKind = kind

  // 自愈：上一次拖拽若没等到 mouseup（如拖到窗口外松手、窗口切走），
  // 状态会卡住（幽灵残留 / tv-dragging 不解除 / rAF 空转），新 mousedown 先清掉
  if (activeId) {
    cancelAnimationFrame(rafId)
    activeId = null
    activeKind = null
    started = false
    dragNodeId.value = null
    dragKind.value = null
    dropTarget.value = null
    dragGhost.value = null
    document.body.classList.remove('tv-dragging')
  }

  const onMove = (ev: MouseEvent) => {
    curX = ev.clientX
    curY = ev.clientY
    if (!started) {
      if (Math.hypot(curX - startX, curY - startY) < 4) return
      started = true
      dragNodeId.value = id
      dragKind.value = kind
      dragGhost.value = { name, x: curX, y: curY }
      document.body.classList.add('tv-dragging')
      rafId = requestAnimationFrame(tick)
    }
    ev.preventDefault()
  }
  // 统一收尾：ev=null 表示被动结束（窗口失焦），只清状态不结算落点
  const finish = (ev: MouseEvent | null) => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('blur', onBlur)
    if (rafId) cancelAnimationFrame(rafId)
    const did = activeId
    const dKind = activeKind
    const didDrag = started
    // 先清瞬态（含指示/幽灵），再结算落点
    activeId = null
    activeKind = null
    started = false
    dragNodeId.value = null
    dragKind.value = null
    dropTarget.value = null
    dragGhost.value = null
    document.body.classList.remove('tv-dragging')
    if (did && dKind && didDrag && ev) {
      lastDragEndAt = Date.now()
      const hit = hitTest(ev.clientX, ev.clientY, did, dKind)
      if (hit) commitDrop(did, dKind, hit.id, hit.pos)
    }
  }
  const onUp = (ev: MouseEvent) => finish(ev)
  const onBlur = () => finish(null) // 拖拽中窗口失焦（如松手在别的应用上）：清理但不落点
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('blur', onBlur)
}

function commitDrop(dragId: ID, dragK: RowKind, targetId: ID, pos: DropPos) {
  if (dragK === 'collection') {
    // 集合无 inside 落点，归到 after
    reorderCollections(dragId, targetId, pos === 'inside' ? 'after' : pos)
  } else {
    moveNode(dragId, targetId, pos)
  }
}
