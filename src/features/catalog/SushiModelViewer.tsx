import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3 } from 'three'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'
import { SushiGeometry } from '../draft/models/SushiGeometry'

type Props = {
  card: Card
  autoRotate: boolean
  view: 'angle' | 'top' | 'side'
  resetKey: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onInteraction: () => void
}

const UNAVAILABLE_MESSAGE = 'この環境では3D表示を利用できません。イラストでご覧ください。'
const ERROR_MESSAGE = '3Dモデルを表示できませんでした。イラストでご覧ください。'

// Three.js が必要とする WebGL 2 を確認し、確認用のコンテキストは解放します。
function supportsWebGL() {
  if (typeof document === 'undefined') return false
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function ModelFallback({ card, message, onRetry }: { card: Card; message: string; onRetry: () => void }) {
  return (
    <div className="catalog-model-fallback" role="status">
      <SushiArt card={card} size={240} />
      <p>{message}</p>
      <button type="button" onClick={onRetry}>3D表示を再試行</button>
    </div>
  )
}

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function RendererGuard({ onFailure }: { onFailure: (message: string) => void }) {
  const gl = useThree(state => state.gl)

  useEffect(() => {
    const canvas = gl.domElement
    const onContextLost = (event: Event) => {
      event.preventDefault()
      onFailure('3D表示が中断されました。イラストでご覧いただくか、再試行してください。')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)

    // React の境界では捕捉されない描画ループ内の例外も、図鑑全体に波及させません。
    const render = gl.render
    gl.render = (...args: Parameters<typeof render>) => {
      try {
        render.apply(gl, args)
      } catch {
        onFailure(ERROR_MESSAGE)
      }
    }
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.render = render
    }
  }, [gl, onFailure])

  return null
}

function ModelCamera({ card, autoRotate, view, resetKey, zoom, onZoomChange, onInteraction }: Props) {
  const controls = useRef<OrbitControlsImpl>(null)
  const updatingCamera = useRef(false)
  const reportedZoom = useRef(zoom)
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  const invalidate = useThree(state => state.invalidate)
  const fit = Math.max(1, size.height / Math.max(1, size.width))
  const baseDistance = 3.2 * fit

  useLayoutEffect(() => {
    reportedZoom.current = zoom
  }, [zoom])

  const setCameraPose = useCallback((direction: Vector3, distance: number) => {
    const orbit = controls.current
    if (!orbit) return

    // カメラへの反映中は controls の change を親へ返さず、更新の循環を防ぎます。
    updatingCamera.current = true
    const damping = orbit.enableDamping
    const rotating = orbit.autoRotate
    try {
      orbit.enableDamping = false
      orbit.autoRotate = false
      orbit.update()
      orbit.target.set(0, 0.27, 0)
      camera.position.copy(direction.normalize().multiplyScalar(distance).add(orbit.target))
      orbit.update()
      orbit.saveState()
    } finally {
      orbit.enableDamping = damping
      orbit.autoRotate = rotating
      updatingCamera.current = false
    }
    invalidate()
  }, [camera, invalidate])

  // 視点の変更・リセットだけが向きを変更し、拡大操作は現在の向きを保ちます。
  useLayoutEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    const direction = view === 'top' ? new Vector3(0, 1, 0.001)
      : view === 'side' ? new Vector3(0, 0.1, 1)
        : new Vector3(1.05, 1.25, 1.55)
    setCameraPose(direction, orbit.getDistance())
  }, [card.id, resetKey, setCameraPose, view])

  useLayoutEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    const distance = baseDistance / Math.min(1.6, Math.max(0.75, zoom))
    // ホイール側ですでに反映された距離なら、ドラッグの慣性にも触れません。
    if (Math.abs(orbit.getDistance() - distance) < 0.00001) return
    setCameraPose(camera.position.clone().sub(orbit.target), distance)
  }, [baseDistance, camera, setCameraPose, zoom])

  const syncZoom = useCallback(() => {
    const orbit = controls.current
    if (!orbit || updatingCamera.current) return
    const measured = baseDistance / orbit.getDistance()
    // 端では誤差を丸め、親の拡大・縮小ボタンの disabled と実倍率を揃えます。
    const nextZoom = measured <= 0.7501 ? 0.75 : measured >= 1.5999 ? 1.6 : measured
    if (Math.abs(nextZoom - reportedZoom.current) < 0.0001) return
    reportedZoom.current = nextZoom
    onZoomChange(nextZoom)
  }, [baseDistance, onZoomChange])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.09}
      autoRotate={autoRotate}
      autoRotateSpeed={0.8}
      rotateSpeed={0.7}
      zoomSpeed={0.7}
      minDistance={baseDistance / 1.6}
      maxDistance={baseDistance / 0.75}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI / 2 - 0.07}
      onStart={onInteraction}
      onChange={syncZoom}
    />
  )
}

function DisplayPlate() {
  return (
    <group>
      {/* 低い展示台と接地影。追加の影用レンダリングを必要としません。 */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 64]} />
        <meshBasicMaterial color="#725438" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.025, 0]}>
        <cylinderGeometry args={[0.88, 0.84, 0.045, 64]} />
        <meshStandardMaterial color="#e9d9c3" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.7, 0.12, 64]} />
        <meshStandardMaterial color="#fff8ed" roughness={0.34} metalness={0.03} />
      </mesh>
      <mesh position={[0, 0.121, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.64, 0.71, 64]} />
        <meshStandardMaterial color="#d7b888" roughness={0.5} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.122, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.3, 0.75, 1]}>
        <circleGeometry args={[0.37, 48]} />
        <meshBasicMaterial color="#745839" transparent opacity={0.075} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function SushiModelViewer(props: Props) {
  const [failure, setFailure] = useState<string | null>(() => supportsWebGL() ? null : UNAVAILABLE_MESSAGE)
  const [attempt, setAttempt] = useState(0)
  const onFailure = useCallback((message: string) => setFailure(message), [])
  const retry = () => {
    setFailure(supportsWebGL() ? null : UNAVAILABLE_MESSAGE)
    setAttempt(value => value + 1)
  }
  const fallback = <ModelFallback card={props.card} message={failure ?? ERROR_MESSAGE} onRetry={retry} />

  if (failure) return fallback

  return (
    <ModelErrorBoundary key={attempt} fallback={fallback}>
      <Canvas
        aria-label={`${props.card.name}の3Dモデル。ドラッグで回転できます。`}
        frameloop={props.autoRotate ? 'always' : 'demand'}
        dpr={[1, 1.75]}
        camera={{ position: [1.6, 1.8, 2.3], fov: 36, near: 0.1, far: 30 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        fallback={fallback}
      >
        <RendererGuard onFailure={onFailure} />
        <ambientLight intensity={1.5} color="#fff8ee" />
        <hemisphereLight args={['#fffaf0', '#bda587', 1]} />
        <directionalLight position={[3, 6, 4]} intensity={2.2} color="#fff5e7" />
        <directionalLight position={[-3, 2, -2]} intensity={0.7} color="#ffffff" />
        <DisplayPlate />
        {/* 各モデルの Texture は既存側で管理し、ビューア側から dispose しません。 */}
        <SushiGeometry card={props.card} />
        <ModelCamera {...props} />
      </Canvas>
    </ModelErrorBoundary>
  )
}
