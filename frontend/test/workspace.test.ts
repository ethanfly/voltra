// 树 store：duplicateNode 深拷贝独立性（auth 子对象等不得与原节点共享引用）
import { describe, it, expect, beforeEach } from 'vitest'
import { workspace, duplicateNode } from '../src/stores/workspace'
import { env } from '../src/stores/env'
import { newProject, newCollection, newFolder, newRequest } from '../src/types/models'
import type { Request } from '../src/types/models'

function setup(): { p: ReturnType<typeof newProject>; c: ReturnType<typeof newCollection>; r: Request } {
  const p = newProject({ name: 'p' })
  const c = newCollection({ name: 'c' })
  const f = newFolder({ name: 'f' })
  const r = newRequest({ name: 'r', url: 'https://x.com' })
  f.items.push(r)
  c.items.push(f)
  p.collections = [c]
  workspace.projects = [p]
  workspace.currentProjectId = p.id
  return { p, c, r }
}

beforeEach(() => {
  workspace.projects = []
  workspace.currentProjectId = null
  env.globalVars = []
  env.currentEnvId = null
})

describe('duplicateNode 深拷贝独立性', () => {
  it('auth 子对象独立：改副本的 jwt token 不影响原节点', () => {
    const { r } = setup()
    r.auth = { type: 'jwt', jwt: { token: 'original' } }
    const copy = duplicateNode(r.id)
    expect(copy).not.toBeNull()
    const cr = copy as Request
    expect(cr.id).not.toBe(r.id)
    expect(cr.name).toBe('r 副本')
    expect(cr.auth.jwt?.token).toBe('original')

    cr.auth.jwt!.token = 'changed'
    expect(r.auth.jwt?.token).toBe('original') // 原节点不受影响

    r.auth.jwt!.token = 'changed-too'
    expect(cr.auth.jwt?.token).toBe('changed') // 双向独立
  })

  it('headers/params/body 子数组同样独立', () => {
    const { r } = setup()
    r.headers.push({ key: 'X-A', value: '1', enabled: true })
    r.params.push({ key: 'q', value: '1', enabled: true })
    r.body = { type: 'urlencoded', urlencoded: [{ key: 'a', value: '1', enabled: true }] }
    const cr = duplicateNode(r.id) as Request
    expect(cr.id).not.toBe(r.id)

    cr.headers.find((h) => h.key === 'X-A')!.value = 'mutated'
    expect(r.headers.find((h) => h.key === 'X-A')?.value).toBe('1')
    cr.params[0].value = 'mutated'
    expect(r.params[0].value).toBe('1')
    cr.body.urlencoded![0].value = 'mutated'
    expect(r.body.urlencoded![0].value).toBe('1')
  })

  it('副本插在原节点之后', () => {
    const { r } = setup()
    const copy = duplicateNode(r.id)
    expect(copy).not.toBeNull()
    const items = workspace.projects[0].collections[0].items[0]
    expect(items.kind).toBe('folder')
    expect(items.items.map((n) => n.id)).toEqual([r.id, (copy as Request).id])
  })
})
