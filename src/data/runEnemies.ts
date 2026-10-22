// 寿司はしごの「大食い客」の顔ぶれ。試合前の顔見せと、軽いギミックだけを持つ（強さの大半はデッキと満腹ライン）。

export type EnemyCharacterId = 'harapeko' | 'obaachan' | 'salaryman' | 'oogui' | 'tsuu' | 'kodomo'

/** 試合に持ち込む補正。すべてCPU側だけに効く。 */
export type EnemyGimmick = {
  openingHand?: number
  drawBonus?: number
  startAP?: number
  extraGari?: number
  maxBellyDelta?: number
  initialBelly?: number
}

export type EnemyCharacter = {
  id: EnemyCharacterId
  name: string
  /** 顔見せで言うひと言。 */
  line: string
  /** ギミックの説明。 */
  trait: string
  gimmick: EnemyGimmick
}

export const ENEMY_CHARACTERS: readonly EnemyCharacter[] = [
  { id: 'harapeko', name: '腹ペコの学生', line: 'いっただっきまーす！ 部活帰りで死ぬほど腹へってる！',
    trait: '最初の手札が7枚', gimmick: { openingHand: 7 } },
  { id: 'obaachan', name: 'ガリ好きのおばあちゃん', line: 'ガリはね、いくらあってもいいのよ。',
    trait: 'ガリを2個多く持っている', gimmick: { extraGari: 2 } },
  { id: 'salaryman', name: '早食いのサラリーマン', line: '昼休みはあと20分。悪いけど急ぐよ。',
    trait: '毎ターン1枚多く引く', gimmick: { drawBonus: 1 } },
  { id: 'oogui', name: '大食い自慢の選手', line: 'え、まだ前菜だよね？',
    trait: '満腹ライン＋20。ただし来店前に食べてきてお腹15から', gimmick: { maxBellyDelta: 20, initialBelly: 15 } },
  { id: 'tsuu', name: '食通の旦那', line: 'ネタは鮮度が命。さて、お手並み拝見。',
    trait: 'APが3から始まる', gimmick: { startAP: 3 } },
  { id: 'kodomo', name: '回転寿司デビューの子ども', line: 'ぜんぶ回ってるー！ プリンも来るかな？',
    trait: '満腹ライン−10（すぐお腹いっぱいになる）', gimmick: { maxBellyDelta: -10 } },
]

export const ENEMY_CHARACTER_BY_ID: Readonly<Record<EnemyCharacterId, EnemyCharacter>> =
  Object.fromEntries(ENEMY_CHARACTERS.map(item => [item.id, item])) as Record<EnemyCharacterId, EnemyCharacter>

/** 大将の専用ルール（企画書9-3）。数値はエンジンと揃える。 */
export const TAISHO = {
  name: '大将',
  line: 'はしごの締めにうちを選ぶとは、いい度胸だ。握らせてもらうよ。',
  maxBelly: 150,
  osusumeEvery: 3,
  teaThreshold: 100,
  teaDigest: 30,
  rules: [
    'お腹の上限が150（大将は大食い）',
    '3ターンごとに「本日のおすすめ」：炙った高級寿司を1枚、0APで手札に加える',
    'お腹が100を超えた最初の1回だけ「締めのお茶」でお腹−30',
  ],
} as const
