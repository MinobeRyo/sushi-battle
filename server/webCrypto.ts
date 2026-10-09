// Node と Cloudflare Workers の両方にある Web Crypto だけを使う。

export function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** 0 以上 max 未満の一様な整数。剰余の偏りは棄却して避ける。 */
export function randomBelow(max: number) {
  if (!Number.isSafeInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('max must be between 1 and 2^32')
  const limit = 2 ** 32 - (2 ** 32 % max)
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= limit)
  return buffer[0] % max
}

export function randomId() {
  return crypto.randomUUID()
}

/** 同じ長さの16進文字列を、一致する位置に関係なく同じ手順で比較する。 */
export function sameHex(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

/** Node ではプロセス終了を妨げないようにする。Workers のタイマーは数値なので何もしない。 */
export function detachTimer(timer: unknown) {
  if (timer && typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') timer.unref()
}
