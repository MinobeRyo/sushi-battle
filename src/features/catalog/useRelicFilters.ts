import { useState } from 'react'
import { RELIC_CATALOG, type RelicCatalogGrade, type RelicStatus } from './relicCatalogData'

/** 図鑑「器」ページの絞り込み（格・系統・実装状況）。横向き・通常の画面で同じ状態を使う。 */
export function useRelicFilters() {
  const [grade, setGrade] = useState<RelicCatalogGrade | 'all'>('all')
  const [lineage, setLineage] = useState('all')
  const [status, setStatus] = useState<RelicStatus | 'all'>('all')
  const entries = RELIC_CATALOG.filter(entry => (grade === 'all' || entry.grade === grade)
    && (lineage === 'all' || entry.archetypes.includes(lineage))
    && (status === 'all' || entry.status === status))
  const hasFilters = grade !== 'all' || lineage !== 'all' || status !== 'all'
  const reset = () => { setGrade('all'); setLineage('all'); setStatus('all') }
  return { grade, setGrade, lineage, setLineage, status, setStatus, entries, hasFilters, reset }
}

export type RelicFilterState = ReturnType<typeof useRelicFilters>
