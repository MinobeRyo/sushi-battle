import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { SushiArt } from '../../components/SushiArt'
import { CARDS, GENERATED_CARDS } from '../../data/cards'
import { SIDE_MENU_CATALOG } from '../side-menu/sideMenuCatalog'
import type { Archetype, Card, CardType } from '../../types'
import { CardEffectText } from '../battle/CardEffectText'
import { getCardEffectDescription } from '../battle/battlePresentation'
import './CardCatalogScreen.css'

const SushiModelViewer = lazy(() => import('./SushiModelViewer'))
const SideMenuStudio = lazy(() => import('../side-menu/SideMenuStudio'))
const CATALOG_CARDS = [...CARDS, ...GENERATED_CARDS]
const GENERATED_IDS = new Set(GENERATED_CARDS.map(card => card.id))

const ARCHETYPES: Record<Archetype, string> = {
  general: '汎用',
  akami: '赤身',
  makimono: '巻物',
  gunkan: '軍艦',
  hikari: '光り物',
  kaisen: '海鮮',
  niku: '肉寿司',
}

// カタカナとひらがなのどちらでも同じネタを探せるようにします。
function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
}

function CatalogCard({ card, onView }: { card: Card; onView: () => void }) {
  const isPersist = card.type === 'persist'
  const generated = GENERATED_IDS.has(card.id)
  const bases = [card.base, ...card.subBases ?? []].join('・')

  return (
    <article className={`catalog-card${isPersist ? ' catalog-card--persist' : ''}`} aria-labelledby={`catalog-${card.id}`}>
      <div className="catalog-card-heading">
        <div className="catalog-card-art" aria-hidden="true">
          <SushiArt card={card} size="100%" />
        </div>
        <div className="catalog-card-title">
          <span className="catalog-card-type">{isPersist ? '持続型' : '即時型'}</span>
          <h2 id={`catalog-${card.id}`}>{card.name}</h2>
          <div className="catalog-card-tags">
            {generated && <span className="catalog-generated-tag">生成専用</span>}
            {card.archetype.map(archetype => <span key={archetype}>{ARCHETYPES[archetype]}</span>)}
          </div>
        </div>
      </div>

      <dl className="catalog-card-stats">
        <div><dt>価格</dt><dd>{generated ? '購入不可' : `¥${card.price}`}</dd></div>
        <div><dt>消費AP</dt><dd>{card.cost}</dd></div>
        <div><dt>攻撃力</dt><dd>{card.attack}</dd></div>
        <div><dt>滞在</dt><dd>{isPersist ? `${card.fullness}ターン` : '即時'}</dd></div>
      </dl>

      <p className="catalog-card-effect"><span className="catalog-effect-label">効果</span><CardEffectText card={card} /></p>
      <dl className="catalog-card-ingredients">
        <div><dt>ネタ</dt><dd>{bases}</dd></div>
        <div><dt>トッピング</dt><dd>{card.topping ?? 'なし'}</dd></div>
      </dl>
      <button type="button" className="catalog-view-model" onClick={onView} aria-label={`${card.name}の3Dモデルを見る`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5l8 4.5 8-4.5 M12 12v9" />
        </svg>
        3Dで見る<span aria-hidden="true">↗</span>
      </button>
    </article>
  )
}

function ModelDialog({ card, index, count, onNavigate, onClose }: {
  card: Card
  index: number
  count: number
  onNavigate: (offset: number) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [autoRotate, setAutoRotate] = useState(false)
  const [view, setView] = useState<'angle' | 'top' | 'side'>('angle')
  const [zoom, setZoom] = useState(1)
  const [resetKey, setResetKey] = useState(0)
  const generated = GENERATED_IDS.has(card.id)
  const number = String(CATALOG_CARDS.findIndex(item => item.id === card.id) + 1).padStart(3, '0')

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      trigger?.focus({ preventScroll: true })
    }
  }, [])

  const resetView = () => {
    setView('angle')
    setZoom(1)
    setAutoRotate(false)
    setResetKey(value => value + 1)
  }

  return (
    <dialog
      ref={dialogRef}
      className="catalog-model-dialog"
      aria-labelledby="catalog-model-title"
      aria-describedby="catalog-model-help"
      onCancel={event => { event.preventDefault(); onClose() }}
    >
      <header className="catalog-model-header">
        <div><span>寿司カード図鑑</span><p>{card.name}</p></div>
        <button type="button" className="catalog-model-close" onClick={onClose} autoFocus aria-label="3D表示を閉じる">閉じる <span aria-hidden="true">×</span></button>
      </header>
      <div className="catalog-model-body">
        <section className="catalog-model-exhibit" aria-label={`${card.name}の3D展示`}>
          <div className="catalog-model-stage">
            <span className="catalog-model-number" aria-hidden="true">No. {number}</span>
            <span className="catalog-model-stage-label" aria-hidden="true">3D MODEL</span>
            <Suspense fallback={<div className="catalog-model-fallback" role="status">3Dモデルを準備しています…</div>}>
              <SushiModelViewer card={card} autoRotate={autoRotate} view={view} zoom={zoom} resetKey={resetKey} onZoomChange={setZoom} onInteraction={() => setAutoRotate(false)} />
            </Suspense>
          </div>
          <p id="catalog-model-help" className="catalog-model-help">ドラッグで回転 · スクロール / ピンチで拡大</p>
          <div className="catalog-model-controls">
            <div className="catalog-model-angles" role="group" aria-label="見る角度">
              {([['angle', '斜め'], ['top', '真上'], ['side', '横']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => {
                  setView(value); setAutoRotate(false); setResetKey(current => current + 1)
                }}>{label}</button>
              ))}
            </div>
            <button type="button" className="catalog-model-spin" aria-pressed={autoRotate} onClick={() => setAutoRotate(current => !current)}>{autoRotate ? '回転を停止' : '自動回転'}</button>
            <div className="catalog-model-zoom" role="group" aria-label="モデルの大きさ">
              <button type="button" aria-label="縮小" disabled={zoom <= 0.75} onClick={() => setZoom(current => Math.max(0.75, current - 0.15))}>−</button>
              <button type="button" aria-label="拡大" disabled={zoom >= 1.6} onClick={() => setZoom(current => Math.min(1.6, current + 0.15))}>＋</button>
            </div>
            <button type="button" className="catalog-model-reset" onClick={resetView}>表示をリセット</button>
          </div>
        </section>
        <section className="catalog-model-detail" aria-labelledby="catalog-model-title">
          <p className="catalog-model-eyebrow">おしながき <span>／ {number}</span></p>
          <h2 id="catalog-model-title" aria-live="polite">{card.name}</h2>
          <div className="catalog-card-tags">
            <span>{card.type === 'persist' ? '持続型' : '即時型'}</span>
            {generated && <span className="catalog-generated-tag">生成専用</span>}
            {card.archetype.map(value => <span key={value}>{ARCHETYPES[value]}</span>)}
          </div>
          <dl className="catalog-card-stats">
            <div><dt>価格</dt><dd>{generated ? '購入不可' : `¥${card.price}`}</dd></div>
            <div><dt>消費AP</dt><dd>{card.cost}</dd></div>
            <div><dt>攻撃力</dt><dd>{card.attack}</dd></div>
            <div><dt>滞在</dt><dd>{card.type === 'persist' ? `${card.fullness}ターン` : '即時'}</dd></div>
          </dl>
          <p className="catalog-card-effect"><span className="catalog-effect-label">この寿司の効果</span><CardEffectText card={card} /></p>
          <dl className="catalog-model-ingredients">
            <div><dt>ネタ</dt><dd>{[card.base, ...card.subBases ?? []].join('・')}</dd></div>
            <div><dt>トッピング</dt><dd>{card.topping ?? 'なし'}</dd></div>
          </dl>
          <p className="catalog-model-note">{generated ? '生ハムはカードの効果で生成される専用の寿司です。' : 'レーンを流れる寿司と同じ3Dモデルです。'}<br />数値は強化前の基本値です。</p>
        </section>
      </div>
      <footer className="catalog-model-footer">
        <button type="button" disabled={index === 0} onClick={() => onNavigate(-1)}>← 前の寿司</button>
        <p><strong>{index + 1}</strong> / {count}<span>表示中の寿司</span></p>
        <button type="button" disabled={index === count - 1} onClick={() => onNavigate(1)}>次の寿司 →</button>
      </footer>
    </dialog>
  )
}

export function CardCatalogScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [cardType, setCardType] = useState<CardType | 'all'>('all')
  const [archetype, setArchetype] = useState<Archetype | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSideMenus, setShowSideMenus] = useState(false)
  const sideMenuButton = useRef<HTMLButtonElement>(null)
  const returningFromSideMenu = useRef(false)
  useEffect(() => {
    if (!showSideMenus && returningFromSideMenu.current) {
      sideMenuButton.current?.focus({ preventScroll: true })
      returningFromSideMenu.current = false
    }
  }, [showSideMenus])
  const searchTerms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean)
  const filteredCards = CATALOG_CARDS.filter(card => {
    if (cardType !== 'all' && card.type !== cardType) return false
    if (archetype !== 'all' && !card.archetype.includes(archetype)) return false
    const searchText = normalizeSearch([
      card.name, card.base, ...card.subBases ?? [], card.topping,
      ...card.archetype.map(value => ARCHETYPES[value]), getCardEffectDescription(card),
    ].join(' '))
    return searchTerms.every(term => searchText.includes(term))
  })
  const hasFilters = query !== '' || cardType !== 'all' || archetype !== 'all'
  const selectedIndex = filteredCards.findIndex(card => card.id === selectedId)
  const selectedCard = filteredCards[selectedIndex]
  const resetFilters = () => {
    setQuery('')
    setCardType('all')
    setArchetype('all')
  }

  if (showSideMenus) {
    return (
      <Suspense fallback={<div className="card-catalog catalog-loading" role="status">サイドメニュー図鑑を準備しています…</div>}>
        <SideMenuStudio onTitle={onBack} onBack={() => {
          returningFromSideMenu.current = true
          setShowSideMenus(false)
        }} />
      </Suspense>
    )
  }

  return (
    <main className="card-catalog" aria-labelledby="catalog-title">
      <header className="catalog-header">
        <div className="catalog-header-inner">
          <button type="button" className="catalog-back" onClick={onBack}>← タイトルへ</button>
          <h1 id="catalog-title">寿司カード図鑑</h1>
          <span className="catalog-total">全{CATALOG_CARDS.length}種</span>
        </div>
      </header>

      <div className="catalog-content">
        <nav className="catalog-sections" aria-label="図鑑の種類">
          <span aria-current="page">寿司カード <small>{CATALOG_CARDS.length}種</small></span>
          <button ref={sideMenuButton} type="button" onClick={() => setShowSideMenus(true)}>サイドメニュー <small>{SIDE_MENU_CATALOG.length}種</small><span aria-hidden="true">↗</span></button>
        </nav>
        <p className="catalog-intro">お気に入りの一皿を、立体でじっくり。<br />「3Dで見る」から寿司を回して眺めながら、デッキづくりの参考に。生成専用の寿司は、カードの効果でのみ登場します。</p>
        <section className="catalog-filters" aria-label="カードを探す">
          <label className="catalog-search">
            <span>カードを検索</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="カード名・ネタ・効果で検索"
            />
          </label>
          <label>
            <span>タイプ</span>
            <select value={cardType} onChange={event => setCardType(event.target.value as CardType | 'all')}>
              <option value="all">すべてのタイプ</option>
              <option value="instant">即時型</option>
              <option value="persist">持続型</option>
            </select>
          </label>
          <label>
            <span>系統</span>
            <select value={archetype} onChange={event => setArchetype(event.target.value as Archetype | 'all')}>
              <option value="all">すべての系統</option>
              {(Object.entries(ARCHETYPES) as [Archetype, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </section>

        <div className="catalog-results-bar">
          <p role="status">{filteredCards.length} / {CATALOG_CARDS.length}種を表示</p>
          {hasFilters && <button type="button" onClick={resetFilters}>条件をリセット</button>}
        </div>
        <p className="catalog-guide">APは召喚に必要な食欲ポイントです。生成専用の生ハムは購入できません。効果で机・山札へ加わります。山札から引いた生ハムは手札から0APで召喚できます。数値は強化前の基本値です。</p>

        {filteredCards.length > 0 ? (
          <div className="catalog-grid">
            {filteredCards.map(card => <CatalogCard key={card.id} card={card} onView={() => setSelectedId(card.id)} />)}
          </div>
        ) : (
          <div className="catalog-empty">
            <h2>該当するカードがありません</h2>
            <p>検索する言葉や、タイプ・系統の条件を変えてみてください。</p>
            <button type="button" onClick={resetFilters}>すべてのカードを見る</button>
          </div>
        )}
      </div>
      {selectedCard && (
        <ModelDialog
          card={selectedCard}
          index={selectedIndex}
          count={filteredCards.length}
          onNavigate={offset => {
            const nextCard = filteredCards[selectedIndex + offset]
            if (nextCard) setSelectedId(nextCard.id)
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  )
}
