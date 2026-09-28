import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const workflowPath = '.github/workflows/deploy-gms.yml'

export async function mergeVerifiedPullRequest({ api, event, repository, autoDeploy, log = console.log, wait = delay }) {
  const originalRun = event.workflow_run
  const skip = reason => log(`Skipped: ${reason}`)
  if (!originalRun || !Number.isSafeInteger(originalRun.id)) return skip('no completed workflow run')
  const root = `/repos/${repository}`
  const run = await api('GET', `${root}/actions/runs/${originalRun.id}`)
  if (run.event !== 'pull_request' || run.status !== 'completed' || run.conclusion !== 'success') {
    return skip('PR checks have not succeeded')
  }
  if (run.run_attempt !== originalRun.run_attempt) return skip('a different check attempt is current')
  if (run.head_repository?.full_name !== repository) return skip('fork PR')
  const workflow = await api('GET', `${root}/actions/workflows/deploy-gms.yml`)
  if (run.workflow_id !== workflow.id || run.path !== workflowPath) return skip('unexpected check workflow')
  const { jobs } = await api('GET', `${root}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)
  if (!jobs.some(job => job.name === 'build' && job.status === 'completed' && job.conclusion === 'success')) {
    return skip('the build job did not succeed')
  }

  for (const candidate of run.pull_requests ?? []) {
    if (!Number.isSafeInteger(candidate.number)) continue
    const prPath = `${root}/pulls/${candidate.number}`
    let pr = await api('GET', prPath)
    for (let attempt = 0; pr.state === 'open' && pr.mergeable === null && attempt < 3; attempt++) {
      await wait(1000)
      pr = await api('GET', prPath)
    }
    if (pr.base?.ref !== 'main' || pr.base.repo?.full_name !== repository ||
        pr.head?.repo?.full_name !== repository || pr.head.ref !== run.head_branch) continue
    if (pr.draft || pr.head.sha !== run.head_sha) {
      skip(`PR #${pr.number} is a draft or has newer commits`)
      continue
    }

    // A rerun can recover a failed dispatch after this bot already merged the PR.
    let mergeSha
    if (pr.state === 'closed' && pr.merged && pr.merged_by?.login === 'github-actions[bot]') {
      mergeSha = pr.merge_commit_sha
      log(`PR #${pr.number} was already merged by this automation.`)
    } else {
      if (pr.state !== 'open' || pr.mergeable !== true) {
        skip(`PR #${pr.number} is closed or cannot be merged`)
        continue
      }
      let result
      try {
        // The SHA precondition prevents merging a commit added after validation.
        // GitHub still enforces any configured branch protection and review rules.
        result = await api('PUT', `${prPath}/merge`, { sha: run.head_sha, merge_method: 'merge' })
      } catch (error) {
        if ([405, 409, 422].includes(error.status)) {
          skip(`PR #${pr.number} is blocked by GitHub or changed before merging (${error.status})`)
          continue
        }
        throw error
      }
      if (!result.merged) throw new Error(`GitHub did not merge PR #${pr.number}`)
      mergeSha = result.sha
      log(`Merged PR #${pr.number}: ${mergeSha}`)
    }

    if (!autoDeploy) {
      log('Automatic deployment is disabled (GMS_AUTO_DEPLOY is not true).')
      continue
    }
    const main = await api('GET', `${root}/git/ref/heads/main`)
    if (main.object.sha !== mergeSha) {
      skip('main has a newer commit; its own deployment takes precedence')
      continue
    }
    // GITHUB_TOKEN merges do not trigger push workflows. Dispatch explicitly.
    await api('POST', `${root}/actions/workflows/deploy-gms.yml/dispatches`, {
      ref: 'main', inputs: { operation: 'deploy' },
    })
    log(`Requested main validation and deployment after PR #${pr.number}.`)
  }
}

export function githubApi({ token, url = 'https://api.github.com', fetchImpl = fetch }) {
  return async (method, path, body) => {
    const response = await fetchImpl(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = response.status === 204 ? undefined : await response.json()
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${path}: ${response.status} ${data?.message ?? ''}`)
      error.status = response.status
      throw error
    }
    return data
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const messages = []
  try {
    if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GitHub Actions context is required')
    await mergeVerifiedPullRequest({
      api: githubApi({ token: process.env.GH_TOKEN, url: process.env.GITHUB_API_URL }),
      event: JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')),
      repository: process.env.GITHUB_REPOSITORY,
      autoDeploy: process.env.GMS_AUTO_DEPLOY === 'true',
      log: message => { messages.push(message); console.log(message) },
    })
  } finally {
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Automatic PR merge\n\n${messages.join('\n\n')}\n`)
    }
  }
}
