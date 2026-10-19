import { useCallback, useEffect, useRef, useState } from 'react'
import { playGameSound } from '../../audio/gameSounds'
import type { ComboAnim } from './types'

export const COMBO_DISPLAY_MS = 2300

export function useComboAnnouncements() {
  const [queue, setQueue] = useState<ComboAnim[]>([])
  const sequence = useRef(0)
  const soundedKey = useRef(0)
  const comboAnim = queue.length > 0 ? queue[0] : null

  const announceCombo = useCallback((combo: Omit<ComboAnim, 'key'>) => {
    const next = { ...combo, key: ++sequence.current }
    setQueue(current => [...current, next])
  }, [])

  const clearCombos = useCallback(() => setQueue([]), [])

  useEffect(() => {
    if (!comboAnim) return
    // StrictMode の再実行でも、1つのカットインにつき1回だけ鳴らす。
    if (soundedKey.current !== comboAnim.key) {
      soundedKey.current = comboAnim.key
      playGameSound('combo')
    }
    const timer = setTimeout(() => {
      setQueue(current => current.filter(combo => combo.key !== comboAnim.key))
    }, COMBO_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [comboAnim])

  return { comboAnim, announceCombo, clearCombos }
}
