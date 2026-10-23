import type { RandomSource } from './types'
import { CARDS } from '../data/cards'
import { RELICS, RELIC_BY_ID } from '../data/runRelics'
import { RUN_EVENT_BY_ID } from '../data/runEvents'
import {
  MAX_RUN_BELLY, MIN_DECK_SIZE, aburiDeckId, canAburiDeckId, runCard,
  type RunState,
} from './run'

// ハプニング（？マス）の効果。文言は src/data/runEvents.ts。選ぶと結果の文を残し、「次へ」で地図に戻る。

const pick = <T,>(items: readonly T[], random: RandomSource): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]
const cardName = (deckId: string) => runCard(deckId)?.name ?? deckId

/** 選べない選択肢には理由を返す。 */
export function eventChoiceBlocked(run: RunState, choiceId: string): string | undefined {
  const eventId = run.event?.id
  if (eventId === 'shoyu' && choiceId === 'pay' && run.gold < 50) return '持ち金が足りません'
  if (eventId === 'gacha' && choiceId === 'spin' && run.gold < 100) return '持ち金が足りません'
  if (eventId === 'kimagure' && choiceId === 'order' && run.gold < 200) return '持ち金が足りません'
  if (eventId === 'kodomo' && choiceId === 'give' && run.deck.length <= MIN_DECK_SIZE) return `デッキが${MIN_DECK_SIZE}枚以下です`
  if (eventId === 'wasuremono' && choiceId === 'keep' && openNamiRelics(run).length === 0) return '拾える器がありません'
  return undefined
}

const openNamiRelics = (run: RunState) => RELICS.filter(relic => relic.grade === 'nami' && !run.relics.includes(relic.id))

function addRandomCard(run: RunState, random: RandomSource, pool = CARDS): { run: RunState; name: string } {
  const card = pick(pool, random)
  return { run: { ...run, deck: [...run.deck, card.id] }, name: card.name }
}

function aburiRandom(run: RunState, random: RandomSource): { run: RunState; name: string | null } {
  const slots = run.deck.flatMap((id, index) => canAburiDeckId(id) ? [index] : [])
  if (slots.length === 0) return { run, name: null }
  const index = pick(slots, random)
  const deck = [...run.deck]
  deck[index] = aburiDeckId(deck[index])
  return { run: { ...run, deck }, name: cardName(run.deck[index]) }
}

const belly = (run: RunState, delta: number) => ({ ...run, belly: Math.max(0, Math.min(MAX_RUN_BELLY - 1, run.belly + delta)) })
const gold = (run: RunState, delta: number) => ({ ...run, gold: Math.max(0, run.gold + delta) })

/** 選択肢を確定する。結果の文は run.event.result に入る。 */
export function resolveEvent(run: RunState, choiceId: string, random: RandomSource = Math.random): RunState {
  const event = run.event
  if (run.status !== 'event' || !event || event.result !== undefined) throw new Error('ハプニングを選べる状態ではありません')
  const definition = RUN_EVENT_BY_ID[event.id]
  if (!definition?.choices.some(choice => choice.id === choiceId)) throw new Error(`選べない選択肢です: ${choiceId}`)
  const blocked = eventChoiceBlocked(run, choiceId)
  if (blocked) throw new Error(blocked)
  const done = (next: RunState, result: string): RunState => ({ ...next, event: { id: event.id, result } })
  const key = `${event.id}:${choiceId}`
  switch (key) {
    case 'osusowake:take': {
      const got = addRandomCard(run, random)
      return done(got.run, `「${got.name}」をもらった。デッキに加わった。`)
    }
    case 'shoyu:pay': return done(gold(run, -50), 'おしぼり代を払った。持ち金 −50。')
    case 'shoyu:eat': return done(belly(run, 10), 'しょっぱい…。お腹 +10。')
    case 'okaikei:honest': {
      const got = aburiRandom(run, random)
      return done(got.run, got.name ? `「正直だねぇ」大将が「${got.name}」を炙ってくれた。` : '大将は感心したが、炙れる寿司がなかった。')
    }
    case 'okaikei:quiet': return done(gold(run, 100), 'そっと店を出た。持ち金 +100。')
    case 'wasabi:endure': {
      const got = aburiRandom(run, random)
      return done(belly(got.run, 5), got.name ? `涙をこらえて食べきった。なぜか「${got.name}」が炙りになった。お腹 +5。` : '食べきった。お腹 +5。')
    }
    case 'nurui_ocha:tell': {
      const got = aburiRandom(run, random)
      return done(got.run, got.name ? `「失礼しました！」おわびに「${got.name}」を炙ってもらった。` : '熱いお茶に替えてもらった。')
    }
    case 'nurui_ocha:gulp': return done(belly(run, -10), '一気に飲み干した。お腹 −10。')
    case 'kodomo:give': {
      const index = Math.floor(random() * run.deck.length)
      const name = cardName(run.deck[index])
      return done(gold({ ...run, deck: run.deck.filter((_, i) => i !== index) }, 150), `「${name}」をあげた。親が謝って持ち金 +150。`)
    }
    case 'birthday:sing': return done(belly(run, -15), '店じゅうで大合唱。笑ってお腹 −15。')
    case 'birthday:clap': return done(gold(run, 30), 'お祝いのおすそわけで持ち金 +30。')
    case 'touch_panel:eat': {
      const first = addRandomCard(run, random)
      const second = addRandomCard(first.run, random)
      return done(second.run, `「${first.name}」と「${second.name}」が届いた。デッキに加わった。`)
    }
    case 'gari_tabehoudai:take': return done({ ...run, nextBattleGari: (run.nextBattleGari ?? 0) + 2 }, '小皿に山盛り。次の試合だけガリ +2。')
    case 'gari_tabehoudai:little': return done(belly(run, -5), 'ほどほどにつまんだ。お腹 −5。')
    case 'wasuremono:keep': {
      const relic = pick(openNamiRelics(run), random)
      return done({ ...run, relics: [...run.relics, relic.id] }, `器「${relic.name}」を手に入れた：${relic.text}`)
    }
    case 'wasuremono:return': return done(gold(run, 100), '持ち主がお礼をくれた。持ち金 +100。')
    case 'gacha:spin': {
      const paid = gold(run, -100)
      const relics = RELICS.filter(relic => relic.grade !== 'tokujo' && !run.relics.includes(relic.id))
      if (random() < 0.5 && relics.length > 0) {
        const relic = pick(relics, random)
        return done({ ...paid, relics: [...paid.relics, relic.id] }, `当たり！ 器「${RELIC_BY_ID[relic.id].name}」：${relic.text}`)
      }
      const got = addRandomCard(paid, random)
      return done(got.run, `はずれ…でも「${got.name}」がもらえた。`)
    }
    case 'kimagure:order': {
      const pool = CARDS.filter(card => card.archetype.includes(run.archetype) && canAburiDeckId(card.id))
      const card = pick(pool.length > 0 ? pool : CARDS, random)
      const id = canAburiDeckId(card.id) ? aburiDeckId(card.id) : card.id
      return done({ ...gold(run, -200), deck: [...run.deck, id] }, `大将が「${cardName(id)}」を握ってくれた。`)
    }
    default: return done(run, '何も起きなかった。')
  }
}

export function leaveEvent(run: RunState): RunState {
  if (run.status !== 'event' || run.event?.result === undefined) throw new Error('ハプニングが終わっていません')
  const { event: _, ...rest } = run
  return { ...rest, status: 'map' }
}
