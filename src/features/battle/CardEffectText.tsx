import type { Card } from '../../types'
import { NAMAHAM_CARD } from '../../data/cards'
import { EFFECT_FULL, COMBO_EFFECT_PARTS } from './battlePresentation'
import { hasAkamiMori } from './battleEngine'
import './CardEffectText.css'

const EFFECT_SHORT: Record<string, string> = {
  self_digest_5: '自分のお腹 −5',
  refund_ap_1_if_tako: '机にたこ系がいれば AP +1',
  buff_current_makimono_2: '場の巻物（軍艦以外）攻撃 +2',
  draw_random_akami_1: '山札の赤身1枚を引く',
  destroy_enemy_persist_1: '相手の持続1枚を選んで破壊',
  reduce_random_akami_cost_1: 'ランダムな赤身1枚の消費AP −1',
  digest_boost_2: '毎ターンの消化 +2',
  digest_stop_1t: '相手の消化を1ターン停止',
  kireta_stack: '切れ味 +1',
  kireta_consume_x3: '切れ味全消費 ×3攻撃',
  kireta_consume_2_draw_2: '切れ味2で2枚引く',
  belly_boost_70: '相手お腹70以上で攻撃 +8',
  belly_boost_60: '相手お腹60以上で攻撃 +5',
  belly_boost_65: '相手お腹65以上で攻撃 +6',
  belly_boost_persist_50_namahamu_deck_1: '腹50以上で+2・生ハムを山札へ',
  generate_namahamu_1: '生ハムを1体生成',
  generate_namahamu_2: '生ハムを2体生成',
  sacrifice_namahamu_1_7: '生ハム1体で攻撃 +7',
  sacrifice_namahamu_2_8: '生ハム2体まで・各 +8',
  chain_on_kaisen_summon: '海鮮召喚で連鎖攻撃',
  draw_1: '召喚時に1枚引く',
  draw_2: '召喚時に2枚引く',
  draw_persist_ika_tako_1: '持続いか・たこを1枚引く',
  ap_next_1: '次のターン AP +1',
  multi_base: 'マグロ・えびも兼ねる',
}

const NAMAHAM_DESCRIPTION = '生成専用カードです。牛タン寿司・ローストビーフ寿司は机に生成し、焼肉寿司は自分の終了時に山札へ1枚、肉祭りは手札に2枚追加します。0AP・基本攻撃1・自分の3ターン持続。肉祭りが発動するたび、自分の全生ハムの攻撃が試合中+1ずつ累積します。カルビ寿司・和牛にぎりの生贄にできます。購入はできません。'

export function CardEffectText({ card, variant = 'full', combosFired = [], tone = 'light' }: {
  card: Card
  variant?: 'short' | 'full'
  combosFired?: readonly string[]
  tone?: 'light' | 'dark'
}) {
  const conditional = card.effect ? COMBO_EFFECT_PARTS[card.effect]?.[variant] : undefined
  const plain = card.id === NAMAHAM_CARD.id
    ? variant === 'short' ? '生成専用・生贄にできる' : NAMAHAM_DESCRIPTION
    : card.effect ? (variant === 'short' ? EFFECT_SHORT : EFFECT_FULL)[card.effect]
      ?? (variant === 'short' ? '特殊効果あり・詳細を確認' : '効果の説明は準備中です') : '特殊効果なし'
  const active = hasAkamiMori(combosFired)
  return <span className={`card-effect-text${tone === 'dark' ? ' card-effect-text--dark' : ''}`}>
    {conditional ? conditional.map((part, index) => part.combo
      ? <span key={index} className="card-effect-condition" data-combo-condition={part.combo}
        data-active={active} title={`赤身三種盛り：${active ? '成立済み' : '未成立'}`}>{part.text}</span>
      : <span key={index}>{part.text}</span>) : plain}
  </span>
}
