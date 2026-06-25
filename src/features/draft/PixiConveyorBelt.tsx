import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import type { Card } from '../../types'

const CARD_SLOT = 90 + 32
const PADDING_LEFT = 24
const PLATE_R = 44

const PRICE_COLOR: Record<number, { bg: number; rim: number }> = {
  100: { bg: 0xf5f5f0, rim: 0x9ca3af },
  150: { bg: 0xf0fdf4, rim: 0x4ade80 },
  200: { bg: 0xfefce8, rim: 0xfacc15 },
  250: { bg: 0xfff7ed, rim: 0xfb923c },
  300: { bg: 0xfef2f2, rim: 0xf87171 },
  400: { bg: 0xfaf5ff, rim: 0xa855f7 },
  500: { bg: 0xfffbeb, rim: 0xf59e0b },
}

const BASE_EMOJI: Record<string, string> = {
  'マグロ': '🍣', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐟', 'イワシ': '🐟', 'サンマ': '🐟', 'コハダ': '🐡',
  '和牛': '🥩', 'カルビ': '🥩', '焼肉': '🥩', '牛タン': '🥩',
  'ローストビーフ': '🥩', 'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠',
  'コーン': '🌽', 'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴',
  'チーズ': '🧀', '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑',
  '太巻き': '🍱', 'かに': '🦀', 'あなご': '🐠',
}

type PlateEntry = {
  cardId: string
  setExcluded: (excluded: boolean) => void
}

type Props = {
  label: string
  cards: Card[]
  excludeIds: Set<string>
  duration: number
  onSelect: (card: Card, timeToExit: number) => void
}

export function PixiConveyorBelt({ label, cards, excludeIds, duration, onSelect }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const trackRef = useRef<PIXI.Container | null>(null)
  const platesRef = useRef<Map<number, PlateEntry>>(new Map())
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const w = Math.max(wrapper.getBoundingClientRect().width, 320)

    // v7: synchronous init — no async, no race conditions
    const app = new PIXI.Application({
      width: w,
      height: 112,
      backgroundColor: 0x1c1917,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })

    wrapper.appendChild(app.view as HTMLCanvasElement)
    appRef.current = app

    // Belt background decoration
    const bgGfx = new PIXI.Graphics()
    bgGfx.beginFill(0x292524).drawRect(0, 0, w, 18).endFill()
    bgGfx.beginFill(0x292524).drawRect(0, 94, w, 18).endFill()
    for (let x = 110; x < w; x += 110) {
      bgGfx.lineStyle(2, 0x57534e, 0.3)
      bgGfx.moveTo(x, 0).lineTo(x, 112)
    }
    app.stage.addChild(bgGfx)

    // Scrolling track
    const doubled = [...cards, ...cards]
    const track = new PIXI.Container()
    trackRef.current = track
    app.stage.addChild(track)

    const plateMap = new Map<number, PlateEntry>()

    doubled.forEach((card, i) => {
      const cx = PADDING_LEFT + i * CARD_SLOT + PLATE_R
      const cy = 56

      const plateContainer = new PIXI.Container()
      plateContainer.x = cx
      plateContainer.y = cy
      track.addChild(plateContainer)

      const gfx = new PIXI.Graphics()
      plateContainer.addChild(gfx)

      const emojiTxt = new PIXI.Text(BASE_EMOJI[card.base] ?? '🍣', new PIXI.TextStyle({
        fontSize: 22,
        fill: 0x000000,
      }))
      emojiTxt.anchor.set(0.5, 0.5)
      emojiTxt.y = -8

      const nameTxt = new PIXI.Text(
        card.name.length > 6 ? card.name.slice(0, 6) + '…' : card.name,
        new PIXI.TextStyle({ fontSize: 10, fontWeight: 'bold', fill: 0x44403c, fontFamily: 'sans-serif' })
      )
      nameTxt.anchor.set(0.5, 0.5)
      nameTxt.y = 14

      const priceTxt = new PIXI.Text(`¥${card.price}`, new PIXI.TextStyle({
        fontSize: 9, fill: 0x78716c, fontFamily: 'sans-serif',
      }))
      priceTxt.anchor.set(0.5, 0.5)
      priceTxt.y = 27

      plateContainer.addChild(emojiTxt)
      plateContainer.addChild(nameTxt)
      plateContainer.addChild(priceTxt)

      const drawPlate = (excluded: boolean) => {
        gfx.clear()
        plateContainer.removeAllListeners()
        plateContainer.interactive = false
        plateContainer.buttonMode = false

        if (excluded) {
          gfx.lineStyle(3, 0x57534e, 0.45)
          gfx.beginFill(0x000000, 0.2)
          gfx.drawCircle(0, 0, PLATE_R)
          gfx.endFill()
          emojiTxt.visible = false
          nameTxt.visible = false
          priceTxt.visible = false
        } else {
          const colors = PRICE_COLOR[card.price] ?? PRICE_COLOR[300]

          // Drop shadow
          gfx.beginFill(0x000000, 0.22)
          gfx.drawCircle(2, 4, PLATE_R)
          gfx.endFill()

          // Plate body
          gfx.lineStyle(5, colors.rim, 1)
          gfx.beginFill(colors.bg)
          gfx.drawCircle(0, 0, PLATE_R)
          gfx.endFill()

          // Gloss
          gfx.lineStyle(0)
          gfx.beginFill(0xffffff, 0.42)
          gfx.drawEllipse(-10, -PLATE_R * 0.38, PLATE_R * 0.28, PLATE_R * 0.14)
          gfx.endFill()

          emojiTxt.visible = true
          nameTxt.visible = true
          priceTxt.visible = true

          plateContainer.interactive = true
          plateContainer.buttonMode = true

          let hovering = false

          plateContainer.on('pointerover', () => {
            hovering = true
            plateContainer.scale.set(1.12)
            plateContainer.y = cy - 4
          })
          plateContainer.on('pointerout', () => {
            hovering = false
            plateContainer.scale.set(1)
            plateContainer.y = cy
          })
          plateContainer.on('pointerdown', () => {
            plateContainer.scale.set(hovering ? 0.98 : 0.88)
          })
          plateContainer.on('pointerup', () => {
            plateContainer.scale.set(hovering ? 1.12 : 1)
            const speed = (cards.length * CARD_SLOT) / duration
            const currentX = track.x
            const cardCenterX = PADDING_LEFT + i * CARD_SLOT + PLATE_R + currentX
            const timeToExit = cardCenterX > 0 ? cardCenterX / speed : 0
            onSelectRef.current(card, timeToExit)
          })
        }
      }

      drawPlate(excludeIds.has(card.id))
      plateMap.set(i, { cardId: card.id, setExcluded: drawPlate })
    })

    platesRef.current = plateMap

    const halfWidth = cards.length * CARD_SLOT
    const speed = halfWidth / duration

    app.ticker.add((delta) => {
      if (!trackRef.current) return
      // v7 ticker: delta is a time multiplier relative to 60fps
      trackRef.current.x -= speed * (delta / 60)
      if (trackRef.current.x <= -halfWidth) {
        trackRef.current.x += halfWidth
      }
    })

    return () => {
      appRef.current = null
      trackRef.current = null
      app.destroy(true, { children: true, texture: true })
    }
  }, [cards, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    platesRef.current.forEach((entry) => {
      entry.setExcluded(excludeIds.has(entry.cardId))
    })
  }, [excludeIds])

  return (
    <div className="relative select-none">
      <p className="text-amber-600/70 text-[11px] font-bold px-4 mb-1.5 tracking-widest uppercase">
        {label}
      </p>
      <div
        ref={wrapperRef}
        style={{
          height: 112,
          borderTop: '7px solid #57534e',
          borderBottom: '7px solid #57534e',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
