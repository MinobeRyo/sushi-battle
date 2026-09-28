#!/usr/bin/env node
// WebGLなしで実際のThree.jsの交差判定を使い、別レーンの皿への誤選択を検出する。
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { loadTs } from './load-ts.mjs'

const { createPlateHitGeometry } = loadTs('src/features/draft/scene/plateHitArea.ts')
// 従来の視点と、7皿表示で使う低い視点の両方で押し間違いを検出する。
for (const cameraHeight of [7, 5]) describe(`カメラの高さ ${cameraHeight}`, () => {
// DraftCameraの正面方向。平行投影なので画面サイズにかかわらず同じ光線方向になる。
const direction = new Vector3(0, cameraHeight, 9).normalize()
const laneZs = [-2.6, 0, 2.6]
const material = new MeshBasicMaterial()

function plate(x, laneZ) {
  const mesh = new Mesh(createPlateHitGeometry(), material)
  mesh.position.set(x, 0, laneZ)
  mesh.updateMatrixWorld(true)
  return mesh
}

function assertSelectsOwnPlate(localPoint, laneZ, neighborOffset = 0) {
  const selected = plate(0, laneZ)
  const others = laneZs.flatMap(z => [-2.3, 0, 2.3]
    .filter(x => z !== laneZ || x !== 0)
    .map(x => plate(x + (z === laneZ ? 0 : neighborOffset), z)))
  const point = new Vector3(...localPoint).add(new Vector3(0, 0, laneZ))
  const ray = new Raycaster(point.clone().addScaledVector(direction, 20), direction.clone().negate())
  const hit = ray.intersectObjects([selected, ...others], true)[0]
  assert.ok(hit?.object === selected,
    `レーンz=${laneZ}、皿の点${localPoint}、隣列x差=${neighborOffset}が別の皿に遮られています`)
}

test('特急・汎用の皿名と前縁を押しても手前レーンを選択しない', () => {
  for (const laneZ of laneZs) {
    for (const offset of [-1.15, 0, 1.15]) {
      assertSelectsOwnPlate([0, 0.14, 0.58], laneZ, offset)
      assertSelectsOwnPlate([0, 0.10, 0.75], laneZ, offset)
    }
  }
})

test('ホバー拡大中も皿の全周から同じ皿を選択できる', () => {
  const radius = 0.72 * 1.12
  for (const laneZ of laneZs) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      assertSelectsOwnPlate([Math.sin(angle) * radius, 0.12, Math.cos(angle) * radius], laneZ)
    }
  }
})

test('背の高い寿司の上端と横端からも同じ皿を選択できる', () => {
  // 汎用軍艦の具材上端: y=.56、球半径=.34、Y倍率=.62。
  const gunkanTop = 0.56 + 0.34 * 0.62
  for (const laneZ of laneZs) {
    for (const point of [[0, gunkanTop, 0], [0.44, 0.67, 0.05], [-0.7, 0.38, 0]]) {
      assertSelectsOwnPlate(point, laneZ)
    }
  }
})

})
