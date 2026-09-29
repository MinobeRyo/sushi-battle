import { useState } from 'react'
import { SushiArt } from '../../components/SushiArt'
import { CARDS } from '../../data/cards'
import type { Archetype, Card, CardType } from '../../types'
import { EFFECT_FULL } from '../battle/battlePresentation'
import './CardCatalogScreen.css'

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

function cardEffect(card: Card) {
  return card.effect ? EFFECT_FULL[card.effect] ?? '効果の説明は準備中です' : '特殊効果なし'
}

function CatalogCard({ card }: { card: Card }) {
  const isPersist = card.type === 'persist'
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
            {card.archetype.map(archetype => <span key={archetype}>{ARCHETYPES[archetype]}</span>)}
          </div>
        </div>
      </div>

      <dl className="catalog-card-stats">
        <div><dt>価格</dt><dd>¥{card.price}</dd></div>
        <div><dt>消費AP</dt><dd>{card.cost}</dd></div>
        <div><dt>攻撃力</dt><dd>{card.attack}</dd></div>
        <div><dt>滞在</dt><dd>{isPersist ? `${card.fullness}ターン` : '即時'}</dd></div>
      </dl>

      <p className="catalog-card-effect"><span>効果</span>{cardEffect(card)}</p>
      <dl className="catalog-card-ingredients">
        <div><dt>ネタ</dt><dd>{bases}</dd></div>
        <div><dt>トッピング</dt><dd>{card.topping ?? 'なし'}</dd></div>
      </dl>
    </article>
  )
}

export function CardCatalogScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [cardType, setCardType] = useState<CardType | 'all'>('all')
  const [archetype, setArchetype] = useState<Archetype | 'all'>('all')
  const searchTerms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean)
  const filteredCards = CARDS.filter(card => {
    if (cardType !== 'all' && card.type !== cardType) return false
    if (archetype !== 'all' && !card.archetype.includes(archetype)) return false
    const searchText = normalizeSearch([
      card.name, card.base, ...card.subBases ?? [], card.topping,
      ...card.archetype.map(value => ARCHETYPES[value]), cardEffect(card),
    ].join(' '))
    return searchTerms.every(term => searchText.includes(term))
  })
  const hasFilters = query !== '' || cardType !== 'all' || archetype !== 'all'
  const resetFilters = () => {
    setQuery('')
    setCardType('all')
    setArchetype('all')
  }

  return (
    <main className="card-catalog" aria-labelledby="catalog-title">
      <header className="catalog-header">
        <div className="catalog-header-inner">
          <button type="button" className="catalog-back" onClick={onBack}>← タイトルへ</button>
          <h1 id="catalog-title">寿司カード図鑑</h1>
          <span className="catalog-total">全{CARDS.length}種</span>
        </div>
      </header>

      <div className="catalog-content">
        <p className="catalog-intro">お気に入りの一皿を見つけて、デッキづくりの参考に。</p>
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
          <p role="status">{filteredCards.length} / {CARDS.length}種を表示</p>
          {hasFilters && <button type="button" onClick={resetFilters}>条件をリセット</button>}
        </div>
        <p className="catalog-guide">APは召喚に必要な食欲ポイントです。数値は強化前の基本値です。</p>

        {filteredCards.length > 0 ? (
          <div className="catalog-grid">
            {filteredCards.map(card => <CatalogCard key={card.id} card={card} />)}
          </div>
        ) : (
          <div className="catalog-empty">
            <h2>該当するカードがありません</h2>
            <p>検索する言葉や、タイプ・系統の条件を変えてみてください。</p>
            <button type="button" onClick={resetFilters}>すべてのカードを見る</button>
          </div>
        )}
      </div>
    </main>
  )
}
