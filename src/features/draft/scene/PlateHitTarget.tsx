import type { ThreeElements } from '@react-three/fiber'
import { createPlateHitGeometry } from './plateHitArea'

type Props = Pick<ThreeElements['mesh'], 'onClick' | 'onPointerOver' | 'onPointerOut'>
const hitGeometry = createPlateHitGeometry()

export function PlateHitTarget(props: Props) {
  return <mesh {...props} geometry={hitGeometry} dispose={null}>
    <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
  </mesh>
}
