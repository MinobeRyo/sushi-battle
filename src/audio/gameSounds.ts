import { playSound, unlockAudio } from '../features/sound-lab/audio'

export const GAME_SOUNDS = {
  expressOrder: { id: 'order-bell', volume: 0.6 },
  tabletTouch: { id: 'pop-soft', volume: 0.45 },
  dishPickup: { id: 'dish-pokon', volume: 0.45 },
  cardPlay: { id: 'card-play', volume: 0.2 },
} as const

export type GameSoundName = keyof typeof GAME_SOUNDS

/** SE の読み込みや再生が失敗しても、ゲームの操作は続ける。 */
export function playGameSound(name: GameSoundName): void {
  const { id, volume } = GAME_SOUNDS[name]
  void playSound(id, { volume, pitch: 1, duration: 1 }).catch(() => {})
}

/** サーバー応答後に鳴らす場合も、最初のクリック内で音声を有効にする。 */
export function prepareGameAudio(): void {
  void unlockAudio().catch(() => {})
}
