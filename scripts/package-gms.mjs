import { spawn } from 'node:child_process'
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'release/gms')

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)))
  })
}

await run('npm', ['run', 'build', '--', '--base=/~ryom13/sushi-battle/', '--outDir=release/gms/sushi-battle'], {
  ...process.env, VITE_ROOM_TRANSPORT: 'php',
})
await run(process.execPath, ['scripts/package-server.mjs'])
await mkdir(output, { recursive: true })
await cp(path.join(root, 'deploy/gms/api.php'), path.join(output, 'sushi-battle/api.php'))
await cp(path.join(root, 'deploy/gms/static.htaccess'), path.join(output, 'sushi-battle/.htaccess'))
for (const name of ['deploy.sh', 'deploy.cjs', 'ecosystem.config.cjs']) {
  await cp(path.join(root, 'deploy/gms', name), path.join(output, name))
}
await cp(path.join(root, 'docs/PHP経由の配置手順.md'), path.join(output, '配置手順.md'))
console.log(`GMS upload package (PHP polling): ${output}`)
