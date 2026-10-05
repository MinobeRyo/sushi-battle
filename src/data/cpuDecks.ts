import type { Archetype, Card } from '../types'
import type { RandomSource } from '../game/types'
import { getCpuDeck as getWeakCpuDeck, getCpuReorderDeck as getWeakCpuReorderDeck } from '../game/battleRules'
import { CARDS } from './cards'

export type CpuBattleMode = 'weak' | 'random' | 'challenge'
export type CpuDeckId = Exclude<Archetype, 'general' | 'gunkan'> | 'weak' | 'challenge'
type DeckEntry = readonly [cardId: string, count: number]
type CpuDeckDefinition = {
  id: Exclude<CpuDeckId, 'weak'>
  name: string
  entries: readonly DeckEntry[]
  reorderEntries: readonly DeckEntry[]
}

const WEAK_CPU = { id: 'weak', name: '最弱' } as const
type CpuOpponentDefinition = CpuDeckDefinition | typeof WEAK_CPU

// 通常戦は各3000円。カードの種類・枚数を固定し、配る順番だけ試合ごとに変える。
// 初期構成はガリ調整で使用した5軸のデッキを採用。追加注文は各1500円。
export const CPU_DECKS: readonly CpuDeckDefinition[] = [
  {
    id: 'akami', name: '赤身',
    entries: [['maguro', 2], ['chutoro', 2], ['otoro', 1], ['bintoro', 2], ['duke_maguro', 2],
      ['tuna_gunkan', 2], ['tuna_salad_gunkan', 2], ['inari', 1], ['tamago', 2]],
    reorderEntries: [['maguro', 1], ['chutoro', 1], ['otoro', 1], ['duke_maguro', 1], ['bintoro', 2]],
  },
  {
    id: 'makimono', name: '巻物・軍艦',
    entries: [['kappa_maki', 2], ['kanpyo_maki', 2], ['natto_maki', 2], ['avocado_maki', 2],
      ['tuna_salad_gunkan', 2], ['corn_gunkan', 1], ['seafood_gunkan', 2], ['tuna_gunkan', 2],
      ['ikura_gunkan', 2], ['uni_gunkan', 1], ['tobiko_gunkan', 1]],
    reorderEntries: [['kappa_maki', 2], ['natto_maki', 1], ['avocado_maki', 1],
      ['tuna_salad_gunkan', 1], ['ikura_gunkan', 2], ['uni_gunkan', 1]],
  },
  {
    id: 'hikari', name: '光り物',
    entries: [['saba', 2], ['aji', 2], ['iwashi', 3], ['shime_saba', 1], ['saba_ohba', 2],
      ['aji_ohba', 1], ['aji_tataki', 2], ['kohada', 1], ['iwashi_shoga', 1],
      ['tuna_salad_gunkan', 2], ['inari', 1]],
    reorderEntries: [['iwashi', 2], ['saba', 1], ['aji', 1], ['saba_ohba', 1],
      ['aji_ohba', 1], ['aji_tataki', 1], ['kohada', 1]],
  },
  {
    id: 'kaisen', name: '海鮮',
    entries: [['ika', 3], ['tako', 3], ['ebi', 2], ['ebi_avocado', 3], ['takowasa', 3],
      ['botan_ebi', 1], ['mentaiko', 1], ['onion_salmon', 1]],
    reorderEntries: [['ika', 2], ['tako', 2], ['ebi', 1], ['ebi_avocado', 1], ['takowasa', 1], ['ebi_gunkan', 1]],
  },
  {
    id: 'niku', name: '肉寿司',
    entries: [['wagyu', 1], ['karubi', 2], ['roast_beef', 1], ['yakiniku', 2], ['gyutan', 2],
      ['inari', 2], ['tuna_salad_gunkan', 2], ['tamago', 1]],
    reorderEntries: [['wagyu', 1], ['karubi', 1], ['yakiniku', 1], ['gyutan', 1], ['inari', 1], ['ebi_avocado', 1]],
  },
]

// 挑戦モード専用：4500円・20枚。持続巻物で机を作り、軍艦と肉寿司で攻める。
export const CHALLENGE_CPU_DECK: CpuDeckDefinition = {
  id: 'challenge', name: '肉寿司＋巻物',
  entries: [['kappa_maki', 3], ['avocado_maki', 2], ['natto_maki', 2], ['tuna_salad_gunkan', 2],
    ['ikura_gunkan', 2], ['uni_gunkan', 1], ['yakiniku', 2], ['gyutan', 2], ['karubi', 2],
    ['wagyu', 1], ['roast_beef', 1]],
  reorderEntries: [['kappa_maki', 1], ['avocado_maki', 1], ['natto_maki', 1],
    ['tuna_salad_gunkan', 1], ['yakiniku', 1], ['karubi', 1], ['wagyu', 1]],
}

export function getCpuDeckDefinition(id: CpuDeckId): CpuOpponentDefinition {
  if (id === 'weak') return WEAK_CPU
  const definition = id === 'challenge' ? CHALLENGE_CPU_DECK : CPU_DECKS.find(deck => deck.id === id)
  if (!definition) throw new Error(`CPUデッキが見つかりません: ${id}`)
  return definition
}

export function chooseCpuDeck(mode: CpuBattleMode, random: RandomSource = Math.random): CpuOpponentDefinition {
  if (mode === 'weak') return WEAK_CPU
  if (mode === 'challenge') return CHALLENGE_CPU_DECK
  return CPU_DECKS[Math.floor(random() * CPU_DECKS.length)]
}

const cardById = new Map(CARDS.map(card => [card.id, card]))

function expandDeck(entries: readonly DeckEntry[]): Card[] {
  return entries.flatMap(([id, count]) => {
    const card = cardById.get(id)
    if (!card) throw new Error(`CPUデッキのカードが見つかりません: ${id}`)
    return Array.from({ length: count }, () => card)
  })
}

export function getCpuDeck(id: CpuDeckId, random: RandomSource = Math.random): Card[] {
  const definition = getCpuDeckDefinition(id)
  if (definition.id === 'weak') return getWeakCpuDeck(random)
  return expandDeck(definition.entries)
}

export function getCpuReorderDeck(id: CpuDeckId, random: RandomSource = Math.random): Card[] {
  const definition = getCpuDeckDefinition(id)
  if (definition.id === 'weak') return getWeakCpuReorderDeck(random)
  return expandDeck(definition.reorderEntries)
}
