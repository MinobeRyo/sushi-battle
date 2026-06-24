export function BattleScreen() {
  return (
    <div className="relative h-full flex flex-col bg-amber-950">
      {/* 相手エリア（上） */}
      <div className="flex-1 flex flex-col justify-start p-4 gap-2">
        <div className="flex justify-between items-center">
          <span className="text-stone-300 text-sm">相手</span>
          <BellyGauge value={0} />
        </div>
        {/* 相手の机（持続カード） */}
        <Desk />
      </div>

      {/* 仕切り線 */}
      <div className="h-px bg-amber-800 mx-4" />

      {/* 自分エリア（下） */}
      <div className="flex-1 flex flex-col justify-end p-4 gap-2">
        {/* 自分の机 */}
        <Desk />
        <div className="flex justify-between items-center">
          <BellyGauge value={0} />
          <span className="text-stone-300 text-sm">自分</span>
        </div>
        {/* 手札 */}
        <div className="flex gap-2 overflow-x-auto py-2">
          <span className="text-stone-500 text-sm">手札がここに並びます</span>
        </div>
      </div>
    </div>
  )
}

function BellyGauge({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 h-3 bg-stone-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-white text-xs">{value}/100</span>
    </div>
  )
}

function Desk() {
  return (
    <div className="flex gap-2 min-h-16 bg-amber-900/40 rounded-xl p-2">
      <span className="text-stone-600 text-sm self-center">机（持続カード）</span>
    </div>
  )
}
