#!/usr/bin/env bash
set -euo pipefail

: "${GMS_SSH_KEY:?Register the GMS_SSH_KEY repository secret first}"
: "${GMS_KNOWN_HOSTS:?Register the verified GMS_KNOWN_HOSTS repository secret first}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

host=gms.gdl.jp
user=ryom13

umask 077
ssh_dir=$(mktemp -d "$RUNNER_TEMP/sushi-gms-check.XXXXXXXX")
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s\n' "$GMS_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$GMS_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
unset GMS_SSH_KEY GMS_KNOWN_HOSTS

ssh-keygen -y -P '' -f "$ssh_dir/key" > /dev/null
ssh-keygen -F "$host" -f "$ssh_dir/known_hosts" > /dev/null || {
  printf 'GMS_KNOWN_HOSTS does not contain the verified key for %s.\n' "$host" >&2
  exit 1
}
ssh_options=(
  -i "$ssh_dir/key"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$ssh_dir/known_hosts"
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)

# This remote command reads prerequisites only. It never installs, uploads,
# creates a deployment directory, or stops/restarts a process.
ssh "${ssh_options[@]}" -T "$user@$host" 'bash -l -s' <<'REMOTE' | tee "$ssh_dir/check.log"
set -euo pipefail
cd /home/h0/ryom13
command -v node > /dev/null || { printf 'Node.js is not available in the login PATH.\n' >&2; exit 1; }
command -v npm > /dev/null || { printf 'npm is not available in the login PATH.\n' >&2; exit 1; }
for directory in /home/h0/ryom13 /home/h0/ryom13/public_html; do
  [[ -d "$directory" && -w "$directory" ]] || {
    printf 'Deployment directory is missing or not writable: %s\n' "$directory" >&2
    exit 1
  }
done
node --version
npm --version
node --input-type=module <<'NODE'
const major = Number(process.versions.node.split('.')[0])
if (!Number.isInteger(major) || major < 20) {
  console.error('The deployment requires Node.js 20 or later.')
  process.exit(1)
}
try {
  const response = await fetch('http://127.0.0.1:3001/health', {
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  })
  const health = await response.json()
  if (!response.ok || health.ok !== true || health.roomTransport !== 'http-polling-v1') {
    throw new Error('The server did not return the expected PHP-polling health response.')
  }
  console.log('SUSHI_GAME_HEALTH=ready')
  console.log('The current game server responded correctly.')
} catch (error) {
  console.log('SUSHI_GAME_HEALTH=unavailable')
  console.error(`Current game status could not be verified: ${error.message}`)
  console.error('This does not prevent deployment preparation. The deploy operation will start and verify the new server.')
}
NODE
REMOTE

backend_ok=false
if grep -Fxq 'SUSHI_GAME_HEALTH=ready' "$ssh_dir/check.log"; then
  backend_ok=true
fi
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'backend_ok=%s\n' "$backend_ok" >> "$GITHUB_OUTPUT"
fi
printf 'Deployment prerequisites passed: SSH, Node.js, npm, and writable deployment locations.\n'
printf 'No files were transferred and no game processes were stopped or restarted.\n'
