// 页面缩放：Cmd/Ctrl + "=" / "-" / "0"（mac 为 Cmd，win/linux 为 Ctrl）
//
// 用 #app 根节点的 CSS zoom，而不是 Wails 的 Window.ZoomIn：
// Wails 在 macOS 走 WKWebView 的 setMagnification——纯渲染放大（像双指捏合），
// 布局不重排，放大后右侧内容被裁掉、出现平移滚动条。
// CSS zoom 会把被缩放元素的布局盒按 1/zoom 收缩，整页按更小的逻辑视口重排：
// 文字折行、弹性元素收缩、按钮完整可见，无页面级滚动条（即"自适应"）。
// WKWebView（macOS）与 WebView2/Chromium（Windows）均支持 zoom。
const MIN = 0.5
const MAX = 3
const STEP = 0.1

let zoom = 1

function apply() {
  document.documentElement.style.setProperty('--app-zoom', String(zoom))
}

function step(delta: number) {
  zoom = Math.min(MAX, Math.max(MIN, Math.round((zoom + delta) * 100) / 100))
  apply()
}

export function initZoomKeys() {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return
    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault()
        step(STEP)
        break
      case '-':
      case '_':
        e.preventDefault()
        step(-STEP)
        break
      case '0':
        e.preventDefault()
        zoom = 1
        apply()
        break
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
