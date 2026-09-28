// Integration test: actual npm installs, PM2 daemon, TCP listeners, and rollback.
// All generated files and the isolated daemon live under the repository's .cache.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const deployDirectory = __dirname
const cache = process.env.SUSHI_TEST_NPM_CACHE || path.join(root, '.cache/npm-server-package')

function command(file, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Command timed out: ${output}`)) }, 120_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); resolve({ code, output }) })
  })
}

async function main() {
  await fs.mkdir(path.join(root, '.cache/dt'), { recursive: true })
  const fixture = await fs.mkdtemp(path.join(root, '.cache/dt/run-'))
  const base = path.join(fixture, 'b')
  const publicDirectory = path.join(fixture, 'public_html/sushi-battle')
  await fs.mkdir(path.join(base, 'staging'), { recursive: true })
  await fs.mkdir(publicDirectory, { recursive: true })
  await fs.writeFile(path.join(publicDirectory, 'index.html'), 'manual-upload')
  await fs.writeFile(path.join(fixture, 'public_html/unrelated.txt'), 'untouched')
  await fs.cp(path.join(cache, '_cacache'), path.join(base, 'npm-cache/_cacache'), { recursive: true })
  const manualServer = net.createServer()
  await new Promise(resolve => manualServer.listen(0, '127.0.0.1', resolve))
  const port = manualServer.address().port
  const env = {
    ...process.env,
    SUSHI_DEPLOY_BASE: base,
    SUSHI_PUBLIC_DIR: publicDirectory,
    SUSHI_PORT: String(port),
    npm_config_offline: 'true',
  }
  const stage = async (id, patch) => {
    const staging = path.join(base, 'staging', id)
    const backend = path.join(staging, 'sushi-battle-server')
    await fs.mkdir(path.join(staging, 'sushi-battle'), { recursive: true })
    await fs.writeFile(path.join(staging, 'sushi-battle/index.html'), id)
    // Keep the runtime fixture aligned with scripts/package-server.mjs.
    for (const relative of ['server', 'src/game', 'src/features/draft/draftEngine.ts', 'src/data/cards.ts', 'src/network/protocol.ts', 'src/network/httpProtocol.ts', 'src/types/index.ts', 'tsconfig.server.json']) {
      await fs.mkdir(path.dirname(path.join(backend, relative)), { recursive: true })
      await fs.cp(path.join(root, relative), path.join(backend, relative), { recursive: true })
    }
    for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(root, 'deploy/gms-server', name), path.join(backend, name))
    if (patch) await patch(backend)
    return staging
  }
  const deploy = async (id, patch) => command(process.execPath, [path.join(deployDirectory, 'deploy.cjs'), await stage(id, patch)], env)
  const readPublic = () => fs.readFile(path.join(publicDirectory, 'index.html'), 'utf8')
  const state = async () => JSON.parse(await fs.readFile(path.join(base, 'current.json'), 'utf8'))
  let pm2Path
  try {
    const occupied = await deploy('occupied')
    pm2Path = path.join(base, 'releases/occupied/sushi-battle-server/node_modules/pm2/bin/pm2')
    assert.equal(occupied.code, 1, occupied.output)
    assert.match(occupied.output, /occupied by an unmanaged process/)
    assert.equal(manualServer.listening, true)
    assert.equal(await readPublic(), 'manual-upload')
    await new Promise(resolve => manualServer.close(resolve))
    console.log('PASS: unmanaged listener is preserved and existing public files stay intact')

    const first = await deploy('first')
    assert.equal(first.code, 0, first.output)
    assert.equal(await readPublic(), 'first')
    assert.equal((await state()).releaseId, 'first')
    assert.equal(await fs.readFile(path.join(fixture, 'public_html/.sushi-battle-previous-first/index.html'), 'utf8'), 'manual-upload')
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).ok, true)
    const firstPid = await fs.readFile(path.join(base, 'pm2/pids/sushi-battle-0.pid'), 'utf8')
    console.log('PASS: fresh deployment runs in isolated PM2 after the deploying process exits')

    const invalidInstall = await deploy('bad-install', async backend => {
      const manifest = JSON.parse(await fs.readFile(path.join(backend, 'package.json'), 'utf8'))
      manifest.dependencies.pm2 = '0.0.0-this-version-must-not-exist'
      await fs.writeFile(path.join(backend, 'package.json'), JSON.stringify(manifest))
    })
    assert.equal(invalidInstall.code, 1, invalidInstall.output)
    assert.equal(await readPublic(), 'first')
    assert.equal(await fs.readFile(path.join(base, 'pm2/pids/sushi-battle-0.pid'), 'utf8'), firstPid)
    console.log('PASS: install failure preserves the active process and public files')

    const badStartup = await deploy('bad-preflight', backend => fs.writeFile(path.join(backend, 'server/index.ts'), 'throw new Error("intentional startup test")'))
    assert.equal(badStartup.code, 1, badStartup.output)
    assert.match(badStartup.output, /failed its startup check/)
    assert.equal(await readPublic(), 'first')
    assert.equal(await fs.readFile(path.join(base, 'pm2/pids/sushi-battle-0.pid'), 'utf8'), firstPid)
    console.log('PASS: preflight failure leaves the previous process running')

    const second = await deploy('second')
    assert.equal(second.code, 0, second.output)
    assert.equal(await readPublic(), 'second')
    assert.equal((await state()).releaseId, 'second')
    console.log('PASS: a later deployment restarts the managed app and replaces public files')

    const failedSwitch = await deploy('bad-switch', async backend => {
      const source = path.join(backend, 'server/index.ts')
      await fs.writeFile(source, `if (process.env.PORT !== '0') throw new Error('intentional fixed-port failure')\n${await fs.readFile(source, 'utf8')}`)
    })
    assert.equal(failedSwitch.code, 1, failedSwitch.output)
    assert.match(failedSwitch.output, /Previous backend and public files restored/)
    assert.equal(await readPublic(), 'second')
    assert.equal((await state()).releaseId, 'second')
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).ok, true)
    assert.equal(await fs.readFile(path.join(fixture, 'public_html/unrelated.txt'), 'utf8'), 'untouched')
    console.log('PASS: post-switch health failure restores the previous app; unrelated files stay untouched')
    console.log(`Deployment integration tests passed with ${process.version}; fixtures: ${fixture}`)
  } finally {
    if (manualServer.listening) await new Promise(resolve => manualServer.close(resolve))
    if (pm2Path) {
      const stopped = await command(process.execPath, [pm2Path, 'kill'], { ...env, PM2_HOME: path.join(base, 'pm2') })
      assert.equal(stopped.code, 0, stopped.output)
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
