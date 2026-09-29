import { useEffect, useRef, useState } from 'react'

export function useBattleHandNavigation() {
  const layoutRef = useRef<HTMLDivElement>(null)
  const arenaRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLElement>(null)
  const [handInView, setHandInView] = useState(false)

  // 高さの少ない画面では、机だけでなくレイアウト全体がスクロールする。
  const getScroller = () => {
    const arena = arenaRef.current
    return arena && getComputedStyle(arena).overflowY === 'auto' ? arena : layoutRef.current
  }

  useEffect(() => {
    const layout = layoutRef.current
    const arena = arenaRef.current
    const hand = handRef.current
    const actions = actionsRef.current
    if (!layout || !arena || !hand || !actions) return

    const update = () => {
      const scroller = getScroller()
      if (!scroller) return
      const viewport = scroller.getBoundingClientRect()
      const handBounds = hand.getBoundingClientRect()
      const visibleBottom = Math.min(viewport.bottom, actions.getBoundingClientRect().top)
      const availableHeight = Math.max(0, visibleBottom - viewport.top)
      const visibleHandHeight = Math.max(0, Math.min(handBounds.bottom, visibleBottom) - Math.max(handBounds.top, viewport.top))
      // 手動で手札まで送った場合も、フッターから盤面に戻れるようにする。
      setHandInView(scroller.scrollTop > 1 && availableHeight > 0
        && visibleHandHeight >= Math.min(handBounds.height, availableHeight) * 0.6)
    }
    layout.addEventListener('scroll', update, { passive: true })
    arena.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    for (const element of [layout, arena, actions, ...arena.children]) observer.observe(element)
    update()
    return () => {
      layout.removeEventListener('scroll', update)
      arena.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const toggleHand = () => {
    const scroller = getScroller()
    const hand = handRef.current
    if (!scroller || !hand) return
    if (handInView) {
      scroller.scrollTo({ top: 0, behavior: 'instant' })
      arenaRef.current?.focus({ preventScroll: true })
      setHandInView(false)
      return
    }
    // scrollIntoView は外側の画面まで動かすため、操作対象をこの領域に限定する。
    const top = scroller.scrollTop + hand.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12
    scroller.scrollTo({ top, behavior: 'instant' })
    hand.focus({ preventScroll: true })
    setHandInView(true)
  }

  return { layoutRef, arenaRef, handRef, actionsRef, handInView, toggleHand }
}
