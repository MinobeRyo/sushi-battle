const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { createApp } = require('./ecosystem.config.cjs')

const appName = 'sushi-battle'
const base = path.resolve(process.env.SUSHI_DEPLOY_BASE || path.join(os.homedir(), '.sushi-battle-deploy'))
const publicDirectory = path.resolve(process.env.SUSHI_PUBLIC_DIR || path.join(os.homedir(), 'public_html/sushi-battle'))
const releases = path.join(base, 'releases')
const stateFile = path.join(base, 'current.json')
const origin = process.env.SUSHI_PUBLIC_ORIGIN || 'https://gms.gdl.jp'
const port = Number(process.env.SUSHI_PORT || 3001)

async function exists(file) {
  return fs.lstat(file).then(() => true, error => {
    if (error.code === 'ENOENT') return false
    throw error
  })
}

async function realDirectory(directory) {
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected a real directory: ${directory}`)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal || code})`)))
  })
}

function portAvailable(targetPort) {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error))
    listener.listen(targetPort, '127.0.0.1', () => listener.close(() => resolve(true)))
  })
}

async function healthy(targetPort) {
  try {
    const response = await fetch(`http://127.0.0.1:${targetPort}/health`, { signal: AbortSignal.timeout(1000) })
    return response.ok && (await response.json()).ok === true
  } catch { return false }
}

async function waitHealthy(targetPort, checkProcess = async () => true) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await checkProcess() && await healthy(targetPort)) return
    await delay(250)
  }
  throw new Error(`Health check failed on 127.0.0.1:${targetPort}`)
}

async function preflight(serverDirectory) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: serverDirectory,
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0', SUSHI_ALLOWED_ORIGINS: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let startupError
  child.once('error', error => { startupError = error })
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (startupError) throw startupError
      if (child.exitCode !== null) throw new Error(`New server failed its startup check: ${output.slice(-2000)}`)
      const match = output.match(/Sushi Battle room server: http:\/\/127\.0\.0\.1:(\d+)/)
      if (match && await healthy(Number(match[1]))) return
      await delay(250)
    }
    throw new Error(`New server did not pass its startup check: ${output.slice(-2000)}`)
  } finally {
    if (child.exitCode === null && child.pid) {
      child.kill('SIGTERM')
      for (let attempt = 0; attempt < 20 && child.exitCode === null && child.signalCode === null; attempt++) await delay(250)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }
}

async function main() {
  const staging = path.resolve(process.argv[2] || '')
  const releaseId = path.basename(staging)
  if (path.dirname(staging) !== path.join(base, 'staging') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(releaseId)) {
    throw new Error(`Staging must be a direct child of ${path.join(base, 'staging')} with a simple release name`)
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SUSHI_PORT must be between 1024 and 65535')
  const parsedOrigin = new URL(origin)
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) throw new Error('SUSHI_PUBLIC_ORIGIN must be an HTTP(S) origin without a trailing slash')
  await realDirectory(staging)
  await realDirectory(path.join(staging, 'sushi-battle'))
  await realDirectory(path.join(staging, 'sushi-battle-server'))
  for (const file of ['sushi-battle/index.html', 'sushi-battle-server/package.json', 'sushi-battle-server/package-lock.json', 'sushi-battle-server/server/index.ts']) {
    const stat = await fs.lstat(path.join(staging, file))
    if (!stat.isFile()) throw new Error(`Missing regular deployment file: ${file}`)
  }
  await fs.mkdir(base, { recursive: true, mode: 0o700 })
  await realDirectory(base)
  await fs.mkdir(releases, { recursive: true, mode: 0o700 })
  await realDirectory(releases)
  await realDirectory(path.dirname(publicDirectory))
  if (await exists(publicDirectory)) await realDirectory(publicDirectory)
  const lock = path.join(base, 'deploy.lock')
  try { await fs.mkdir(lock, { mode: 0o700 }) } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another deployment is running, or an interrupted run left ${lock}; inspect it before retrying`)
    throw error
  }

  let pm2
  let connected = false
  let switchedServer = false
  let publicBackedUp = false
  let publicInstalled = false
  let previous
  const release = path.join(releases, releaseId)
  const serverDirectory = path.join(release, 'sushi-battle-server')
  const publicStage = path.join(path.dirname(publicDirectory), `.sushi-battle-next-${releaseId}`)
  const publicBackup = path.join(path.dirname(publicDirectory), `.sushi-battle-previous-${releaseId}`)
  const invoke = (method, ...args) => new Promise((resolve, reject) => pm2[method](...args, (error, value) => error ? reject(error) : resolve(value)))
  const managedApps = async () => (await invoke('list')).filter(app => app.name === appName)
  try {
    if (await exists(release) || await exists(publicStage) || await exists(publicBackup)) throw new Error('This release name was already used; run the deployment with a new release name')
    if (await exists(stateFile)) {
      previous = JSON.parse(await fs.readFile(stateFile, 'utf8'))
      if (path.dirname(path.dirname(previous.serverDirectory || '')) !== releases) throw new Error('Previous deployment state has an unexpected server directory')
    }
    await fs.rename(staging, release)
    console.log(`Installing dependencies in staged release ${releaseId}`)
    await run('npm', ['ci', '--omit=dev', '--engine-strict', '--no-fund', '--cache', path.join(base, 'npm-cache')], { cwd: serverDirectory })
    await preflight(serverDirectory)
    await fs.cp(path.join(release, 'sushi-battle'), publicStage, { recursive: true, errorOnExist: true, force: false })

    // A separate PM2 namespace prevents this deployment from touching other apps.
    process.env.PM2_HOME = path.join(base, 'pm2')
    pm2 = require(path.join(serverDirectory, 'node_modules/pm2'))
    await invoke('connect')
    connected = true
    const expectedPm2Version = require(path.join(serverDirectory, 'node_modules/pm2/package.json')).version
    if (await invoke('getVersion') !== expectedPm2Version) {
      throw new Error(`The isolated PM2 daemon uses another version; update it to ${expectedPm2Version} during maintenance before deploying. No processes were changed.`)
    }
    const apps = await invoke('list')
    if (apps.some(app => app.name !== appName) || apps.filter(app => app.name === appName).length > 1) throw new Error('Unexpected processes in the Sushi Battle PM2 namespace; no processes were changed')
    const previousApp = apps[0]
    if (previousApp && (!previous || previousApp.pm2_env.pm_cwd !== previous.serverDirectory)) throw new Error('Existing PM2 process does not match the saved Sushi Battle release; no processes were changed')
    if (!await portAvailable(port) && (!previousApp || previousApp.pm2_env.status !== 'online')) {
      throw new Error(`Port ${port} is already occupied by an unmanaged process. If this is the server you started manually, press Ctrl+C in that terminal once, then rerun deployment. This script will not stop it.`)
    }

    switchedServer = true
    if (previousApp) await invoke('delete', appName)
    if (!await portAvailable(port)) throw new Error(`Port ${port} is still occupied; no unmanaged process was stopped`)
    await invoke('start', createApp(serverDirectory, origin, port))
    await waitHealthy(port, async () => (await managedApps()).some(app => app.pm2_env.status === 'online' && app.pm2_env.pm_cwd === serverDirectory))
    if (await exists(publicDirectory)) {
      await fs.rename(publicDirectory, publicBackup)
      publicBackedUp = true
    }
    await fs.rename(publicStage, publicDirectory)
    publicInstalled = true
    await invoke('dump')
    const nextState = `${stateFile}.${releaseId}.tmp`
    await fs.writeFile(nextState, JSON.stringify({ releaseId, serverDirectory, origin, port }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    await fs.rename(nextState, stateFile)
    console.log(`Deployed ${releaseId}. Backend health check passed; public files: ${publicDirectory}`)
    console.log('PM2 keeps this app running after SSH logout. Server reboot startup is not configured. Verify the public api.php endpoint separately.')
  } catch (error) {
    if (publicInstalled) await fs.rename(publicDirectory, publicStage)
    if (publicBackedUp) await fs.rename(publicBackup, publicDirectory)
    if (switchedServer && connected) {
      try {
        if ((await managedApps()).length) await invoke('delete', appName)
        if (previous) {
          await invoke('start', createApp(previous.serverDirectory, previous.origin, previous.port))
          await waitHealthy(previous.port)
          await invoke('dump')
          console.error('Previous backend and public files restored. Active matches cannot be restored after a restart.')
        } else {
          await invoke('dump', true)
        }
      } catch (rollbackError) {
        console.error(`Automatic rollback needs attention: ${rollbackError.message}`)
      }
    }
    throw error
  } finally {
    if (connected) pm2.disconnect()
    await fs.rmdir(lock)
  }
}

main().catch(error => {
  console.error(`Deployment failed: ${error.message}`)
  process.exitCode = 1
})
