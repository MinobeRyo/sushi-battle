export type CardType = 'instant' | 'persist'

export type Archetype =
  | 'akami'      // 赤身
  | 'makimono'   // 巻物・軍艦
  | 'hikari'     // 光り物
  | 'kaisen'     // 海鮮
  | 'niku'       // 肉寿司
  | 'gunkan'     // 軍艦（巻物コンプ5枚で攻撃1.5倍を受ける）
  | 'general'    // 汎用

export type Lane = 'general' | 'build' | 'shinkansen'

export type Card = {
  id: string
  variant?: 'sideways' | 'neta_missing' | 'rare_corn'
  name: string
  base: string
  subBases?: string[]  // 太巻きのように複数のネタを内包するカード（base扱いされる副ネタ）
  topping: string | null
  type: CardType
  cost: number        // 食欲ポイント（バトル）
  price: number       // 軍資金（ドラフト）
  attack: number
  fullness: number    // 持続型: 残存ターン数 / 即時型: 0
  effect: string | null
  archetype: Archetype[]
  lane: Lane
  /** 寿司はしごの「炙り」版。効果の数値は battleRules / matchEngine が見て強める。通常対戦では付かない。 */
  aburi?: true
  /** 寿司はしごの器・常連さんの得意技による、この1枚への強化。通常対戦では付かない。 */
  boost?: CardBoost
}

export type CardBoost = {
  kiretaMult?: number      // 名工の出刃：切れ味による攻撃強化の倍率
  gunkanMult?: number      // 軍艦の型枠：巻物フルコンプ中の軍艦の倍率
  norikan?: true           // 海苔缶：机に巻物がいれば、巻物コンプの数え方 +2
  chainExtra?: number      // たこ壺：いか・たこの連鎖への上乗せ
  fullReattack?: true      // 大漁旗：海の幸三昧の再攻撃を100%で行う
  noDecay?: true           // 網元の網：持続が減らない
  sarazumi?: true          // 常連さん「皿積み」：机の寿司1枚につき攻撃 +1
  shichirin?: true         // 七輪で攻撃 +4 済み（二重に足さないため）
}

export type ComboTrigger = 'cumulative' | 'simultaneous'

export type Combo = {
  id: string
  name: string
  trigger: ComboTrigger
  condition: ComboCondition
  effect: ComboEffect
  activated: boolean
}

export type ComboCondition =
  | { type: 'summon_each'; cards: string[] }           // 各カードを1回以上召喚（累積）
  | { type: 'summon_count'; archetype: Archetype; count: number } // N枚召喚（累積）
  | { type: 'topping_count'; topping: string; count: number }     // トッピングN枚（累積）
  | { type: 'desk_count'; count: number }              // 机にN枚同時（同時）
  | { type: 'same_turn'; cards: string[] }             // 同ターンに指定カード召喚（同時）

export type ComboEffect =
  | { type: 'instant_damage'; amount: number }
  | { type: 'attack_buff'; target: Archetype | 'all'; amount: number }
  | { type: 'draw_buff'; amount: number }
  | { type: 'stack_bonus'; stackName: string; amount: number }
  | { type: 'extra_attack'; times: number }
  | { type: 'threshold_down'; amount: number }

export type Phase = 'title' | 'mode_select' | 'draft' | 'battle' | 'result'

export type Player = {
  id: 0 | 1
  deck: Card[]
  hand: Card[]
  desk: DeskCard[]
  belly: number           // お腹ゲージ（0〜100、100で負け）
  appetite: number        // 現在の食欲ポイント
  maxAppetite: number     // 食欲ポイント最大値
  summonHistory: SummonHistory
  combos: Combo[]
  kiretaStack: number     // 光り物ビルド用切れ味スタック
  condiment: CondimentSlot
  sideMenu: Card | null
}

export type DeskCard = Card & {
  remainingTurns: number
}

export type SummonHistory = {
  byBase: Record<string, number>
  byArchetype: Record<Archetype, number>
  byTopping: Record<string, number>
  byCardId: Record<string, number>
  thisTurn: string[]      // 今ターン召喚したカードID一覧
}

export type CondimentSlot = {
  slots: [CondimentCard | null, CondimentCard | null]
}

export type CondimentCard = {
  id: string
  name: string
  effect: 'debuff_clear' | 'halve_next_damage' | 'attack_boost_1_5x'
  used: boolean
}

export type GameState = {
  phase: Phase
  turn: number
  activePlayer: 0 | 1
  players: [Player, Player]
  winner: 0 | 1 | null
}
