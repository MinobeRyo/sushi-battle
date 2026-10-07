import { useMemo } from 'react'
import * as THREE from 'three'

// サーモン用の白い筋テクスチャ（Canvas生成）
export function useStripeTexture(base: string, color: string): THREE.Texture | null {
  return useMemo(() => {
    if (base !== 'サーモン') return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 256, 128)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    for (let x = -20; x <= 300; x += 44) {
      ctx.beginPath()
      ctx.moveTo(x - 22, 142)
      ctx.quadraticCurveTo(x + 12, 64, x - 22, -14)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [base, color])
}

// 光り物用テクスチャ：白い身＋銀青の皮と暗い波模様（Canvas生成）
// pale=true で酢締め（シメサバ）の白っぽい見た目に
export function useHikariTexture(skinColor: string | null, pale?: boolean): THREE.Texture | null {
  return useMemo(() => {
    if (!skinColor) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 銀白の身（下地）
    ctx.fillStyle = pale ? '#f6f3ee' : '#eef1f2'
    ctx.fillRect(0, 0, 256, 128)
    // 背側の皮（上端から中央へグラデーション）
    const grad = ctx.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, pale ? skinColor + 'b0' : skinColor)
    grad.addColorStop(0.42, skinColor + (pale ? '55' : 'aa'))
    grad.addColorStop(0.75, 'rgba(200,212,220,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 128)
    // 皮の暗い波模様
    ctx.strokeStyle = pale ? 'rgba(55,80,100,0.22)' : 'rgba(55,80,100,0.4)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (let x = -10; x <= 270; x += 26) {
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.quadraticCurveTo(x + 14, 34, x, 62)
      ctx.stroke()
    }
    // 銀のハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 8
    for (const y of [46, 84]) {
      ctx.beginPath()
      ctx.moveTo(0, y + 8)
      ctx.quadraticCurveTo(128, y - 10, 256, y + 6)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [skinColor, pale])
}

// えび用テクスチャ：白い身に赤い縞（Canvas生成）
export function useEbiTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 蒸しえびの白い身
    ctx.fillStyle = '#f7ecdc'
    ctx.fillRect(0, 0, 256, 128)
    // 赤い縞
    ctx.strokeStyle = '#ef5230'
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    for (let x = 4; x <= 280; x += 30) {
      ctx.beginPath()
      ctx.moveTo(x - 26, 142)
      ctx.quadraticCurveTo(x + 14, 64, x - 26, -14)
      ctx.stroke()
    }
    // 尾側（u=1側）を濃い赤に
    const grad = ctx.createLinearGradient(196, 0, 256, 0)
    grad.addColorStop(0, 'rgba(222,58,18,0)')
    grad.addColorStop(1, 'rgba(222,58,18,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(196, 0, 60, 128)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

// たこ用テクスチャ：白い身の両端に紫の皮（Canvas生成）
export function useTakoTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 白い身
    ctx.fillStyle = '#f4ede6'
    ctx.fillRect(0, 0, 256, 128)
    // かすかな身の筋
    ctx.strokeStyle = 'rgba(214,192,186,0.55)'
    ctx.lineWidth = 3
    for (let x = 10; x < 256; x += 34) {
      ctx.beginPath()
      ctx.moveTo(x, 6)
      ctx.quadraticCurveTo(x + 10, 64, x, 122)
      ctx.stroke()
    }
    // 皮（両端の赤紫の縁、波打つ境界）
    ctx.fillStyle = '#8e3a5f'
    for (const edge of [0, 1]) {
      const yBase = edge === 0 ? 0 : 128
      const dir = edge === 0 ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(0, yBase)
      for (let x = 0; x <= 256; x += 8) {
        ctx.lineTo(x, yBase + dir * (13 + 7 * Math.sin(x / 16 + edge * 2.3)))
      }
      ctx.lineTo(256, yBase)
      ctx.closePath()
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

// チーズ握り：炙りチーズのスライス
export function useCheeseTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#f4dc94'
    ctx.fillRect(0, 0, 256, 128)
    // 炙り目（焦げの斑点）
    const spots: Array<[number, number, number, number, number]> = [
      [40, 30, 16, 10, 0.45], [120, 60, 20, 12, 0.4], [200, 40, 14, 9, 0.45],
      [80, 95, 18, 10, 0.4], [170, 100, 15, 8, 0.45], [230, 90, 12, 8, 0.4],
      [30, 70, 10, 6, 0.5], [150, 22, 11, 7, 0.5],
    ]
    for (const [x, y, rx, ry, a] of spots) {
      ctx.fillStyle = `rgba(150,88,24,${a})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

// 中トロ・大トロ：サシ（脂の白い線）入りテクスチャ
export const TORO_CONF: Record<string, { flesh: string; bands: number; alpha: number; lw: number; slant: number; sheen: number }> = {
  '中トロ': { flesh: '#e05c48', bands: 5, alpha: 0.5, lw: 5, slant: 26, sheen: 0.08 },
  '大トロ': { flesh: '#ef9583', bands: 5, alpha: 0.85, lw: 12, slant: 34, sheen: 0.18 },
}

export function useToroTexture(kind: string): THREE.Texture | null {
  return useMemo(() => {
    const conf = TORO_CONF[kind]
    if (!conf) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = conf.flesh
    ctx.fillRect(0, 0, 256, 128)
    // 太い斜めのスジ（脂の白い帯）
    ctx.strokeStyle = `rgba(252,248,246,${conf.alpha})`
    ctx.lineWidth = conf.lw
    ctx.lineCap = 'round'
    for (let i = 0; i < conf.bands; i++) {
      const x = 34 + (i * 230) / conf.bands
      ctx.beginPath()
      ctx.moveTo(x + conf.slant, -8)
      ctx.lineTo(x - conf.slant, 136)
      ctx.stroke()
    }
    // 間の細かいサシ
    ctx.strokeStyle = 'rgba(252,248,246,0.3)'
    ctx.lineWidth = 2
    for (let i = 0; i < conf.bands * 3; i++) {
      const x = 14 + (i * 244) / (conf.bands * 3)
      ctx.beginPath()
      ctx.moveTo(x + conf.slant * 0.8, 0)
      ctx.lineTo(x - conf.slant * 0.8, 128)
      ctx.stroke()
    }
    // 表面の照り（上側にうっすら白）
    const sheen = ctx.createLinearGradient(0, 0, 0, 128)
    sheen.addColorStop(0, `rgba(255,255,255,${conf.sheen})`)
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, 256, 128)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [kind])
}

// 肉寿司用テクスチャ設定
export const NIKU_TEX_CONF: Record<string, { flesh: string; marbling: number; sear: number; edge?: string; gloss: number }> = {
  '和牛': { flesh: '#9e3a24', marbling: 0.9, sear: 0.35, gloss: 0.7 },
  'カルビ': { flesh: '#8f3d1d', marbling: 0.5, sear: 0.55, gloss: 0.8 },
  'ローストビーフ': { flesh: '#c25e49', marbling: 0.15, sear: 0.1, edge: '#6b3220', gloss: 0.45 },
  '焼肉': { flesh: '#7e3a16', marbling: 0.3, sear: 0.8, gloss: 0.8 },
  '牛タン': { flesh: '#c99490', marbling: 0.45, sear: 0.25, gloss: 0.4 },
  '合鴨': { flesh: '#b76760', marbling: 0.1, sear: 0.12, edge: '#714124', gloss: 0.3 },
}

// 肉寿司用テクスチャ：サシ（霜降り）＋炙り目（Canvas生成）
export function useNikuTexture(base: string): THREE.Texture | null {
  return useMemo(() => {
    const conf = NIKU_TEX_CONF[base]
    if (!conf) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = conf.flesh
    ctx.fillRect(0, 0, 256, 128)
    // サシ（白い波線）
    const marblingLines = Math.round(conf.marbling * 12)
    ctx.strokeStyle = 'rgba(250,244,238,0.7)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < marblingLines; i++) {
      const x = 10 + (i * 236) / Math.max(1, marblingLines - 1)
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.quadraticCurveTo(x + (i % 2 === 0 ? 16 : -16), 64, x, 124)
      ctx.stroke()
    }
    // 炙り目（暗い斜めの帯）
    if (conf.sear > 0) {
      ctx.strokeStyle = `rgba(45,22,12,${conf.sear})`
      ctx.lineWidth = 11
      for (let x = 20; x <= 260; x += 56) {
        ctx.beginPath()
        ctx.moveTo(x, -8)
        ctx.lineTo(x - 36, 136)
        ctx.stroke()
      }
    }
    // ローストビーフの焼き縁（両端）
    if (conf.edge) {
      ctx.fillStyle = conf.edge
      ctx.fillRect(0, 0, 256, 13)
      ctx.fillRect(0, 115, 256, 13)
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [base])
}
