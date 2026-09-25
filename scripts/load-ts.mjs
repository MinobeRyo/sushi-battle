// TypeScriptをメモリ内で変換して読み込む、画面や一時ファイルに依存しないテスト用loader。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.SUSHI_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(import.meta.url)
const ts = require_(path.join(ROOT, 'node_modules/typescript'))
const defaultOverrides = {}
const caches = new WeakMap()

export function loadTs(relativePath, overrides = defaultOverrides) {
  let modules = caches.get(overrides)
  if (!modules) {
    modules = new Map()
    caches.set(overrides, modules)
  }
  const filename = path.resolve(ROOT, relativePath)
  if (modules.has(filename)) return modules.get(filename).exports
  const module = { exports: {} }
  modules.set(filename, module)
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const localRequire = specifier => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
    if (!specifier.startsWith('.')) return require_(specifier)
    const dependency = path.resolve(path.dirname(filename), specifier)
    const resolved = [dependency, `${dependency}.ts`, path.join(dependency, 'index.ts')]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    if (!resolved) throw new Error(`TypeScript依存が見つかりません: ${specifier} (${filename})`)
    return loadTs(resolved, overrides)
  }
  try {
    new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports)
  } catch (error) {
    modules.delete(filename)
    throw error
  }
  return module.exports
}
