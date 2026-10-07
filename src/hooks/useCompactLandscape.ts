import { useSyncExternalStore } from 'react'

// CSSの横向きレイアウトと同じ条件で、カード選択時の操作も切り替える。
const query = '(min-width: 600px) and (max-width: 1100px) and (max-height: 600px) and (orientation: landscape)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export function useCompactLandscape() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
