import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import './LandscapeViewport.css'

const portraitQuery = '(max-width: 700px) and (orientation: portrait)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(portraitQuery)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

// 向きが変わっても子画面を保持し、購入内容・対戦状態・オンライン接続を維持する。
export function LandscapeViewport({ children }: { children: ReactNode }) {
  const portrait = useSyncExternalStore(subscribe, () => window.matchMedia(portraitQuery).matches, () => false)
  const notice = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    if (!portrait || !notice.current) return
    const dialog = notice.current
    const showNotice = () => {
      if (dialog.open) dialog.close()
      dialog.showModal()
      heading.current?.focus({ preventScroll: true })
    }
    showNotice()
    // 縦持ち中にCPUの防御選択などが開いても、回転案内を最前面に保つ。
    const observer = new MutationObserver(records => {
      const anotherDialogOpened = records.some(record =>
        record.type === 'attributes' && record.target !== dialog
        && record.target instanceof HTMLDialogElement && record.target.open)
      if (anotherDialogOpened) showNotice()
    })
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] })
    return () => { observer.disconnect(); dialog.close() }
  }, [portrait])

  return <>
    <div className="landscape-content" data-portrait={portrait} inert={portrait} aria-hidden={portrait || undefined}>
      {children}
    </div>
    {portrait && <dialog ref={notice} className="landscape-notice" aria-labelledby="landscape-notice-title"
      onCancel={event => event.preventDefault()}>
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <rect x="23" y="28" width="74" height="44" rx="8" stroke="currentColor" strokeWidth="4" />
        <path d="M85 45v10M38 17a37 37 0 0 1 55 0m0-12v12H81" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h1 id="landscape-notice-title" ref={heading} tabIndex={-1}>端末を横向きにしてください</h1>
      <p>横向きで、一画面に表示します。</p>
    </dialog>}
  </>
}
