import { useLayoutEffect, useMemo, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { CanvasTexture, OrthographicCamera, RepeatWrapping, SRGBColorSpace } from 'three'
import type { Card } from '../../types'
import { BeltLane3D } from '../draft/scene/BeltLane3D'
import type { OnlineBeltSupply } from '../draft/scene/BeltLane3D'
import { ShinkansenPlate3D } from '../draft/scene/ShinkansenPlate3D'
import type { DraftState } from '../draft/draftEngine'
import './VerticalDraftScene.css'

type Props = {
  onlineSupply?: OnlineBeltSupply
  generalCards: Card[]
  buildCards: Card[]
  onBeltSelect: (card: Card, markSold: () => boolean, offerId: string) => void
  paused?: boolean
}

function VerticalCamera() {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera) || size.width <= 0) return
    // 通常の2レーンを広く見せ、浅めの視点でネタの高さと皿の厚みを残す。
    camera.zoom = size.width / 5.2
    camera.position.set(0, 6, 9)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  return null
}

function WoodCounter() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128; canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#78502e'
    context.fillRect(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < 38; index++) {
      const x = index * 3.6
      context.strokeStyle = index % 3 === 0 ? '#593719' : '#8a5f37'
      context.lineWidth = index % 3 === 0 ? 0.7 : 1.2
      context.beginPath()
      context.moveTo(x, 0)
      context.bezierCurveTo(x + 5 * Math.sin(index), 170, x - 4 * Math.cos(index), 340, x, 512)
      context.stroke()
    }
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping
    map.repeat.set(3, 2)
    return map
  }, [])

  useEffect(() => () => { texture?.dispose() }, [texture])

  return <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[12, 34]} />
    <meshStandardMaterial color={texture ? '#fff2db' : '#78502e'} map={texture} roughness={0.83} metalness={0.02} />
  </mesh>
}

export function VerticalDraftScene({ onlineSupply, generalCards, buildCards, onBeltSelect, paused = false }: Props) {
  return <>
    <VerticalCamera />
    <color attach="background" args={['#57371f']} />
    <ambientLight intensity={1.2} color="#fff8ee" />
    <directionalLight position={[4, 9, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
    <pointLight position={[-4, 5, 0]} intensity={1.1} color="#ffba74" />
    <pointLight position={[4, 5, 0]} intensity={1.1} color="#ffba74" />
    <WoodCounter />

    {/* 元の横移動（x減少）を奥から手前（z増加）に向ける。皿と寿司の形状・購入処理は共通。 */}
    <group rotation={[0, Math.PI / 2, 0]}>
      <BeltLane3D label="" cards={generalCards} supply={onlineSupply && { ...onlineSupply, offers: onlineSupply.offers.filter(offer => offer.lane === 'general') }} duration={112} laneZ={-1.3} paused={paused} hideLabels portraitLabels plateSpacing={3.8} onSelect={onBeltSelect} />
      <BeltLane3D label="" cards={buildCards} supply={onlineSupply && { ...onlineSupply, offers: onlineSupply.offers.filter(offer => offer.lane === 'build') }} duration={96} laneZ={1.3} paused={paused} hideLabels portraitLabels plateSpacing={3.8} onSelect={onBeltSelect} />
    </group>
  </>
}

function ExpressCamera() {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera) || size.width <= 0 || size.height <= 0) return
    camera.zoom = Math.min(size.width / 2.05, size.height / 1.65)
    camera.position.set(-0.5, 6.25, 9)
    camera.lookAt(-0.5, 0.25, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  return null
}

export function VerticalExpressScene({ plate, onPickup, paused = false }: {
  plate: DraftState['shinkansenPlate']; onPickup: () => void; paused?: boolean
}) {
  return <>
    <ExpressCamera />
    <color attach="background" args={['#3c2a18']} />
    <ambientLight intensity={1.3} color="#fff8ee" />
    <directionalLight position={[3, 7, 5]} intensity={1.5} />
    <BeltLane3D label="" cards={[]} duration={1} laneZ={0} isShinkansen hideLabels onSelect={() => {}} />
    <ShinkansenPlate3D plate={plate} laneZ={0} onPickup={onPickup} hideLabels flatHighlight paused={paused} instantArrival={paused} />
  </>
}

export default VerticalDraftScene
