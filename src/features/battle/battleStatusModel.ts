import {
  CARD_BY_ID, digestBonus, GUNKAN_BOOST, HAND_LIMIT, makimonoCount,
  MAKI_COMP_3, MAKI_COMP_5, OBA_REQUIRED,
} from '../../game/battleRules'
import type { MatchPlayer, SideMenuState } from '../../game/types'
import type { Card } from '../../types'

// すべて相手にも公開済みの情報。手札の内容や山札の順番には触れない。
export type BattleSideStatus = Pick<MatchPlayer,
  'summonedIds' | 'combosFired' | 'field' | 'attackBuff' | 'drawBonus'
  | 'kiretaStack' | 'kiretaSpent' | 'nikuMatsuri' | 'digestStopTurns'
  | 'apNextBonus' | 'thisTurnArch'> & { sideMenu?: SideMenuState | null }

export type BattleStatusItem = {
  id: string
  name: string
  value: string
  description: string
}

// calcFieldDmgと同じく、兼用ネタの強化は加算せず最大値を1つ適用する。
export function cardAttackBuff(card: Pick<Card, 'base' | 'subBases'>, buffs: Record<string, number>): number {
  return [card.base, ...(card.subBases ?? [])].reduce((highest, base) =>
    Math.max(highest, buffs[base] ?? 0), 0)
}

export function battleStatusDetails(st: BattleSideStatus): {
  effects: BattleStatusItem[]
  combos: BattleStatusItem[]
} {
  const maki = makimonoCount(st.field)
  const fieldDigestion = digestBonus(st.field)
  const sideDigestion = st.sideMenu?.id === 'miso' && st.sideMenu.status === 'active' ? 2 : 0
  const digestion = fieldDigestion + sideDigestion
  const effects: BattleStatusItem[] = [{
    id: 'kireta', name: '切れ味',
    value: st.kiretaSpent ? `${st.kiretaStack}（ターン終了後0）` : `${st.kiretaStack}`,
    description: st.kiretaSpent
      ? `コハダで消費済みです。このターンの光り物の攻撃には +${st.kiretaStack} が残りますが、カード効果で再消費できません。ターン終了時の攻撃後に0になります。`
      : `光り物の攻撃に1枚ごと +${st.kiretaStack}。コハダは全消費して即時ダメージ、シメサバは2消費して2枚ドローします。`,
  }]

  for (const [base, amount] of Object.entries(st.attackBuff)) {
    if (amount <= 0) continue
    effects.push({
      id: `attack:${base}`, name: `${base}の攻撃`, value: `+${amount}`,
      description: `試合中、${base}を基本ネタまたは兼用ネタに持つカードの攻撃 +${amount}。複数のネタを兼ねるカードは最も高い強化値を1つだけ受けます。`,
    })
  }
  if (st.drawBonus > 0) effects.push({
    id: 'draw', name: '追加ドロー', value: `+${st.drawBonus}`,
    description: `自分のターン終了時に、通常の1枚に加えて${st.drawBonus}枚引きます。試合中持続し、机の巻物が減っても失われません。手札上限は${HAND_LIMIT}枚で、山札が必要です。`,
  })
  if (st.apNextBonus > 0) effects.push({
    id: 'next-ap', name: '次のAP', value: `+${st.apNextBonus}`,
    description: `次の自分のターン開始時にAP +${st.apNextBonus}。現在のAPには加算されず、次のターンだけ有効です。`,
  })
  if (st.digestStopTurns > 0) effects.push({
    id: 'digest-stop', name: '消化停止', value: `次の${st.digestStopTurns}回`,
    description: `このプレイヤーのターン開始時の消化を、次の${st.digestStopTurns}回スキップします。机のカードとサイドメニューによる追加消化も発生しません。`,
  })
  if (digestion > 0) effects.push({
    id: 'digest-boost', name: '追加消化', value: `+${digestion}`,
    description: sideDigestion > 0
      ? `自分のターン開始時の消化量 +${digestion}（机のカード +${fieldDigestion}・あおさの味噌汁 +${sideDigestion}）。味噌汁の効果は試合中持続し、机のカードがなくなっても残ります。消化停止中は適用されません。`
      : `机のカードが残っている間、自分のターン開始時の消化量 +${digestion}。消化停止中は適用されません。`,
  })
  if (maki >= MAKI_COMP_5) effects.push({
    id: 'gunkan', name: '軍艦の攻撃', value: `×${GUNKAN_BOOST}`,
    description: `机に巻物が${MAKI_COMP_5}枚以上ある間、軍艦の攻撃を${GUNKAN_BOOST}倍にします。強化を加えた後、カードごとに小数点以下を切り捨てます。`,
  })
  if (st.nikuMatsuri) effects.push({
    id: 'niku', name: '肉祭り', value: '条件ボーナス×2',
    description: 'このターン、相手のお腹の条件で加算される攻撃ボーナスを2倍にします。基本攻撃力は2倍になりません。ターン終了で解除されます。',
  })

  const akami = ['maguro', 'chutoro', 'otoro'].filter(id => st.summonedIds.includes(id)).length
  const oba = st.summonedIds.filter(id => CARD_BY_ID[id]?.topping === '大葉').length
  const unpaired = st.field.filter(card => !card.kaisenPaired)
  const pairCount = (base: string) => unpaired.filter(card =>
    [card.base, ...(card.subBases ?? [])].includes(base)).length
  const combos: BattleStatusItem[] = [{
    id: 'akami_mori', name: '赤身三種盛り',
    value: st.combosFired.includes('akami_mori') ? '達成済' : `${akami}/3種`,
    description: 'マグロ・中トロ・大トロを試合中にそれぞれ召喚すると、即時10ダメージと以降マグロ系の攻撃 +2。同じ種類の重複は数えず、1試合に1回です。',
  }, {
    id: 'maki_comp_3', name: '巻物コンプ',
    value: st.combosFired.includes('maki_comp_3') ? '達成済' : `${maki}/${MAKI_COMP_3}枚`,
    description: `机に巻物を同時に${MAKI_COMP_3}枚置くと、以降は自分のターン終了時のドロー +1。同名カード・軍艦も数えます。成立は1試合に1回です。`,
  }, {
    id: 'maki_comp_5', name: '巻物フルコンプ', value: `${maki}/${MAKI_COMP_5}枚`,
    description: `机に巻物を同時に${MAKI_COMP_5}枚以上置いている間、軍艦の攻撃 ×${GUNKAN_BOOST}。巻物が減ると解除され、再び揃えば有効になります。`,
  }, {
    id: 'hikari_zanmai', name: '光り物三昧',
    value: st.combosFired.includes('hikari_zanmai') ? '達成済' : `大葉 ${oba}/${OBA_REQUIRED}枚`,
    description: `大葉トッピングのカードを試合中に合計${OBA_REQUIRED}枚召喚すると、切れ味 +3。同名カードも数え、1試合に1回です。光り物全体の枚数ではありません。`,
  }, {
    id: 'niku_matsuri', name: '肉祭り',
    value: st.nikuMatsuri ? '発動中' : `${st.thisTurnArch.niku ?? 0}/2枚（今ターン）`,
    description: '同じターンに肉寿司を2枚召喚すると、そのターンの条件付き攻撃ボーナスが2倍。別のターンには再び発動できます。',
  }, {
    id: 'umi_zanmai', name: '海の幸三昧', value: `未使用 いか${pairCount('いか')}・たこ${pairCount('たこ')}`,
    description: 'いか・たこの召喚時、机のまだペアに使っていない相方1枚と組み、机の海鮮が50%の威力で再攻撃します。ペア使用済みのカードは再び相方にできません。新しいペアなら何度でも発動します。',
  }]
  return { effects, combos }
}
