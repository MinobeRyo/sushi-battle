import { useEffect, useId, useRef, useState } from 'react'
import { SushiArt } from '../../components/SushiArt'
import { ONLINE_LANES, onlinePlatePosition, sideMenuForBeltSlot } from '../../game/draftOffers'
import type { DraftLane, DraftOffer } from '../../game/draftOffers'
import type { Card } from '../../types'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import type { OnlineBeltSupply } from './scene/BeltLane3D'

type Props = {
  lane: DraftLane
  cards: Card[]
  supply?: OnlineBeltSupply
  paused: boolean
  disabled: boolean
  budget: number
  sideMenusEnabled: boolean
  sideMenuPurchased: boolean
  onSideMenuSelect: (id: SideMenuId, markSold: () => boolean, offerId: string) => void
  onSelect: (card: Card, markSold: () => boolean, offerId: string) => void
}

function shuffle(cards: Card[]) {
  const bag = [...cards]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

/** 表示だけをカードに置き換え、通信対戦の出品ID・周回時刻は3D版と共用する。 */
export function CompactDraftLane({ lane, cards, supply, paused, disabled, budget, onSelect, sideMenusEnabled, sideMenuPurchased, onSideMenuSelect }: Props) {
  const laneId = useId()
  const bag = useRef<Card[]>([])
  const draw = () => {
    if (!bag.current.length) bag.current = shuffle(cards)
    return bag.current.pop()!
  }
  const [sideMenuStartGeneration] = useState(() => !supply && lane === 'general' && sideMenusEnabled ? Math.floor(Math.random() * 3) : 0)
  const drawOffer = (slot: number, generation: number): DraftOffer => {
    const sideMenuId = sideMenuForBeltSlot(lane, slot, generation + sideMenuStartGeneration, sideMenusEnabled)
    return { id: `${laneId}:${slot}:${generation}`, lane, slot, generation, sold: false,
      ...(sideMenuId ? { sideMenuId } : { card: draw() }) }
  }
  const [localOffers, setLocalOffers] = useState<DraftOffer[]>(() =>
    Array.from({ length: ONLINE_LANES[lane].slots }, (_, slot) => drawOffer(slot, 0)))
  const elapsed = useRef(0)
  const active = useRef(false)
  const elements = useRef(new Map<number, HTMLButtonElement>())
  const current = useRef({ localOffers, supply, paused, cards })
  current.current = { localOffers, supply, paused, cards }

  useEffect(() => {
    active.current = true
    let frame = 0
    let previous = performance.now()
    const animate = (now: number) => {
      const state = current.current
      if (!state.paused && !state.supply) elapsed.current += Math.min(now - previous, 100)
      previous = now
      const clock = state.supply ? state.supply.elapsed(lane) : elapsed.current
      const offers = state.supply ? state.supply.offers.filter(offer => offer.lane === lane) : state.localOffers
      let changed = false
      const next = offers.map(offer => {
        const position = onlinePlatePosition(lane, offer.slot, clock)
        if (state.supply || position.generation === offer.generation) return offer
        if (!bag.current.length) bag.current = shuffle(state.cards)
        changed = true
        const sideMenuId = sideMenuForBeltSlot(lane, offer.slot, position.generation + sideMenuStartGeneration, sideMenusEnabled)
        return { id: `${laneId}:${offer.slot}:${position.generation}`, lane, slot: offer.slot, generation: position.generation, sold: false,
          ...(sideMenuId ? { sideMenuId } : { card: bag.current.pop()! }) }
      })
      if (changed) {
        current.current.localOffers = next
        setLocalOffers(next)
      }
      for (const offer of next) {
        const button = elements.current.get(offer.slot)
        if (!button) continue
        const position = onlinePlatePosition(lane, offer.slot, clock)
        // 中央の約5皿を表示。座標変換は購入可能な世代や寿命に影響させない。
        const x = (position.x + 5.75) / 11.5 * 100
        button.style.left = `${x}%`
        const visible = position.generation === offer.generation && x > -4 && x < 104
        button.style.visibility = visible ? 'visible' : 'hidden'
        button.inert = !visible
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => { active.current = false; cancelAnimationFrame(frame) }
  }, [lane, laneId, sideMenuStartGeneration, sideMenusEnabled])

  const offers = supply ? supply.offers.filter(offer => offer.lane === lane) : localOffers
  const select = (offer: DraftOffer) => {
    const state = current.current
    const live = (state.supply ? state.supply.offers : state.localOffers).find(item => item.id === offer.id)
    const clock = state.supply ? state.supply.elapsed(lane) : elapsed.current
    if (!active.current || !live || live.sold || onlinePlatePosition(lane, live.slot, clock).generation !== live.generation) return
    const markSold = () => {
      if (state.supply) return true // 購入の成否はサーバーが検証する。
      const latest = current.current.localOffers.find(item => item.id === live.id)
      if (!active.current || !latest || latest.sold || onlinePlatePosition(lane, latest.slot, elapsed.current).generation !== latest.generation) return false
      const next = current.current.localOffers.map(item => item.id === live.id ? { ...item, sold: true } : item)
      current.current.localOffers = next
      setLocalOffers(next)
      return true
    }
    if (live.sideMenuId) onSideMenuSelect(live.sideMenuId, markSold, live.id)
    else onSelect(live.card, markSold, live.id)
  }

  return <section className="cd-lane" aria-label={lane === 'general' ? '汎用レーン' : 'ビルド系レーン'}>
    <header><h2>{lane === 'general' ? '汎用レーン' : 'ビルド系レーン'}</h2><span>左へ流れる</span></header>
    <div className="cd-lane-track">
      {offers.map(offer => {
        const item = offer.sideMenuId ? SIDE_MENU_BY_ID[offer.sideMenuId] : offer.card
        const card = offer.card
        const kind = card ? card.type === 'persist' ? '持続' : '即時' : 'サイド'
        const stats = card ? `AP${card.cost} 攻${card.attack}${card.type === 'persist' ? ` ${card.fullness}T` : ''}` : sideMenuPurchased ? '購入済み・詳細' : '専用1枠'
        return <button key={offer.slot} type="button" ref={element => { if (element) elements.current.set(offer.slot, element); else elements.current.delete(offer.slot) }}
          className={`cd-offer cd-offer-${card?.type ?? 'side'}${offer.sold ? ' is-sold' : ''}${budget < item.price ? ' is-unaffordable' : ''}`}
          style={{ left: `${(onlinePlatePosition(lane, offer.slot, supply ? supply.elapsed(lane) : elapsed.current).x + 5.75) / 11.5 * 100}%` }}
          disabled={disabled || offer.sold} onClick={() => select(offer)}
          aria-label={offer.sold ? '購入済みのお皿' : `${item.name}、${kind}、${stats}、${item.price}円。詳細を確認`}>
          {offer.sold ? <span className="cd-sold-label">購入済み</span> : <>
            <span className="cd-offer-type">{kind}</span>
            <span className="cd-offer-art" aria-hidden="true">{card ? <SushiArt card={card} size="100%" fit /> : <SideMenuArt id={offer.sideMenuId!} />}</span>
            <strong className="cd-offer-name">{item.name}</strong>
            <span className="cd-offer-stats">{stats}</span>
            <b className="cd-offer-price">¥{item.price}</b>
          </>}
        </button>
      })}
    </div>
  </section>
}
