import { useState } from 'react'
import type { OnlineRoomController } from './useOnlineRoom'

type Props = { room: OnlineRoomController; onBack: () => void }

export function OnlineLobby({ room, onBack }: Props) {
  const [code, setCode] = useState('')
  const [copiedCode, setCopiedCode] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  const waiting = room.snapshot !== null
  const connected = room.status === 'connected'
  const disabled = !connected || room.pending
  const connectionLabel = room.status === 'connecting' ? 'サーバーに接続しています…'
    : connected ? room.pending ? 'サーバーに確認しています…' : 'サーバーに接続済みです'
      : '接続が切れています。自動で再接続します。'

  const copyCode = async () => {
    if (!room.snapshot) return
    try {
      await navigator.clipboard.writeText(room.snapshot.code)
      setCopiedCode(room.snapshot.code)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-8" style={{ background: 'linear-gradient(180deg, #1a0800, #3d1a0a)' }}>
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5">
        <div className="text-center">
          <p className="mb-2 text-sm font-bold tracking-widest text-amber-600">すしバトル</p>
          <h1 className="text-3xl font-bold text-amber-100">オンライン対戦</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-300">部屋コードを共有して、2人で対戦できます。<br />今回は固定デッキで通信を試せます。<br />両者のカードがなくなると自動で補充します。</p>
        </div>

        <p role="status" className={`text-center text-sm ${connected ? 'text-amber-200' : 'text-stone-300'}`}>
          {connectionLabel}
        </p>
        {room.error && (
          <p role="alert" className="rounded-xl border border-red-800 bg-red-950/70 px-4 py-3 text-sm leading-relaxed text-red-200">
            {room.error}
          </p>
        )}

        {room.snapshot ? (
          <section className="rounded-2xl border border-amber-900 bg-stone-950/35 px-5 py-6 text-center">
            <h2 className="text-xl font-bold text-amber-100">相手の参加を待っています</h2>
            <p className="mt-4 text-sm text-stone-300">相手にこの部屋コードを伝えてください。</p>
            <p className="my-4 select-all font-mono text-5xl font-bold tracking-[0.18em] text-amber-300" aria-label={`部屋コード ${room.snapshot.code}`}>
              {room.snapshot.code}
            </p>
            <button onClick={() => void copyCode()} className="rounded-lg border border-amber-800 px-4 py-2 text-sm text-amber-200 hover:bg-amber-950">
              {copiedCode === room.snapshot.code ? 'コピーしました' : '部屋コードをコピー'}
            </button>
            {copyFailed && <p role="status" className="mt-2 text-xs text-stone-400">コピーできませんでした。上のコードを選択して共有してください。</p>}
            <p className="mt-5 text-sm leading-relaxed text-stone-400">相手が参加すると対戦が始まります。<br />この画面を開いたままお待ちください。</p>
          </section>
        ) : room.session ? (
          <div className="rounded-2xl border border-amber-900 bg-stone-950/35 px-5 py-6 text-center text-amber-100">
            参加していた部屋を確認しています…
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-amber-900 bg-stone-950/35 p-5">
              <h2 className="mb-2 text-lg font-bold text-amber-100">部屋を作る</h2>
              <p className="mb-4 text-sm text-stone-400">作成したコードを相手に共有します。</p>
              <button disabled={disabled} onClick={() => void room.createRoom()} className="w-full rounded-xl bg-orange-700 py-3 font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40">
                部屋を作成
              </button>
            </section>
            <form className="rounded-2xl border border-amber-900 bg-stone-950/35 p-5" onSubmit={event => { event.preventDefault(); if (!disabled) void room.joinRoom(code) }}>
              <h2 className="mb-2 text-lg font-bold text-amber-100">部屋に参加する</h2>
              <label htmlFor="online-room-code" className="mb-3 block text-sm text-stone-400">相手の部屋コード（数字6桁）</label>
              <input id="online-room-code" value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" maxLength={6} placeholder="123456"
                className="mb-4 w-full rounded-xl border border-amber-900 bg-stone-950 px-4 py-3 text-center font-mono text-2xl tracking-widest text-amber-100 outline-none focus:border-amber-400" />
              <button disabled={disabled || code.length !== 6} className="w-full rounded-xl bg-emerald-800 py-3 font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                この部屋に参加
              </button>
            </form>
          </>
        )}

        <button onClick={onBack} className="self-center px-4 py-2 text-sm text-stone-400 hover:text-stone-200">
          {waiting || room.session ? '部屋を退出して戻る' : 'モード選択へ戻る'}
        </button>
      </div>
    </div>
  )
}
