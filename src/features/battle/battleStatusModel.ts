import {
  CARD_BY_ID, digestBonus, GUNKAN_BOOST, HAND_LIMIT, makimonoCount,
  MAKI_COMP_3, MAKI_COMP_5, OBA_REQUIRED, tekkaApBonus, hasNamahamuAura,
} from '../../game/battleRules'
import type { MatchPlayer, SideMenuState } from '../../game/types'
import type { Card } from '../../types'

// すべて相手にも公開済みの情報。手札の内容や山札の順番には触れない。
export type BattleSideStatus = Pick<MatchPlayer,
  'summonedIds' | 'combosFired' | 'field' | 'attackBuff' | 'drawBonus'
  | 'kiretaStack' | 'kiretaSpent' | 'nikuMatsuri' | 'digestStopTurns'
  | 'apNextBonus' | 'thisTurnArch'> & { sideMenu?: SideMenuState | null; sacrificedThisTurn?: number }

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
  const tekkaAp = tekkaApBonus(st.field, st.combosFired)
  const fieldDigestion = digestBonus(st.field)
  const sideDigestion = st.sideMenu?.id === 'miso' && st.sideMenu.status === 'active' ? 2 : 0
  const digestion = fieldDigestion + sideDigestion
  const effects: BattleStatusItem[] = [{
    id: 'kireta', name: '切れ味',
    value: st.kiretaSpent ? `${st.kiretaStack}（ターン終了後0）` : `${st.kiretaStack}`,
    description: st.kiretaSpent
      ? `コハダで消費済み：同ターンに再使用不可\n光り物の攻撃＋${st.kiretaStack}は当ターンの攻撃後まで維持\nターン終了時：切れ味0`
      : `光り物1枚ごとの攻撃＋${st.kiretaStack}\nコハダ：全消費して即時ダメージ\nシメサバ：2消費して2枚ドロー\nサバ：1消費で防御予約（任意）\nイワシ生姜：2消費で防御予約（任意）`,
  }]

  for (const card of st.field) {
    if (card.defenseState) effects.push({
      id: `defense:${card.fid}`, name: card.name,
      value: card.defenseState === 'reserved' ? '防御予約' : '防御待機',
      description: [
        card.defenseState === 'reserved'
          ? '自分の通常攻撃後：防御待機に変化'
          : '防御待機中：攻撃しない',
        '相手の攻撃時：ガリと一緒に使用または温存を選択',
        card.effect === 'reserve_random_quarter_0'
          ? '使用時：ランダム1枚の攻撃を25％軽減（切り捨て）'
          : card.effect === 'reserve_random_half_1'
          ? '使用時：相手の攻撃可能な1枚をランダムに半減'
          : '使用時：相手の攻撃可能な1枚を選んで半減',
        'その相手ターン中有効',
        '固定ダメージは半減しない',
        '使用時・相手ターン終了時：防御札が消える',
      ].join('\n'),
    })
    if (card.attackHalved) effects.push({
      id: `attack-half:${card.fid}`, name: card.name, value: '攻撃半減',
      description: 'すべての強化後：攻撃を切り捨て半減\nこのカードの通常攻撃・海鮮の再攻撃に反映\n固定ダメージは対象外\n当ターン終了時：解除',
    })
    if (card.attackReductionRate) effects.push({
      id: `attack-reduction:${card.fid}`, name: card.name, value: `攻撃${Math.round(card.attackReductionRate * 100)}％減`,
      description: 'チーズの防御：強化後の攻撃から軽減分を切り捨てて引きます。当ターン終了時に解除。',
    })
  }

  if (hasNamahamuAura(st.field)) effects.push({
    id: 'aigamo', name: '合鴨の強化', value: '生ハム＋2',
    description: '合鴨が机にいる間、自分の生ハムの攻撃＋2。合鴨同士は重複しません。',
  })

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
  if (tekkaAp > 0) effects.push({
    id: 'tekka-ap', name: '鉄火巻きのAP', value: `開始時 +${tekkaAp}`,
    description: `赤身三種盛り成立後、机の鉄火巻き1枚につき、自分のターン開始時の通常回復後のAPと当ターンのAP上限に+1（現在の机なら+${tekkaAp}）。通常上限10を超えられます。召喚時や相手ターンには増えず、机からなくなると次回以降は加算されません。`,
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
    id: 'niku', name: '肉祭り', value: '今ターン発動済',
    description: '今ターン発動済み（各ターン1回）。\n即時5ダメージ（ガリ不可）。\n山札のランダムな位置に0AP生ハム1枚追加。\n自分の全生ハムの攻撃+1（試合中・累積）。',
  })

  const akami = ['maguro', 'chutoro', 'otoro'].filter(id => st.summonedIds.includes(id)).length
  const oba = st.summonedIds.filter(id => CARD_BY_ID[id]?.topping === '大葉').length
  const unpaired = st.field.filter(card => !card.kaisenPaired)
  const pairCount = (base: string) => unpaired.filter(card =>
    [card.base, ...(card.subBases ?? [])].includes(base)).length
  const combos: BattleStatusItem[] = [{
    id: 'akami_mori', name: '赤身三種盛り',
    value: st.combosFired.includes('akami_mori') ? '達成済' : `${akami}/3種`,
    description: [
      'マグロ・中トロ・大トロを各1回召喚（1試合に1回）',
      '追加効果解放！ 詳細は各カードへ',
      '相手のお腹＋10／マグロ系の攻撃＋2（試合中）',
    ].join('\n'),
  }, {
    id: 'maki_comp_3', name: '巻物コンプ',
    value: st.combosFired.includes('maki_comp_3') ? '達成済' : `${maki}/${MAKI_COMP_3}枚`,
    description: `机に巻物${MAKI_COMP_3}枚 → 以降、終了時に＋1枚ドロー。軍艦・同名もOK。`,
  }, {
    id: 'maki_comp_5', name: '巻物フルコンプ', value: `${maki}/${MAKI_COMP_5}枚`,
    description: `机に巻物${MAKI_COMP_5}枚以上 → 軍艦の攻撃×${GUNKAN_BOOST}（揃っている間）。`,
  }, {
    id: 'hikari_zanmai', name: '光り物三昧',
    value: st.combosFired.includes('hikari_zanmai') ? '達成済' : `大葉 ${oba}/${OBA_REQUIRED}枚`,
    description: `大葉つきを合計${OBA_REQUIRED}枚召喚 → 切れ味＋3。1試合に1回、同名もOK。`,
  }, {
    id: 'niku_matsuri', name: '肉祭り',
    value: st.nikuMatsuri ? '今ターン発動済' : `${st.sacrificedThisTurn ?? 0}/2体（今ターン）`,
    description: '同ターンに生ハム2体を生贄 → 5ダメージ・山札に生ハム1枚・全生ハムの攻撃＋1（累積）。各ターン1回。',
  }, {
    id: 'umi_zanmai', name: '海の幸三昧', value: `未使用 いか${pairCount('いか')}・たこ${pairCount('たこ')}`,
    description: '未使用のいか＋たこ → 海鮮の攻撃50％で再攻撃。通常のえび1枚ごとに＋7。新しいペアなら何度でも。',
  }]
  return { effects, combos }
}
