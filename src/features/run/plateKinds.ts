import type { RunNodeKind } from '../../game/run'

/** 皿の種類ごとの見た目（デザイン案「回転レーンが地図」）。形の文字と縁の色で見分ける。 */
export const PLATE_KIND: Record<RunNodeKind, { ch: string; name: string; rim: string; face: string; shade: string; mark: string }> = {
  battle: { ch: '食', name: '大食い客', rim: '#795350', face: '#e9b3ab', shade: '#a7746d', mark: '#6b241a' },
  regular: { ch: '常', name: '常連さん', rim: '#6d5a8a', face: '#d7c9ee', shade: '#a597c4', mark: '#3b2a63' },
  rest: { ch: '茶', name: 'お茶', rim: '#6f8f7a', face: '#dfebe2', shade: '#a6b5aa', mark: '#2f6a3e' },
  event: { ch: '？', name: 'ハプニング', rim: '#ab954f', face: '#f2df9c', shade: '#bfad6c', mark: '#5c4200' },
  shop: { ch: '買', name: '買い物', rim: '#4f6a8a', face: '#cfe0ee', shade: '#9db3c6', mark: '#1c3c43' },
  boss: { ch: '将', name: '大皿', rim: '#a87d1f', face: '#f3d98a', shade: '#c9a64a', mark: '#3b2a0a' },
}
