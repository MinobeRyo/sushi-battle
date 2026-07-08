type Props = {
  onSelect: (mode: 'cpu' | '2p') => void
  onBack: () => void
}

export function ModeSelectScreen({ onSelect, onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h2 className="text-4xl font-bold text-amber-100">モード選択</h2>
      <div className="flex flex-col gap-4 w-56">
        <button
          onClick={() => onSelect('cpu')}
          className="py-4 bg-orange-700 hover:bg-orange-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          CPU対戦
        </button>
        <button
          onClick={() => onSelect('2p')}
          className="py-4 bg-emerald-700 hover:bg-emerald-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          二人対戦
        </button>
      </div>
      <button onClick={onBack} className="text-stone-400 hover:text-stone-200 transition-colors">
        ← 戻る
      </button>
    </div>
  )
}
