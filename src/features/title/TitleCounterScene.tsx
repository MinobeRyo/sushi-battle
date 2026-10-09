import { Component, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrthographicCamera } from 'three'
import { SushiArt } from '../../components/SushiArt'
import { getCardById } from '../../data/cards'
import { SushiGeometry } from '../draft/models/SushiGeometry'
import './TitleCounterScene.css'

const DISHES = ['maguro', 'salmon', 'ikura_gunkan'].map(id => getCardById(id)).filter(card => card != null)

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

function CounterFallback() {
  return <div className="title-counter-fallback">
    <div className="title-counter-fallback-plate">
      {DISHES.map(card => <SushiArt key={card.id} card={card} size="31%" />)}
    </div>
  </div>
}

class CounterErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <CounterFallback /> : this.props.children }
}

function SceneGuard({ onFailure }: { onFailure: () => void }) {
  const { gl, camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(size.height / 3.1, size.width / 6.4)
      camera.lookAt(0, 0.35, 0)
      camera.updateProjectionMatrix()
      invalidate()
    }
  }, [camera, size.width, size.height, invalidate])
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (event: Event) => { event.preventDefault(); onFailure() }
    canvas.addEventListener('webglcontextlost', onLost)
    const render = gl.render
    gl.render = (...args: Parameters<typeof render>) => {
      try { render.apply(gl, args) } catch { onFailure() }
    }
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.render = render
    }
  }, [gl, onFailure])
  return null
}

function CounterObjects() {
  return <>
    <ambientLight intensity={1.3} color="#fff0d9" />
    <directionalLight position={[-3, 7, 5]} intensity={2.5} color="#ffead0" />
    <directionalLight position={[4, 3, -3]} intensity={0.8} color="#e3e9df" />
    {/* 漆の角皿。中央の三貫は実際のゲーム内モデルをそのまま使用します。 */}
    <group position={[0, 0.06, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[5.55, 0.12, 2.05]} />
        <meshStandardMaterial color="#281f1c" roughness={0.27} />
      </mesh>
      <mesh position={[0, 0.069, 0]}>
        <boxGeometry args={[5.38, 0.018, 1.88]} />
        <meshStandardMaterial color="#70332b" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.084, 0]}>
        <boxGeometry args={[5.22, 0.015, 1.72]} />
        <meshStandardMaterial color="#302322" roughness={0.35} />
      </mesh>
      {DISHES.map((card, index) => <group key={card.id} position={[(index - 1) * 1.6, 0.1, 0]} rotation={[0, -0.15, 0]} scale={0.82}>
        <SushiGeometry card={card} />
      </group>)}
    </group>
    {/* 陶器の湯呑みとお茶。画面が狭い場合は周辺の小物だけが見切れます。 */}
    <group position={[3.55, 0, -0.42]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.38, 0.31, 0.94, 24]} />
        <meshStandardMaterial color="#71806a" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.977, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.31, 0.38, 24]} />
        <meshStandardMaterial color="#b8bd9f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.973, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.313, 24]} />
        <meshStandardMaterial color="#3e4930" roughness={0.25} />
      </mesh>
      {[0.25, 0.48, 0.71].map(y => <mesh key={y} position={[0, y, 0]}>
        <cylinderGeometry args={[0.36, 0.355, 0.023, 24]} />
        <meshStandardMaterial color="#8c987c" roughness={0.8} />
      </mesh>)}
    </group>
    <group position={[-3.65, 0.08, 0]} rotation={[0, -0.2, 0]}>
      <mesh position={[0, 0.04, 0.45]}>
        <boxGeometry args={[0.6, 0.14, 0.23]} />
        <meshStandardMaterial color="#ebe1c8" roughness={0.6} />
      </mesh>
      {[-0.12, 0.12].map(x => <mesh key={x} position={[x, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.024, 0.043, 2.5, 8]} />
        <meshStandardMaterial color="#ae7747" roughness={0.75} />
      </mesh>)}
    </group>
  </>
}

export function TitleCounterScene() {
  const [supported] = useState(supportsWebGL)
  const [failed, setFailed] = useState(false)
  const onFailure = useCallback(() => setFailed(true), [])
  return <div className="title-counter-scene" aria-hidden="true">
    <CounterErrorBoundary>
      {supported && !failed ? <Canvas
        orthographic
        camera={{ position: [0, 5, 7], zoom: 65, near: 0.1, far: 40 }}
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        fallback={<CounterFallback />}
      >
        <SceneGuard onFailure={onFailure} />
        <CounterObjects />
      </Canvas> : <CounterFallback />}
    </CounterErrorBoundary>
  </div>
}
