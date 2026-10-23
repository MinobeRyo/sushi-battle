#!/usr/bin/env node
// サーバーが読み込む src のファイルが、配布物の一覧（scripts/package-server.mjs）にすべて入っているかを確かめる。
// 抜けていると、CIの配置テストで新しいサーバーが起動できずに失敗する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const listSource = fs.readFileSync(path.join(ROOT, 'scripts/package-server.mjs'), 'utf8')
const listed = [...listSource.matchAll(/'((?:src|server)[^']*)'/g)].map(match => match[1])

const seen = new Set()
const todo = ['server/index.ts']
while (todo.length > 0) {
  const file = todo.pop()
  if (seen.has(file)) continue
  seen.add(file)
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
  for (const match of source.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
    const base = path.normalize(path.join(path.dirname(file), match[1]))
    const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
      .find(candidate => fs.existsSync(path.join(ROOT, candidate)) && fs.statSync(path.join(ROOT, candidate)).isFile())
    if (found) todo.push(found)
  }
}

const covered = file => listed.some(entry => file === entry || file.startsWith(`${entry}/`))
const missing = [...seen].filter(file => !covered(file)).sort()
assert.deepEqual(missing, [], `サーバー配布物に入っていないファイル: ${missing.join(', ')}`)
console.log(`✓ サーバーが読む${seen.size}ファイルは、すべて配布物の一覧に入っている`)
