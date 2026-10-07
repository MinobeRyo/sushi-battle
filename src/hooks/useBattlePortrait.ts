import { useSyncExternalStore } from 'react'

const query = '(max-width: 700px) and (orientation: portrait)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export function useBattlePortrait() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
