import { useEffect, useRef } from 'react'
import './BattleOrientationNotice.css'

export function BattleOrientationNotice({ onBack }: { onBack?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  return <section className="battle-orientation" aria-label="横向きでバトル">
    <svg className="battle-orientation__icon" viewBox="0 0 120 96" fill="none" aria-hidden="true">
      <rect x="23" y="28" width="74" height="44" rx="8" stroke="currentColor" strokeWidth="4" />
      <path d="M85 45v10M38 17a37 37 0 0 1 55 0m0-12v12H81" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <h1 ref={heading} tabIndex={-1}>端末を横向きにしてください</h1>
    <p>バトルは横向きで遊べます。</p>
    {onBack && <button type="button" onClick={onBack}>タイトルに戻る</button>}
  </section>
}
