#!/usr/bin/env bash
set -euo pipefail

archive=${1:?Usage: upload.sh <release.tgz>}
: "${GMS_SSH_KEY:?Register the GMS_SSH_KEY repository secret first}"
: "${GMS_KNOWN_HOSTS:?Register the verified GMS_KNOWN_HOSTS repository secret first}"
: "${GMS_DEPLOY_ID:?GMS_DEPLOY_ID is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
[[ -f "$archive" ]] || { printf 'Release archive was not found.\n' >&2; exit 1; }
[[ "$GMS_DEPLOY_ID" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { printf 'Invalid deployment identifier.\n' >&2; exit 1; }

host=gms.gdl.jp
user=ryom13
remote_base=/home/h0/ryom13/.sushi-battle-deploy
remote_archive="$remote_base/incoming/$GMS_DEPLOY_ID.tgz"
remote_stage="$remote_base/staging/$GMS_DEPLOY_ID"

umask 077
ssh_dir=$(mktemp -d "$RUNNER_TEMP/sushi-gms-ssh.XXXXXXXX")
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s\n' "$GMS_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$GMS_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
unset GMS_SSH_KEY GMS_KNOWN_HOSTS

# The deployment key is dedicated to unattended use; never prompt in CI.
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

ssh "${ssh_options[@]}" -T "$user@$host" \
  "umask 077; mkdir -p -- '$remote_base/incoming' '$remote_stage'"
scp "${ssh_options[@]}" "$archive" "$user@$host:$remote_archive"
ssh "${ssh_options[@]}" -T "$user@$host" \
  "bash -l -s -- '$remote_archive' '$remote_stage'" <<'REMOTE'
set -euo pipefail
archive=$1
staging=$2
tar -xzf "$archive" -C "$staging"
bash "$staging/deploy.sh" "$staging"
REMOTE
