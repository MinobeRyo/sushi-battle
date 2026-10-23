import { RELICS, type RelicId } from '../../data/runRelics'

// 図鑑「器」ページ用の一覧。実装状況はコードとテスト（scripts/test-roguelike-run.mjs）で確かめた内容を書く。
// 企画書8章にあって runRelics.ts にまだない器（相盛り・大将）も、未実装として並べる。

export type RelicStatus = 'done' | 'partial' | 'todo'
export type RelicKind = 'normal' | 'aimori' | 'taisho'
export type RelicCatalogGrade = 'nami' | 'jo' | 'tokujo' | 'taisho'

export type RelicCatalogEntry = {
  id: string
  name: string
  kind: RelicKind
  grade: RelicCatalogGrade
  /** 系統の表示名。相盛りは「赤身×肉寿司」のように2つ。 */
  lineage: string
  /** 絞り込み用の系統キー（相盛りは両方）。 */
  archetypes: readonly string[]
  text: string
  cost?: string
  status: RelicStatus
  /** 一部・未実装のとき、足りないものを一言で。 */
  note?: string
}

export const RELIC_STATUS_LABEL: Readonly<Record<RelicStatus, string>> = { done: '実装済み', partial: '一部だけ', todo: '未実装' }
export const RELIC_KIND_LABEL: Readonly<Record<RelicKind, string>> = { normal: '通常の器', aimori: '相盛りの器', taisho: '大将の器' }
export const RELIC_CATALOG_GRADE_LABEL: Readonly<Record<RelicCatalogGrade, string>> = { nami: '並', jo: '上', tokujo: '特上', taisho: '大将' }
export const RELIC_LINEAGE_LABEL: Readonly<Record<string, string>> = {
  akami: '赤身', makimono: '巻物', hikari: '光り物', kaisen: '海鮮', niku: '肉寿司', general: '汎用', mixed: '回復×攻撃',
}

/** 実装済みの器のうち、何かが足りないものだけ書く。書いていない器は「実装済み」。 */
const NORMAL_STATUS: Partial<Record<RelicId, { status: RelicStatus; note: string }>> = {
  wasabi_tsubo: { status: 'partial', note: '効果は動くが、対戦画面の三種盛りの進み具合は「◯/3」のまま' },
  saku_bako: { status: 'partial', note: '赤身を出した時点の手札だけ下がる。そのあと引いた赤身は次に赤身を出すまで下がらない' },
  gunkan_kata: { status: 'partial', note: '攻撃の数値は2倍になるが、状態表示の「軍艦×1.5」は変わらない' },
  togi_oke: { status: 'partial', note: '切れ味は戻るが、状態表示は「ターン終了後0」のまま' },
  tairyo_bata: { status: 'partial', note: '再攻撃は100%になるが、海の幸三昧の説明文は「50％」のまま' },
}

const NORMAL_ENTRIES: RelicCatalogEntry[] = RELICS.map(relic => ({
  id: relic.id, name: relic.name, kind: 'normal', grade: relic.grade,
  lineage: RELIC_LINEAGE_LABEL[relic.archetype], archetypes: [relic.archetype], text: relic.text,
  status: NORMAL_STATUS[relic.id]?.status ?? 'done', note: NORMAL_STATUS[relic.id]?.note,
}))

const AIMORI_NOTE = '第3段で作る。器のデータも効果もまだない'
const TAISHO_NOTE = '第3段で作る。代償の仕組みと入手先（ハプニング）がまだない'

const PLANNED_ENTRIES: RelicCatalogEntry[] = [
  { id: 'niku_maguro_ozara', name: '肉まぐろの大皿', kind: 'aimori', grade: 'jo', lineage: '赤身×肉寿司', archetypes: ['akami', 'niku'], text: '生ハムを赤身としても数える（三種盛り後の赤身強化が乗る）' },
  { id: 'takoyaki_ki', name: 'たこ焼き器', kind: 'aimori', grade: 'jo', lineage: '巻物×海鮮', archetypes: ['makimono', 'kaisen'], text: '机の巻物も、いか・たこの連鎖を起こす' },
  { id: 'sakudori_bocho', name: '柵取り包丁', kind: 'aimori', grade: 'jo', lineage: '光り物×赤身', archetypes: ['hikari', 'akami'], text: '切れ味1につき、赤身の攻撃 +1' },
  { id: 'tempura_nabe', name: '天ぷら鍋', kind: 'aimori', grade: 'jo', lineage: '海鮮×肉寿司', archetypes: ['kaisen', 'niku'], text: '海の幸三昧の再攻撃にも、天ぷらの「相手のお腹○以上」の強化が乗る' },
  { id: 'aotake_makisu', name: '青竹の巻きす', kind: 'aimori', grade: 'jo', lineage: '光り物×巻物', archetypes: ['hikari', 'makimono'], text: '机に巻物がいる間、自分のターン終了ごとに切れ味 +1' },
  { id: 'kyusu', name: '急須', kind: 'aimori', grade: 'tokujo', lineage: '回復×攻撃', archetypes: ['mixed'], text: '自分のお腹を減らすたび、減らした量の半分を相手のお腹に足す' },
  { id: 'tokudai_yunomi', name: '特大の湯呑み', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: '毎ターンAP +2', cost: '試合開始時にお腹 +20' },
  { id: 'mawaranai_counter', name: '回らないカウンター', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: '手札上限 +3・ドロー +1', cost: '買い物マスに入れない' },
  { id: 'ogon_no_sara', name: '黄金の皿', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: 'すべての寿司の攻撃 +5', cost: '報酬の寿司が2枚から1枚になる' },
  { id: 'yanagiba', name: '大将の柳刃包丁', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: 'コンボが成立するたびに20ダメージ', cost: 'ガリが0個になる' },
  { id: 'mangetsu_no_utsuwa', name: '満月の器', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: '持続型は机にいるあいだ毎ターン攻撃 +3 ずつ伸びる', cost: '瞬間型の攻撃 −2' },
  { id: 'kaitendai', name: '回転台', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: 'おかわりのたび、その試合中は全寿司が炙り状態', cost: 'おかわりのたびにお腹 +10' },
  { id: 'kin_byobu', name: '金屏風', kind: 'taisho', grade: 'taisho', lineage: '大将', archetypes: ['taisho'], text: '試合開始時に相手のお腹 +25', cost: '試合後のお腹が半分にならない' },
].map(entry => ({ ...entry, kind: entry.kind as RelicKind, grade: entry.grade as RelicCatalogGrade, status: 'todo' as const, note: entry.kind === 'aimori' ? AIMORI_NOTE : TAISHO_NOTE }))

/** 企画書8章の器31種（通常18・相盛り6・大将7）。 */
export const RELIC_CATALOG: readonly RelicCatalogEntry[] = [...NORMAL_ENTRIES, ...PLANNED_ENTRIES]

export function relicStatusCounts(entries: readonly RelicCatalogEntry[] = RELIC_CATALOG): Record<RelicStatus, number> {
  return entries.reduce((counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }), { done: 0, partial: 0, todo: 0 })
}
