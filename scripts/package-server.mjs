import { cp, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifestDir = path.join(root, 'deploy/gms-server')
// 配布と起動・復旧テストで同じコピー処理を使い、依存ファイルの取りこぼしを防ぐ。
export async function packageServer(output = path.join(root, 'release/gms/sushi-battle-server')) {
  const manifest = JSON.parse(await readFile(path.join(manifestDir, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(path.join(manifestDir, 'package-lock.json'), 'utf8'))

  if (JSON.stringify(manifest.dependencies) !== JSON.stringify(lock.packages?.['']?.dependencies)) {
    throw new Error('Server package.json and package-lock.json dependencies must match')
  }

  await mkdir(output, { recursive: true })
  for (const relative of ['server', 'src/game', 'src/features/draft/draftEngine.ts', 'src/data/cards.ts', 'src/data/cardVariants.ts', 'src/data/cpuDecks.ts', 'src/data/sideMenus.ts', 'src/network/protocol.ts', 'src/network/httpProtocol.ts', 'src/types/index.ts', 'tsconfig.server.json']) {
    const destination = path.join(output, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(path.join(root, relative), destination, { recursive: true })
  }
  for (const filename of ['package.json', 'package-lock.json', '起動方法.txt']) {
    await cp(path.join(manifestDir, filename), path.join(output, filename))
  }
  return output
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Server upload package: ${await packageServer()}`)
}
