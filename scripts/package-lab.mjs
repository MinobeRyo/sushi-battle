import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'release/gms')
const serverOutput = path.join(output, 'sushi-battle-server')

// このスクリプト専用の生成先だけを作り直す。画面はbuild:labが生成する。
await rm(serverOutput, { recursive: true, force: true })
await mkdir(serverOutput, { recursive: true })
for (const relative of [
  'server', 'src/game', 'src/data', 'src/network', 'src/types',
  'package.json', 'package-lock.json', 'tsconfig.server.json',
]) {
  const destination = path.join(serverOutput, relative)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(path.join(root, relative), destination, { recursive: true })
}
await cp(path.join(root, 'docs/ゼミサーバーへの配置.md'), path.join(output, '配置手順.md'))
await writeFile(path.join(serverOutput, '起動方法.txt'), `このフォルダは公開フォルダの外へ配置してください。
想定配置先: /home/h0/ryom13/sushi-battle-server

サーバーのターミナルで:
cd /home/h0/ryom13/sushi-battle-server
npm ci --include=dev
HOST=127.0.0.1 PORT=3001 SUSHI_ALLOWED_ORIGINS=https://gms.gdl.jp npm run server

この操作にはSSHまたはコマンドを実行できる管理画面が必要です。
Node.jsを起動できること、3001番ポートを利用できることは未確認です。
本番Webサーバーに /socket.io/ のHTTP/WebSocket中継設定が別途必要です。
npm run serverは前面で実行します。常時運用の方法は管理者と調整してください。
`)
console.log(`転送用フォルダを作成しました: ${output}`)
console.log('sushi-battle → /home/h0/ryom13/public_html/ 内')
console.log('sushi-battle-server → /home/h0/ryom13/ 内')
