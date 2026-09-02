// 页面缩放：Cmd/Ctrl + "=" / "-" / "0" + 顶栏百分比滑条
//
// 用 #app 根节点的 CSS zoom（tokens.css 的 #app { zoom: var(--app-zoom) }），
// 而不是 Wails 的 Window.ZoomIn：Wails 在 macOS 走 WKWebView 的 setMagnification——
// 纯渲染放大（像双指捏合），布局不重排，放大后右侧内容被裁掉。
// CSS zoom 会把被缩放元素的布局盒按 1/zoom 收缩，整页按更小的逻辑视口重排：
// 文字折行、弹性元素收缩、按钮完整可见，无页面级滚动条（即"自适应"）。
//
// zoom 是响应式 ref：顶栏 pill / 滑条读取 zoomPercent 显示当前值，
// 键盘快捷键与滑条共同写同一个值，二者始终同步。
import { ref, computed } from 'vue'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.5
const STEP = 0.05

export const zoom = ref(1)

function apply() {
  document.documentElement.style.setProperty('--app-zoom', String(zoom.value))
}

/** 设置缩放（自动钳制到 50%–150%） */
export function setZoom(v: number) {
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 1000) / 1000))
  apply()
}

export function stepZoom(delta: number) {
  setZoom(zoom.value + delta)
}

export function resetZoom() {
  setZoom(1)
}

/** 当前缩放百分比（50–150），顶栏 pill / 滑条显示用 */
export const zoomPercent = computed(() => Math.round(zoom.value * 100))

/** 初始化键盘缩放：Cmd/Ctrl + "=" / "-"（±5%）、"0"（重置 100%） */
export function initZoomKeys() {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return
    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault()
        stepZoom(STEP)
        break
      case '-':
      case '_':
        e.preventDefault()
        stepZoom(-STEP)
        break
      case '0':
        e.preventDefault()
        resetZoom()
        break
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
