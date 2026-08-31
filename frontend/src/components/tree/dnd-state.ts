// 树拖拽的瞬态状态（不落盘）：当前被拖节点 + 悬停落点
import { ref } from 'vue'
import type { ID } from '../../types/models'

export type DropPos = 'before' | 'after' | 'inside'

export const dragNodeId = ref<ID | null>(null)
/** 被拖的是顶层集合（只能与集合互相排序，不能拖进树内） */
export const dragIsCollection = ref(false)
export const dropTarget = ref<{ id: ID; pos: DropPos } | null>(null)

export function resetDnd() {
  dragNodeId.value = null
  dragIsCollection.value = false
  dropTarget.value = null
}
