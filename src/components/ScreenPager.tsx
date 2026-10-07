import './ScreenPager.css'

type Props = { page: number; pages: number; onPageChange: (page: number) => void; label?: string; counterLabel?: string }

/** 一覧を画面内に保ったまま切り替える共通のページ送り。 */
export function ScreenPager({ page, pages, onPageChange, label = 'ページ切替', counterLabel }: Props) {
  if (pages <= 1) return null
  return <nav className="screen-pager" aria-label={label}>
    <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)} aria-label="前のページ">‹ 前へ</button>
    <span aria-live="polite">{counterLabel && `${counterLabel} `}{page + 1} / {Math.max(1, pages)}</span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)} aria-label="次のページ">次へ ›</button>
  </nav>
}
