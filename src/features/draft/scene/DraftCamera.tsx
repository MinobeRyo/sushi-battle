import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { OrthographicCamera, Vector3 } from 'three'

// 3本のレーンの奥行きと寿司の高さを、表示領域の中に収める。
// ウィンドウのリサイズ・デッキ開閉でもCanvasを作り直さず、皿の状態を保つ。
export function DraftCamera() {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera) || size.height === 0) return
    // 奥の皿だけ極端に小さくならない投影で、各レーンの押しやすさを揃える。
    const direction = new Vector3(0, 7, 9).normalize()
    const up = new Vector3(0, direction.z, -direction.y)
    let bottom = Infinity
    let top = -Infinity
    for (const y of [-0.1, 1.3]) {
      for (const z of [-3.65, 3.65]) {
        const projectedY = new Vector3(0, y, z).dot(up)
        bottom = Math.min(bottom, projectedY)
        top = Math.max(top, projectedY)
      }
    }
    const target = up.clone().multiplyScalar((top + bottom) / 2)
    // 余白はピクセルで指定し、カメラの上半分を空白にしない。
    camera.zoom = Math.max(1, Math.min((size.height - 28) / (top - bottom), (size.width - 24) / 4.4))
    camera.position.copy(target).addScaledVector(direction, 12)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  return null
}
