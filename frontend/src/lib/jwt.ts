// JWT payload 解码（AuthTab 展示用）：三段式 base64url → JSON。
// 仅解码不验签——验签需要服务端公钥/密钥，本地工具没有依据；界面上已明示

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const s = (token ?? '').trim()
  const parts = s.split('.')
  if (parts.length !== 3) return null
  try {
    const seg = parts[1]
    const pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4))
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/') + pad
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}
