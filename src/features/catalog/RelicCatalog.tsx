import {
  RELIC_CATALOG, RELIC_CATALOG_GRADE_LABEL, RELIC_KIND_LABEL, RELIC_LINEAGE_LABEL, RELIC_STATUS_LABEL, relicStatusCounts,
  type RelicCatalogEntry, type RelicCatalogGrade, type RelicStatus,
} from './relicCatalogData'
import type { RelicFilterState } from './useRelicFilters'

// 寿司はしご専用の「器」の図鑑。実装状況（実装済み・一部だけ・未実装）も並べて確認できるようにする。

const LINEAGES: ReadonlyArray<readonly [string, string]> = [...Object.entries(RELIC_LINEAGE_LABEL), ['taisho', '大将']]


export function RelicFilterSelects({ filters, compact = false, onChange }: { filters: RelicFilterState; compact?: boolean; onChange?: () => void }) {
  const changed = <T,>(set: (value: T) => void) => (value: T) => { set(value); onChange?.() }
  const selects = [
    <select key="grade" aria-label="格" value={filters.grade} onChange={event => changed(filters.setGrade)(event.target.value as RelicCatalogGrade | 'all')}>
      <option value="all">{compact ? '全格' : 'すべての格'}</option>
      {(Object.entries(RELIC_CATALOG_GRADE_LABEL) as [RelicCatalogGrade, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>,
    <select key="lineage" aria-label="系統" value={filters.lineage} onChange={event => changed(filters.setLineage)(event.target.value)}>
      <option value="all">{compact ? '全系統' : 'すべての系統'}</option>
      {LINEAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>,
    <select key="status" aria-label="実装状況" value={filters.status} onChange={event => changed(filters.setStatus)(event.target.value as RelicStatus | 'all')}>
      <option value="all">{compact ? '全状況' : 'すべての状況'}</option>
      {(Object.entries(RELIC_STATUS_LABEL) as [RelicStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>,
  ]
  if (compact) return <>{selects}</>
  const labels = ['格', '系統', '実装状況']
  return <>{selects.map((select, index) => <label key={labels[index]}><span>{labels[index]}</span>{select}</label>)}</>
}

export function RelicStatusSummary() {
  const counts = relicStatusCounts()
  return (
    <p className="relic-summary">
      企画書の器 {RELIC_CATALOG.length}種のうち
      {(Object.keys(RELIC_STATUS_LABEL) as RelicStatus[]).map(status => (
        <span key={status} className="relic-status" data-status={status}>{RELIC_STATUS_LABEL[status]} {counts[status]}</span>
      ))}
    </p>
  )
}

export function RelicCard({ entry, compact = false }: { entry: RelicCatalogEntry; compact?: boolean }) {
  return (
    <article className={`relic-card${compact ? ' relic-card--compact' : ''}`} data-status={entry.status} data-grade={entry.grade} aria-labelledby={`relic-${entry.id}`}>
      <div className="relic-card-heading">
        <span className="relic-grade" data-grade={entry.grade}>{RELIC_CATALOG_GRADE_LABEL[entry.grade]}</span>
        <h2 id={`relic-${entry.id}`}>{entry.name}</h2>
        <span className="relic-status" data-status={entry.status}>{RELIC_STATUS_LABEL[entry.status]}</span>
      </div>
      <div className="catalog-card-tags">
        <span>{RELIC_KIND_LABEL[entry.kind]}</span>
        <span>{entry.lineage}</span>
      </div>
      <p className="relic-text"><span className="catalog-effect-label">効果</span>{entry.text}</p>
      {entry.cost && <p className="relic-cost"><span className="catalog-effect-label">代償</span>{entry.cost}</p>}
      {entry.note && <p className="relic-note"><span className="catalog-effect-label">{entry.status === 'todo' ? '未実装の理由' : '足りないところ'}</span>{entry.note}</p>}
    </article>
  )
}

/** 横向きでない画面の「器」ページ本体（見出しと切り替えは CardCatalogScreen 側）。 */
export function RelicCatalogSection({ filters }: { filters: RelicFilterState }) {
  return <>
    <p className="catalog-intro">寿司はしご（ローグライク）で集める、ずっと効く道具です。常連さんに勝つと3つから1つもらえます。<br />各器の「実装状況」は、いまのゲームでその効果がどこまで動くかを示します。</p>
    <RelicStatusSummary />
    <section className="catalog-filters" aria-label="器を探す">
      <RelicFilterSelects filters={filters} />
    </section>
    <div className="catalog-results-bar">
      <p role="status">{filters.entries.length} / {RELIC_CATALOG.length}種を表示</p>
      {filters.hasFilters && <button type="button" onClick={filters.reset}>条件をリセット</button>}
    </div>
    {filters.entries.length > 0 ? (
      <div className="catalog-grid">
        {filters.entries.map(entry => <RelicCard key={entry.id} entry={entry} />)}
      </div>
    ) : (
      <div className="catalog-empty">
        <h2>該当する器がありません</h2>
        <p>格・系統・実装状況の条件を変えてみてください。</p>
        <button type="button" onClick={filters.reset}>すべての器を見る</button>
      </div>
    )}
  </>
}
