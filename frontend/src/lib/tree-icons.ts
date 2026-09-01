// 节点类型 → 图标：集合 FolderTree(品牌色) / 文件夹 Folder(dim) / 请求 Globe(http)|Wifi(ws)
// 收敛 TreeNodeRow（树行）与 CollectionsPanel（集合行 + 搜索命中）的重复图标判断
import { FolderTree, Folder, Globe, Wifi } from 'lucide-vue-next'
import type { TreeNode, Request, Collection } from '../types/models'

export type NodeIcon = typeof FolderTree | typeof Folder | typeof Globe | typeof Wifi

export function nodeIcon(n: Collection | TreeNode): NodeIcon {
  if ('kind' in n) {
    if (n.kind === 'request') return (n as Request).protocol === 'ws' ? Wifi : Globe
    return Folder
  }
  return FolderTree // collection（无 kind 字段）
}
