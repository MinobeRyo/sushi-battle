import { parseRun, runForSave, type RunState } from '../../game/run'

// 端末に保存する。非公開ウィンドウなどで使えない場合は保存なしで遊べる。
const RUN_STORAGE_KEY = 'sushi-battle:run'

export function loadRun(): RunState | null {
  try {
    return parseRun(window.localStorage.getItem(RUN_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveRun(run: RunState) {
  try {
    window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(runForSave(run)))
  } catch {
    // 保存できなくても進行は続ける。
  }
}

export function clearRun() {
  try {
    window.localStorage.removeItem(RUN_STORAGE_KEY)
  } catch {
    // 消せなくても次の開始時に上書きされる。
  }
}
