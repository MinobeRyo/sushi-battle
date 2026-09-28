import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubApi, mergeVerifiedPullRequest } from './auto-merge-pr.mjs'

const repository = 'example/sushi-battle'
const root = `/repos/${repository}`

function fixture() {
  const run = {
    id: 10, run_attempt: 1, workflow_id: 20,
    path: '.github/workflows/deploy-gms.yml',
    event: 'pull_request', status: 'completed', conclusion: 'success',
    head_repository: { full_name: repository }, head_branch: 'feature', head_sha: 'tested-head',
    pull_requests: [{ number: 3 }],
  }
  const pr = {
    number: 3, state: 'open', draft: false, mergeable: true,
    base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'feature', sha: run.head_sha, repo: { full_name: repository } },
  }
  const state = {
    run, pr, event: { workflow_run: structuredClone(run) }, autoDeploy: true,
    jobs: [{ name: 'build', status: 'completed', conclusion: 'success' }],
    mainSha: 'merged-sha', calls: [], messages: [], mergeError: null, dispatchError: null,
  }
  state.api = async (method, path, body) => {
    state.calls.push({ method, path, body })
    if (path === `${root}/actions/runs/10`) return state.run
    if (path === `${root}/actions/workflows/deploy-gms.yml`) return { id: 20 }
    if (path === `${root}/actions/runs/10/jobs?filter=latest&per_page=100`) return { jobs: state.jobs }
    if (path === `${root}/pulls/3`) return state.pr
    if (path === `${root}/pulls/3/merge` && method === 'PUT') {
      if (state.mergeError) throw state.mergeError
      return { merged: true, sha: 'merged-sha' }
    }
    if (path === `${root}/git/ref/heads/main`) return { object: { sha: state.mainSha } }
    if (path === `${root}/actions/workflows/deploy-gms.yml/dispatches` && method === 'POST') {
      if (state.dispatchError) throw state.dispatchError
      return
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  }
  state.execute = () => mergeVerifiedPullRequest({
    api: state.api, event: state.event, repository, autoDeploy: state.autoDeploy,
    log: message => state.messages.push(message), wait: async () => {},
  })
  return state
}

const writes = state => state.calls.filter(call => call.method !== 'GET')

test('merges only the tested head and explicitly dispatches main deployment', async () => {
  const state = fixture()
  await state.execute()
  assert.deepEqual(writes(state), [
    { method: 'PUT', path: `${root}/pulls/3/merge`, body: { sha: 'tested-head', merge_method: 'merge' } },
    { method: 'POST', path: `${root}/actions/workflows/deploy-gms.yml/dispatches`, body: { ref: 'main', inputs: { operation: 'deploy' } } },
  ])
})

for (const [name, change] of [
  ['failed checks', s => { s.run.conclusion = 'failure' }],
  ['running checks', s => { s.run.status = 'in_progress' }],
  ['push event', s => { s.run.event = 'push' }],
  ['superseded check attempt', s => { s.run.run_attempt = 2 }],
  ['fork workflow', s => { s.run.head_repository.full_name = 'external/fork' }],
  ['different workflow ID', s => { s.run.workflow_id = 99 }],
  ['different workflow path', s => { s.run.path = '.github/workflows/other.yml' }],
  ['skipped build', s => { s.jobs[0].conclusion = 'skipped' }],
  ['missing build', s => { s.jobs = [] }],
  ['draft PR', s => { s.pr.draft = true }],
  ['new untested commit', s => { s.pr.head.sha = 'untested-head' }],
  ['fork PR', s => { s.pr.head.repo.full_name = 'external/fork' }],
  ['deleted head repository', s => { s.pr.head.repo = null }],
  ['another base branch', s => { s.pr.base.ref = 'release' }],
  ['different source branch', s => { s.pr.head.ref = 'other' }],
  ['merge conflict', s => { s.pr.mergeable = false }],
  ['unknown mergeability', s => { s.pr.mergeable = null }],
  ['closed PR', s => { s.pr.state = 'closed' }],
  ['unassociated PR', s => { s.run.pull_requests = [] }],
]) {
  test(`does not merge or deploy: ${name}`, async () => {
    const state = fixture()
    change(state)
    await state.execute()
    assert.deepEqual(writes(state), [])
  })
}

test('merges without deployment when automatic deployment is disabled', async () => {
  const state = fixture()
  state.autoDeploy = false
  await state.execute()
  assert.deepEqual(writes(state).map(call => call.method), ['PUT'])
})

for (const status of [405, 409, 422]) {
  test(`does not deploy when GitHub blocks the merge (${status})`, async () => {
    const state = fixture()
    state.mergeError = Object.assign(new Error('Merge blocked'), { status })
    await state.execute()
    assert.deepEqual(writes(state).map(call => call.method), ['PUT'])
    assert.ok(state.messages.some(message => message.includes(String(status))))
  })
}

test('reports permission failures', async () => {
  const state = fixture()
  state.mergeError = Object.assign(new Error('Permission denied'), { status: 403 })
  await assert.rejects(state.execute, /Permission denied/)
})

test('can retry deployment after a successful bot merge and failed dispatch', async () => {
  const state = fixture()
  state.dispatchError = new Error('Dispatch unavailable')
  await assert.rejects(state.execute, /Dispatch unavailable/)
  state.pr.state = 'closed'
  state.pr.merged = true
  state.pr.merged_by = { login: 'github-actions[bot]' }
  state.pr.merge_commit_sha = 'merged-sha'
  state.dispatchError = null
  state.calls = []
  await state.execute()
  assert.deepEqual(writes(state).map(call => call.method), ['POST'])
})

test('does not dispatch an older merge when main has advanced', async () => {
  const state = fixture()
  state.mainSha = 'newer-main'
  await state.execute()
  assert.deepEqual(writes(state).map(call => call.method), ['PUT'])
})

test('API adapter handles an empty dispatch response and preserves error status', async () => {
  const calls = []
  const api = githubApi({ token: 'test-token', fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: 204 })
  } })
  assert.equal(await api('POST', '/dispatch', { ref: 'main' }), undefined)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
  assert.equal(calls[0].options.body, '{"ref":"main"}')
  const blocked = githubApi({ token: 'test-token', fetchImpl: async () =>
    new Response('{"message":"Head changed"}', { status: 409 }) })
  await assert.rejects(() => blocked('PUT', '/merge', {}), { status: 409 })
})
