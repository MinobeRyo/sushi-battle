// 寿司はしごの「ハプニング」（？マス）。ゆるい寿司屋あるある（企画書12章）。効果は src/game/runEvents.ts。

export type RunEventChoiceText = { id: string; label: string; detail: string }
export type RunEventText = { id: string; title: string; text: string; choices: readonly RunEventChoiceText[] }

export const RUN_EVENTS: readonly RunEventText[] = [
  { id: 'osusowake', title: '隣のお客のおすそわけ', text: '「頼みすぎちゃって。よかったらどうぞ」隣の席から皿がすべってきた。',
    choices: [
      { id: 'take', label: 'ありがたくもらう', detail: 'ランダムな寿司を1枚もらう' },
      { id: 'decline', label: '遠慮する', detail: '何も起きない' },
    ] },
  { id: 'shoyu', title: '醤油をこぼした', text: '小皿をひっくり返して、カウンターが醤油まみれに。',
    choices: [
      { id: 'pay', label: 'おしぼり代を払う', detail: '持ち金 −50' },
      { id: 'eat', label: 'こぼれた分を寿司で拭って食べる', detail: 'お腹 +10' },
    ] },
  { id: 'okaikei', title: 'お会計の数え間違い', text: '皿の枚数が少なく数えられている。このままだと安くなりそうだ。',
    choices: [
      { id: 'honest', label: '正直に言う', detail: '大将が感心して、寿司1枚を炙ってくれる' },
      { id: 'quiet', label: '黙っておく', detail: '持ち金 +100' },
    ] },
  { id: 'wasabi', title: 'わさび入れすぎ', text: '鼻にツーンときた。涙が止まらない。',
    choices: [
      { id: 'endure', label: '我慢して食べきる', detail: 'ランダムな寿司1枚が炙りになる。お腹 +5' },
      { id: 'swap', label: '取り替えてもらう', detail: '何も起きない' },
    ] },
  { id: 'nurui_ocha', title: 'お茶がぬるい', text: '湯呑みのお茶が、なんだかぬるい。',
    choices: [
      { id: 'tell', label: '店員さんに伝える', detail: 'おわびに寿司1枚を炙ってもらえる' },
      { id: 'gulp', label: 'ぬるいのでゴクゴク飲む', detail: 'お腹 −10' },
    ] },
  { id: 'kodomo', title: '子どもに皿を取られた', text: '隣の席の子どもが、レーンからあなたの皿を取ってしまった。',
    choices: [
      { id: 'give', label: 'あげる', detail: 'デッキからランダムに1枚なくなる。親が謝って持ち金 +150' },
      { id: 'keep', label: 'そっと取り返す', detail: '何も起きない' },
    ] },
  { id: 'birthday', title: '誕生日のお客さん', text: '店内の照明が落ち、バースデーソングが流れ始めた。',
    choices: [
      { id: 'sing', label: '一緒に歌う', detail: 'お腹 −15（笑って消化が進む）' },
      { id: 'clap', label: '拍手だけする', detail: '持ち金 +30（お祝いのおすそわけ）' },
    ] },
  { id: 'touch_panel', title: 'タッチパネルの押し間違い', text: '袖が当たって、知らない寿司を2皿も注文してしまった。',
    choices: [
      { id: 'eat', label: '届いたものはいただく', detail: 'ランダムな寿司が2枚デッキに入る' },
    ] },
  { id: 'gari_tabehoudai', title: 'ガリ食べ放題', text: '今日はガリが取り放題らしい。',
    choices: [
      { id: 'take', label: 'たっぷり取る', detail: '次の試合だけガリ +2' },
      { id: 'little', label: 'ほどほどにする', detail: 'お腹 −5' },
    ] },
  { id: 'wasuremono', title: 'レーンの忘れ物', text: 'レーンの上を、立派な器がぐるぐる回っている。',
    choices: [
      { id: 'keep', label: 'ありがたく使わせてもらう', detail: '器（並）を1つ手に入れる' },
      { id: 'return', label: '店員さんに届ける', detail: '持ち主がお礼に持ち金 +100' },
    ] },
  { id: 'gacha', title: '皿投入ガチャ', text: '食べ終わった皿を入れると、何かが当たるらしい。1回100円。',
    choices: [
      { id: 'spin', label: '100円で回す', detail: '半分の確率で器、はずれでも寿司を1枚' },
      { id: 'skip', label: '回さない', detail: '何も起きない' },
    ] },
  { id: 'kimagure', title: '大将の気まぐれ', text: '「お兄さん、今日はいいネタが入ってるよ。どうだい？」',
    choices: [
      { id: 'order', label: 'おまかせで頼む（¥200）', detail: '選んだ系統の寿司を炙り済みで1枚' },
      { id: 'decline', label: '今日はやめておく', detail: '何も起きない' },
    ] },
]

export const RUN_EVENT_IDS: readonly string[] = RUN_EVENTS.map(event => event.id)
export const RUN_EVENT_BY_ID: Readonly<Record<string, RunEventText>> = Object.fromEntries(RUN_EVENTS.map(event => [event.id, event]))
