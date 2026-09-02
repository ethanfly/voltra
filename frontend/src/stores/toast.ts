// 轻量全局 toast：下载结果 / 保存反馈等短提示（App.vue 挂载 <Toast/> 渲染）
// 与模块级 reactive store 风格一致，无 Pinia
import { reactive } from 'vue'
import { uid } from '../types/models'

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: string
  kind: ToastKind
  text: string
}

export const toasts = reactive<{ list: ToastItem[] }>({ list: [] })

/** 弹一条 toast，ms 后自动消失（默认 3.2s）。返回其 id 便于手动 dismiss */
export function toast(kind: ToastKind, text: string, ms = 3200): string {
  const id = uid()
  toasts.list.push({ id, kind, text })
  setTimeout(() => dismissToast(id), ms)
  return id
}

export function dismissToast(id: string) {
  const i = toasts.list.findIndex((t) => t.id === id)
  if (i >= 0) toasts.list.splice(i, 1)
}
