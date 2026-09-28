import { BoxGeometry, BufferGeometry, Float32BufferAttribute } from 'three'

// 低い視点でも手前の透明な判定が奥の皿を遮らないよう、
// 広く低い皿の領域と、奥行きを絞った寿司の領域を組み合わせる。
// 寿司の最高部（約0.78）と、ホバーで拡大した皿の縁を含む。
export const PLATE_HIT_AREAS: { position: [number, number, number]; size: [number, number, number] }[] = [
  { position: [0, 0.09, 0], size: [1.9, 0.3, 1.8] },
  { position: [0, 0.51, 0], size: [1.7, 0.66, 0.9] },
]

// 皿と寿司の境目でもホバーが途切れないよう、交差判定は単一meshにまとめる。
export function createPlateHitGeometry() {
  const positions: number[] = []
  for (const area of PLATE_HIT_AREAS) {
    const box = new BoxGeometry(...area.size)
    const geometry = box.toNonIndexed()
    geometry.translate(...area.position)
    positions.push(...geometry.getAttribute('position').array)
    geometry.dispose()
    box.dispose()
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
}
