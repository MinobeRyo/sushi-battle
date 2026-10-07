import './TitleScreen.css'

type Props = {
  onSelect: (mode: 'weak' | 'cpu' | 'challenge' | '2p' | 'online') => void
  onBack: () => void
}

export function ModeSelectScreen({ onSelect, onBack }: Props) {
  return (
    <div className="mode-screen flex flex-col items-center h-full gap-6 py-6 overflow-y-auto">
      <h2 className="mt-auto shrink-0 text-4xl font-bold text-amber-100">モード選択</h2>
      <div className="mode-screen-actions flex flex-col shrink-0 gap-4 w-64 max-w-full px-2">
        <button
          onClick={() => onSelect('weak')}
          className="py-4 bg-stone-700 hover:bg-stone-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          CPU対戦 · 最弱
          <span className="mt-1 block text-xs font-normal text-stone-100">これまでの汎用デッキCPU</span>
        </button>
        <button
          onClick={() => onSelect('cpu')}
          className="py-4 bg-orange-700 hover:bg-orange-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          CPU対戦 · 普通
          <span className="mt-1 block text-xs font-normal text-orange-100">5つのビルドからランダムに対戦</span>
        </button>
        <button
          onClick={() => onSelect('challenge')}
          className="py-4 bg-rose-800 hover:bg-rose-700 text-white text-xl font-bold rounded-xl transition-colors"
        >
          CPU対戦 · 挑戦
          <span className="mt-1 block text-xs font-normal text-rose-100">総額4,500円の肉寿司＋巻物CPU</span>
        </button>
        <button
          onClick={() => onSelect('2p')}
          className="py-4 bg-emerald-700 hover:bg-emerald-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          二人対戦
        </button>
        <button
          onClick={() => onSelect('online')}
          className="py-4 bg-sky-800 hover:bg-sky-700 text-white text-xl font-bold rounded-xl transition-colors"
        >
          オンライン対戦
          <span className="mt-1 block text-xs font-normal text-sky-200">デッキを組んで2人で対戦</span>
        </button>
      </div>
      <button onClick={onBack} className="mb-auto shrink-0 text-stone-400 hover:text-stone-200 transition-colors">
        ← 戻る
      </button>
    </div>
  )
}
