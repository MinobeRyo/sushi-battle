const path = require('node:path')

function createApp(serverDirectory, origin, port) {
  return {
    name: 'sushi-battle',
    cwd: serverDirectory,
    // PM2 treats spaces in `script` as a shell command, so keep this relative.
    script: 'server/index.ts',
    interpreter: process.execPath,
    node_args: ['--import', path.join(serverDirectory, 'node_modules/tsx/dist/loader.mjs')],
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 2000,
    max_restarts: 10,
    kill_timeout: 5000,
    watch: false,
    vizion: false,
    time: true,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      SUSHI_ALLOWED_ORIGINS: origin,
    },
  }
}

module.exports = {
  apps: [createApp(
    path.join(__dirname, 'sushi-battle-server'),
    process.env.SUSHI_PUBLIC_ORIGIN || 'https://gms.gdl.jp',
    Number(process.env.SUSHI_PORT || 3001),
  )],
  createApp,
}
