import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Optional isolated test dependency; the game and deployed server do not need PHP-WASM.
// npm install --prefix .cache/php-bridge-runtime --ignore-scripts --no-audit --no-fund \
//   --save-exact @php-wasm/node@3.1.55 @php-wasm/universal@3.1.55
// PHP_WASM_MODULES=.cache/php-bridge-runtime/node_modules node --import tsx scripts/test-php-bridge.mjs
// Without PHP_WASM_MODULES, a native `php` executable with cURL is used (for CI).
const source = await readFile(new URL('../deploy/gms/api.php', import.meta.url), 'utf8')
const upstreamRequests = []
const pendingTimers = new Set()
let handler = (_request, response) => response.end(JSON.stringify({ ok: true, roomTransport: 'http-polling-v1' }))
const upstream = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  upstreamRequests.push({ url: request.url, method: request.method, headers: request.headers, body })
  response.setHeader('Content-Type', 'application/json')
  handler(request, response)
})
await new Promise((resolveListen, reject) => {
  upstream.once('error', reject)
  upstream.listen(0, '127.0.0.1', resolveListen)
})
const testSource = source.replaceAll('http://127.0.0.1:3001/', `http://127.0.0.1:${upstream.address().port}/`)
assert.equal(source.match(/http:\/\/127\.0\.0\.1:3001\//g)?.length, 2)

async function createPhpRunner(code) {
  if (process.env.PHP_WASM_MODULES) {
    const modules = resolve(process.env.PHP_WASM_MODULES)
    const { PHP } = await import(pathToFileURL(resolve(modules, '@php-wasm/universal/index.js')))
    const { loadNodeRuntime } = await import(pathToFileURL(resolve(modules, '@php-wasm/node/index.js')))
    const php = new PHP(await loadNodeRuntime(process.env.PHP_TEST_VERSION ?? '8.3', {
      emscriptenOptions: { processId: 1 },
    }))
    php.writeFile('/api.php', code)
    return {
      run: options => php.run({ scriptPath: '/api.php', ...options,
        body: options.body === undefined ? undefined : new TextEncoder().encode(options.body),
      }),
      update: value => php.writeFile('/api.php', value),
      close: () => php.exit(),
      label: `PHP ${process.env.PHP_TEST_VERSION ?? '8.3'} WASM`,
    }
  }

  await mkdir('.cache', { recursive: true })
  const directory = await mkdtemp(resolve('.cache/php-bridge-test-'))
  const scriptPath = resolve(directory, 'api.php')
  await writeFile(scriptPath, code)
  const reservation = createServer()
  await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen))
  const port = reservation.address().port
  await new Promise(resolveClose => reservation.close(resolveClose))
  // This fixture rewrites api.php when switching from the mock to the real backend.
  // Disable opcode caching only in the test server so that rewrite is immediate,
  // independently of the host php.ini and OPcache's timestamp recheck interval.
  const child = spawn(process.env.PHP_BIN ?? 'php', [
    '-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0',
    '-S', `127.0.0.1:${port}`, '-t', directory,
  ], {
    cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'],
  })
  let startupOutput = ''
  child.stderr.on('data', chunk => { startupOutput += chunk.toString() })
  try {
    await new Promise((resolveStarted, reject) => {
      const deadline = setTimeout(() => reject(new Error(`PHP start timed out: ${startupOutput}`)), 5000)
      const failed = error => { clearTimeout(deadline); reject(error) }
      child.once('error', failed)
      child.once('exit', code => failed(new Error(`PHP exited (${code}): ${startupOutput}`)))
      child.stderr.on('data', () => {
        if (startupOutput.includes('Development Server')) {
          clearTimeout(deadline)
          resolveStarted()
        }
      })
    })
  } catch (error) {
    child.kill('SIGTERM')
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  return {
    run: options => new Promise((resolveRequest, reject) => {
      const headers = { ...options.headers }
      if (options.body !== undefined && options.$_SERVER?.CONTENT_LENGTH !== '0') {
        headers['Content-Length'] = Buffer.byteLength(options.body)
      }
      const outgoing = httpRequest({ host: '127.0.0.1', port, path: options.relativeUri,
        method: options.method, headers, timeout: 6000 }, response => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { text += chunk })
        response.on('end', () => resolveRequest({
          text, errors: '', httpStatusCode: response.statusCode,
          headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])),
        }))
      })
      outgoing.once('error', reject)
      outgoing.once('timeout', () => outgoing.destroy(new Error('PHP request timed out')))
      if (options.body !== undefined) outgoing.write(options.body)
      outgoing.end()
    }),
    update: value => writeFile(scriptPath, value),
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await new Promise(resolveExit => child.once('exit', resolveExit))
      }
      await rm(directory, { recursive: true, force: true })
    },
    label: 'native PHP',
  }
}
let php
try {
  php = await createPhpRunner(testSource)
} catch (error) {
  await new Promise(resolveClose => upstream.close(resolveClose))
  throw error
}
const postHeaders = { 'Content-Type': 'application/json', Origin: 'https://gms.gdl.jp' }
const request = async (options = {}) => {
  const response = await php.run({
    scriptPath: '/api.php',
    relativeUri: '/api.php?url=https://example.invalid/private',
    method: 'POST',
    headers: postHeaders,
    body: '{"event":"room:create"}',
    ...options,
  })
  assert.equal(response.errors, '', 'PHP must not emit warnings or expose internal errors')
  return { status: response.httpStatusCode, body: JSON.parse(response.text), headers: response.headers }
}
let passed = 0
const test = async (name, run) => {
  await run()
  passed += 1
  console.log(`PASS ${name}`)
}
const rejectBeforeUpstream = async (options, status, error) => {
  const before = upstreamRequests.length
  const response = await request(options)
  assert.equal(response.status, status)
  assert.deepEqual(response.body, { ok: false, error })
  assert.equal(upstreamRequests.length, before)
}

try {
  await test('GET checks the fixed health route and disables caching', async () => {
    const response = await request({ method: 'GET', body: undefined, headers: {} })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { ok: true, transport: 'php-polling' })
    assert.equal(upstreamRequests.at(-1).url, '/health')
    assert.deepEqual(response.headers['cache-control'], ['no-store'])
    assert.deepEqual(response.headers['x-content-type-options'], ['nosniff'])
  })
  await test('POST preserves JSON and forwards only the fixed route and allowed headers', async () => {
    const payload = JSON.stringify({ event: 'room:create', payload: { label: '日本語' } })
    const response = await request({ body: payload, headers: {
      ...postHeaders, Cookie: 'private=value', Authorization: 'Bearer private',
      'X-Forwarded-For': '203.0.113.1', 'X-Target': 'http://example.invalid',
    } })
    assert.equal(response.status, 200)
    const forwarded = upstreamRequests.at(-1)
    assert.equal(forwarded.url, '/api/room')
    assert.equal(forwarded.method, 'POST')
    assert.equal(forwarded.body, payload)
    assert.equal(forwarded.headers.origin, 'https://gms.gdl.jp')
    for (const key of ['cookie', 'authorization', 'x-forwarded-for', 'x-target']) {
      assert.equal(forwarded.headers[key], undefined)
    }
  })
  await test('missing, foreign, suffix and null origins are rejected before forwarding', async () => {
    for (const origin of ['', 'https://example.invalid', 'https://gms.gdl.jp.evil.invalid', 'null']) {
      await rejectBeforeUpstream({ headers: { ...postHeaders, Origin: origin } }, 403, 'origin_not_allowed')
    }
  })
  await test('unsupported methods and non-JSON content are rejected', async () => {
    await rejectBeforeUpstream({ method: 'PUT' }, 405, 'method_not_allowed')
    await rejectBeforeUpstream({ headers: { ...postHeaders, 'Content-Type': 'text/plain' } }, 415, 'json_required')
  })
  await test('malformed JSON, arrays and scalars are rejected', async () => {
    for (const body of ['{', '[]', 'null', 'true', '"text"']) {
      await rejectBeforeUpstream({ body }, 400, 'invalid_json')
    }
  })
  await test('declared and actual bodies over 16 KiB are rejected', async () => {
    await rejectBeforeUpstream({ body: JSON.stringify({ data: 'a'.repeat(20000) }) }, 413, 'request_too_large')
    await rejectBeforeUpstream({ body: JSON.stringify({ data: 'a'.repeat(16384) }), $_SERVER: { CONTENT_LENGTH: '0' } }, 413, 'request_too_large')
  })
  await test('an exactly 16 KiB valid JSON request is accepted', async () => {
    const body = JSON.stringify({ data: 'a'.repeat(16373) })
    assert.equal(Buffer.byteLength(body), 16384)
    assert.equal((await request({ body })).status, 200)
  })
  await test('upstream error status and JSON are preserved', async () => {
    handler = (_request, response) => {
      response.statusCode = 429
      response.end('{"ok":false,"error":"rate_limited"}')
    }
    const response = await request()
    assert.equal(response.status, 429)
    assert.deepEqual(response.body, { ok: false, error: 'rate_limited' })
  })
  await test('GET rejects unhealthy or old backends without the required HTTP transport', async () => {
    for (const [status, body] of [
      [503, '{"ok":true,"roomTransport":"http-polling-v1"}'],
      [200, '{"ok":false,"roomTransport":"http-polling-v1"}'],
      [200, '{"ok":true}'],
      [200, '{"ok":true,"roomTransport":"unknown-version"}'],
    ]) {
      handler = (_request, response) => {
        response.statusCode = status
        response.end(body)
      }
      assert.equal((await request({ method: 'GET', body: undefined, headers: {} })).status, 503)
    }
  })
  await test('upstream redirects are not followed', async () => {
    handler = (_request, response) => {
      response.statusCode = 302
      response.setHeader('Location', 'http://127.0.0.1:3001/private')
      response.end('{"ok":true}')
    }
    const before = upstreamRequests.length
    assert.equal((await request()).status, 503)
    assert.equal(upstreamRequests.length, before + 1)
  })
  await test('malformed and non-object upstream responses are hidden', async () => {
    for (const value of ['upstream private error', '[]', 'null']) {
      handler = (_request, response) => response.end(value)
      const response = await request()
      assert.equal(response.status, 503)
      assert.deepEqual(response.body, { ok: false, error: 'server_unavailable' })
    }
  })
  await test('upstream output is capped at 256 KiB', async () => {
    handler = (_request, response) => response.end(JSON.stringify({ data: 'a'.repeat(262144) }))
    assert.equal((await request()).status, 503)
  })
  await test('a slow upstream stops within the three-second timeout', async () => {
    handler = (_request, response) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        response.end('{"ok":true}')
      }, 5000)
      pendingTimers.add(timer)
    }
    const start = performance.now()
    assert.equal((await request()).status, 503)
    assert.ok(performance.now() - start < 4500)
  })
  await test('a stopped upstream returns a generic 503', async () => {
    upstream.closeAllConnections()
    await new Promise(resolveClose => upstream.close(resolveClose))
    assert.deepEqual((await request()).body, { ok: false, error: 'server_unavailable' })
  })
  const { createGameServer } = await import('../server/gameServer.ts')
  const game = await createGameServer({ port: 0, allowedOrigins: ['https://gms.gdl.jp'] })
  try {
    await php.update(source.replaceAll('http://127.0.0.1:3001/', `${game.url}/`))
    await test('GET confirms the real game backend supports HTTP polling', async () => {
      const response = await request({ method: 'GET', body: undefined, headers: {} })
      assert.equal(response.status, 200)
      assert.deepEqual(response.body, { ok: true, transport: 'php-polling' })
    })
    await test('two players create, join, act and poll through real PHP and the game server', async () => {
      const call = async (clientId, event, payload) => {
        const response = await request({ body: JSON.stringify({ clientId, event, payload }) })
        assert.equal(response.status, 200)
        return response.body
      }
      const first = 'a'.repeat(64)
      const second = 'b'.repeat(64)
      const created = await call(first, 'room:create')
      assert.equal(created.reply.ok, true)
      const joined = await call(second, 'room:join', { code: created.reply.session.code })
      assert.equal(joined.reply.ok, true)
      const before = (await call(first, 'poll')).snapshot
      assert.ok(before.match)
      assert.equal(before.connected[1], true)
      assert.equal(before.connected[2], true)
      assert.equal(before.match.opponent.hand, undefined)
      const active = before.match.activePlayerId === 1 ? first : second
      const action = await call(active, 'match:action', {
        matchId: before.match.matchId, expectedRevision: before.match.revision,
        actionId: 'php-bridge-end-turn', type: 'end_turn',
      })
      assert.equal(action.reply.ok, true)
      const [afterFirst, afterSecond] = await Promise.all([call(first, 'poll'), call(second, 'poll')])
      assert.equal(afterFirst.snapshot.match.revision, afterSecond.snapshot.match.revision)
      assert.ok(afterFirst.snapshot.match.revision > before.match.revision)
      assert.equal(afterFirst.snapshot.match.opponent.hand, undefined)
      assert.equal(afterSecond.snapshot.match.opponent.hand, undefined)
      const resumed = await call('c'.repeat(64), 'room:resume', created.reply.session)
      assert.equal(resumed.reply.ok, true)
      assert.equal(resumed.reply.snapshot.match.revision, afterFirst.snapshot.match.revision)
    })
  } finally {
    await game.close()
  }
  console.log(`${passed} PHP bridge integration checks passed (${php.label}, actual cURL and local HTTP).`)
} finally {
  for (const timer of pendingTimers) clearTimeout(timer)
  upstream.closeAllConnections()
  await new Promise(resolveClose => upstream.close(resolveClose))
  await php.close()
}
