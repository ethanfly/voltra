// 接口树：搜索（含 1000 节点性能）+ 拖拽移动守卫
import { describe, it, expect, beforeEach } from 'vitest'
import { workspace, treeSearch, moveNode } from '../src/stores/workspace'
import {
  newProject,
  newCollection,
  newFolder,
  newRequest,
  type Project,
} from '../src/types/models'

function buildProject(nodeCount: number): Project {
  const p = newProject({ name: '性能项目' })
  const c = newCollection({ name: '大集合' })
  p.collections = [c]
  let n = 0
  for (let i = 0; i < 100 && n < nodeCount; i++) {
    const f = newFolder({ name: `folder-${i}` })
    c.items.push(f)
    for (let j = 0; j < 100 && n < nodeCount; j++) {
      f.items.push(newRequest({ name: `req-${i}-${j}`, url: 'https://example.com' }))
      n++
    }
  }
  return p
}

function useProject(p: Project) {
  workspace.projects = [p]
  workspace.currentProjectId = p.id
}

beforeEach(() => {
  workspace.projects = []
  workspace.currentProjectId = null
})

describe('treeSearch', () => {
  it('空查询返回空', () => {
    useProject(buildProject(50))
    expect(treeSearch('')).toEqual([])
    expect(treeSearch('   ')).toEqual([])
  })

  it('大小写不敏感的子串匹配 + 面包屑', () => {
    const p = newProject({ name: 'p' })
    const c = newCollection({ name: '用户中心' })
    const f = newFolder({ name: '鉴权' })
    const r = newRequest({ name: 'Login-As' })
    f.items.push(r)
    c.items.push(f)
    p.collections = [c]
    useProject(p)

    const hits = treeSearch('login')
    expect(hits).toHaveLength(1)
    // store 是 reactive，命中节点是 proxy，按 id 比较
    expect(hits[0].node.id).toBe(r.id)
    expect(hits[0].path).toEqual(['用户中心', '鉴权'])
  })

  it('集合名命中时面包屑为空', () => {
    const p = newProject({ name: 'p' })
    const c = newCollection({ name: '订单' })
    p.collections = [c]
    useProject(p)
    const hits = treeSearch('订单')
    expect(hits).toHaveLength(1)
    expect(hits[0].node.id).toBe(c.id)
    expect(hits[0].path).toEqual([])
  })

  it('同名命中全部返回', () => {
    const p = newProject({ name: 'p' })
    const c = newCollection({ name: 'c' })
    c.items.push(newRequest({ name: 'ping' }))
    const f = newFolder({ name: 'f' })
    f.items.push(newRequest({ name: 'ping' }))
    c.items.push(f)
    p.collections = [c]
    useProject(p)
    expect(treeSearch('ping')).toHaveLength(2)
  })

  it('1000 节点搜索 < 50ms（验收 #7 的纯逻辑部分）', () => {
    useProject(buildProject(1000))
    const start = performance.now()
    const hits = treeSearch('req-')
    const ms = performance.now() - start
    expect(hits.length).toBe(1000)
    expect(ms).toBeLessThan(50)
  })
})

describe('moveNode 守卫与落点', () => {
  function sampleProject() {
    const p = newProject({ name: 'p' })
    const c = newCollection({ name: 'c' })
    const fa = newFolder({ name: 'A' })
    const r1 = newRequest({ name: 'r1' })
    const r2 = newRequest({ name: 'r2' })
    fa.items.push(r1, r2)
    const fb = newFolder({ name: 'B' })
    c.items.push(fa, fb)
    p.collections = [c]
    useProject(p)
    return { c, fa, r1, r2, fb }
  }

  it('拖到自身不做任何事', () => {
    const { r1 } = sampleProject()
    expect(moveNode(r1.id, r1.id, 'after')).toBe(false)
  })

  it('文件夹拖到自己的后代被拒绝', () => {
    const { fa, r1 } = sampleProject()
    expect(moveNode(fa.id, r1.id, 'before')).toBe(false)
    // A 仍包含 r1
    expect(fa.items.map((n) => n.id)).toContain(r1.id)
  })

  it('inside 落点只有文件夹可接收', () => {
    const { r1, r2, fb } = sampleProject()
    expect(moveNode(r1.id, r2.id, 'inside')).toBe(false) // r2 是请求
    expect(moveNode(r1.id, fb.id, 'inside')).toBe(true)
    expect(fb.items.map((n) => n.id)).toContain(r1.id)
  })

  it('before/after 落点顺序正确（同数组前移校正）', () => {
    const p1 = sampleProject()
    // r1 在 r2 前；把 r2 移到 r1 前 → [r2, r1]
    expect(moveNode(p1.r2.id, p1.r1.id, 'before')).toBe(true)
    expect(p1.fa.items.map((n) => n.id)).toEqual([p1.r2.id, p1.r1.id])
    // 再 after：r1 移到 r2 后 → 回到 [r2, r1]
    expect(moveNode(p1.r1.id, p1.r2.id, 'after')).toBe(true)
    expect(p1.fa.items.map((n) => n.id)).toEqual([p1.r2.id, p1.r1.id])
  })

  it('跨文件夹 after：顺序保持', () => {
    const { r1, fb } = sampleProject()
    expect(moveNode(r1.id, fb.id, 'before')).toBe(true)
    // c.items = [A, r1, B]
    const c = workspace.projects[0].collections[0]
    expect(c.items.map((n) => n.name)).toEqual(['A', 'r1', 'B'])
  })
})
