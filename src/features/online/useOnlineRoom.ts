import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoomTransport } from '../../network/roomTransport'
import type { RoomTransport } from '../../network/roomTransportTypes'
import type {
  DraftCommand, JoinReply, OnlineAction, OnlineDraftAction, Reply, RoomSession, RoomSnapshot,
} from '../../network/protocol'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'
const SESSION_KEY = 'sushi-battle:online-session'

const ERROR_MESSAGES: Record<string, string> = {
  stale_draft: '注文時間が切り替わりました。最新の状態を取得します。',
  draft_not_started: '購入受付が終了しました。最新の状態を取得します。',
  draft_offer_expired: 'このお皿は流れていきました。別のお皿を選んでください。',
  draft_completed: '購入は完了しています。相手の完了をお待ちください。',
  draft_expired: '注文時間が終了しました。購入済みのカードで進みます。',
  draft_duplicate: 'このお皿は購入済みです。',
  draft_full: 'デッキは20枚までです。',
  draft_budget: '残金が足りません。',
  draft_delivery_pending: '特急のお皿を受け取ってから次を注文してください。',
  draft_orders_used: '特急の注文は3回までです。',
  draft_no_delivery: '受け取れる特急のお皿はありません。',
  draft_side_menu_disabled: 'サイドメニューは最初の購入時だけ注文できます。',
  draft_side_menu_owned: 'サイドメニューは1試合に1品までです。',
  draft_invalid_side_menu: 'このサイドメニューは注文できません。',
  already_in_room: 'すでに部屋に参加しています。現在の部屋を退出してからお試しください。',
  invalid_code: '部屋コードを半角数字6桁で入力してください。',
  room_not_found: 'この部屋は見つかりません。コードをご確認いただくか、新しい部屋を作成してください。',
  room_full: 'この部屋は満員です。別の部屋コードでお試しください。',
  invalid_token: '前の参加情報では復帰できません。部屋を作成するか、改めて参加してください。',
  not_in_room: '部屋への参加情報を確認できませんでした。',
  invalid_action: 'この操作は受け付けられませんでした。最新の状態をご確認ください。',
  action_id_conflict: '操作の確認に失敗しました。最新の状態を取得します。',
  players_disconnected: '相手の接続が切れています。復帰するまでお待ちください。',
  match_not_started: '相手の参加をお待ちください。',
  match_not_over: '対戦が終了してから再戦を希望できます。',
  stale_match: '対戦が更新されています。最新の状態を取得します。',
  stale_revision: '対戦の状態が更新されています。最新の状態を取得します。',
  not_your_turn: '相手のターンです。自分のターンまでお待ちください。',
  card_not_in_hand: 'このカードはすでに手札にありません。',
  insufficient_ap: '召喚に必要なAPが足りません。',
  field_full: '机が満杯です。',
  side_menu_missing: 'サイドメニューを購入していません。',
  side_menu_spent: 'このサイドメニューは使用済み、または効果が終了しています。',
  side_menu_already_active: 'このサイドメニューの効果は発動中です。',
  side_menu_used_this_turn: 'このターンはすでにラーメンを使用しています。',
  side_menu_ap_full: 'APは満タンです。寿司を出してから使用してください。',
  game_over: 'この対戦は終了しています。',
  left: '参加者が退出したため、部屋を終了しました。',
  expired: '接続のない状態が続いたため、部屋が終了しました。',
  replaced: '別の画面でこの対戦に復帰したため、この画面の接続を終了しました。',
}

function errorMessage(code: string) {
  return ERROR_MESSAGES[code] ?? 'サーバーで処理を完了できませんでした。しばらくしてからお試しください。'
}

function actionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // LAN内のHTTP試遊でも、同じ形式のIDを暗号学的乱数から作る。
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readSession(): RoomSession | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return null
    const value = saved as Partial<RoomSession>
    return typeof value.code === 'string' && /^\d{6}$/.test(value.code)
      && (value.playerId === 1 || value.playerId === 2)
      && typeof value.token === 'string' && value.token.length > 0
      ? value as RoomSession : null
  } catch {
    return null
  }
}

export function useOnlineRoom() {
  const [session, setSession] = useState<RoomSession | null>(readSession)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const transportRef = useRef<RoomTransport | null>(null)
  const sessionRef = useRef(session)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const pendingRef = useRef(false)
  const operationRef = useRef(0)
  const clockRef = useRef({ server: Date.now(), received: performance.now() })
  const serverNow = useCallback(() => clockRef.current.server + performance.now() - clockRef.current.received, [])

  const invalidateRequests = useCallback(() => {
    operationRef.current += 1
    pendingRef.current = false
  }, [])

  const storeSession = useCallback((next: RoomSession | null) => {
    sessionRef.current = next
    setSession(next)
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
      else sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // 保存が利用できない環境でも、この接続中の対戦は続行する。
    }
  }, [])

  const showSnapshot = useCallback((next: RoomSnapshot | null) => {
    if (next) clockRef.current = { server: next.serverNow, received: performance.now() }
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  const request = useCallback(async <T extends Reply | JoinReply>(
    send: (transport: RoomTransport) => Promise<T>,
    timeoutMessage: string,
    clearError = true,
  ): Promise<T | null> => {
    const transport = transportRef.current
    if (pendingRef.current) return null
    if (!transport?.connected) {
      setError('サーバーとの接続が切れています。接続が回復するまでお待ちください。')
      return null
    }
    const operation = ++operationRef.current
    pendingRef.current = true
    setPending(true)
    if (clearError) setError('')
    try {
      const result = await send(transport)
      if (operation !== operationRef.current) return null
      if (!result.ok) setError(errorMessage(result.error))
      return result
    } catch {
      if (operation === operationRef.current) setError(timeoutMessage)
      return null
    } finally {
      if (operation === operationRef.current) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }, [])

  const acceptJoin = useCallback((result: JoinReply | null) => {
    if (!result?.ok) return
    storeSession(result.session)
    showSnapshot(result.snapshot)
  }, [showSnapshot, storeSession])

  const resumeRoom = useCallback(async (preserveError = false) => {
    const saved = sessionRef.current
    if (!saved || pendingRef.current) return
    const result = await request(
      transport => transport.request('room:resume', { code: saved.code, token: saved.token }),
      '部屋の状態を取得できませんでした。通信が回復すると再接続します。',
      !preserveError,
    )
    if (result?.ok) acceptJoin(result)
    else if (result && sessionRef.current?.token === saved.token) {
      // サーバーが再開を拒否した場合は、存在しない部屋に再接続し続けない。
      storeSession(null)
      showSnapshot(null)
    }
  }, [acceptJoin, request, showSnapshot, storeSession])

  useEffect(() => {
    let active = true
    let keepCloseNotice = false
    const transport = createRoomTransport({
      onConnect: () => {
        if (!active) return
        setStatus('connected')
        if (!keepCloseNotice) setError('')
        keepCloseNotice = false
        void resumeRoom()
      },
      onDisconnect: reason => {
        if (!active) return
        invalidateRequests()
        setPending(false)
        if (reason === 'io server disconnect') {
          // 席の置換などによる明示切断はSocket.IOが自動復帰しない。
          // 古い席を取り戻さず、新しく部屋を作成・参加できる接続へ戻す。
          storeSession(null)
          showSnapshot(null)
          keepCloseNotice = true
          setStatus('connecting')
          setError(current => current || 'サーバーが参加中の接続を終了しました。改めて部屋を作成するか、参加してください。')
          transport.connect()
          return
        }
        setStatus('disconnected')
        setError('接続が切れました。操作を止めて、自動で再接続しています。')
      },
      onConnectError: () => {
        if (!active) return
        setStatus('disconnected')
        const message = 'サーバーに接続できません。起動状況と通信環境をご確認ください。自動で再試行します。'
        setError(current => keepCloseNotice && current ? current : message)
      },
      onSnapshot: next => {
        if (!active) return
        if (sessionRef.current?.code === next.code && sessionRef.current.playerId === next.playerId) showSnapshot(next)
      },
      onClosed: reason => {
        if (!active) return
        invalidateRequests()
        setPending(false)
        storeSession(null)
        showSnapshot(null)
        keepCloseNotice = true
        setError(errorMessage(reason))
      },
      onSessionMissing: () => {
        if (active) void resumeRoom()
      },
    })
    transportRef.current = transport
    transport.connect()
    return () => {
      active = false
      invalidateRequests()
      transportRef.current = null
      transport.disconnect()
    }
  }, [invalidateRequests, resumeRoom, showSnapshot, storeSession])

  const createRoom = useCallback(async () => {
    if (sessionRef.current || pendingRef.current) return
    acceptJoin(await request(
      transport => transport.request('room:create'),
      '部屋作成の応答を確認できませんでした。もう一度お試しください。',
    ))
  }, [acceptJoin, request])

  const joinRoom = useCallback(async (code: string) => {
    if (sessionRef.current || pendingRef.current) return
    const normalized = code.trim()
    if (!/^\d{6}$/.test(normalized)) {
      setError('部屋コードを半角数字6桁で入力してください。')
      return
    }
    acceptJoin(await request(
      transport => transport.request('room:join', { code: normalized }),
      '参加の応答を確認できませんでした。もう一度お試しください。',
    ))
  }, [acceptJoin, request])

  const leaveRoom = useCallback(async () => {
    invalidateRequests()
    setPending(false)
    storeSession(null)
    showSnapshot(null)
    setError('')
    const transport = transportRef.current
    if (transport?.connected) {
      try { await transport.request('room:leave') } catch {
        // 退出後は再参加トークンを破棄し、自動復帰しない。
      }
    }
  }, [invalidateRequests, showSnapshot, storeSession])

  const sendAction = useCallback(async (type: OnlineAction['type'], cardInstanceId?: string) => {
    if (pendingRef.current) return
    const match = snapshotRef.current?.match
    if (!match) {
      setError('対戦の開始をお待ちください。')
      return
    }
    const action: OnlineAction = {
      matchId: match.matchId, actionId: actionId(), expectedRevision: match.revision, type,
      ...(cardInstanceId ? { cardInstanceId } : {}),
    }
    const result = await request(
      transport => transport.request('match:action', action),
      '操作結果を確認できませんでした。最新の対戦状態を取得しています。',
    )
    // 結果不明の操作を新しいIDで再送せず、サーバーの確定状態に合わせる。
    if (!result?.ok && transportRef.current?.connected) await resumeRoom(true)
  }, [request, resumeRoom])

  const playCard = useCallback((instanceId: string) => sendAction('play_card', instanceId), [sendAction])
  const draftAction = useCallback(async (command: DraftCommand) => {
    const draft = snapshotRef.current?.draft
    if (!draft || pendingRef.current) return false
    const action: OnlineDraftAction = {
      ...command, draftId: draft.draftId, actionId: actionId(), expectedRevision: draft.revision,
    }
    const result = await request(
      transport => transport.request('draft:action', action),
      '購入結果を確認できませんでした。最新の残金とデッキを取得しています。',
    )
    if (!result?.ok && transportRef.current?.connected) await resumeRoom(true)
    return result?.ok === true
  }, [request, resumeRoom])
  const endTurn = useCallback(() => sendAction('end_turn'), [sendAction])
  const useSideMenu = useCallback(() => sendAction('use_side_menu'), [sendAction])
  const rematch = useCallback(async () => {
    if (pendingRef.current) return
    const result = await request(
      transport => transport.request('match:rematch'),
      '再戦希望の応答を確認できませんでした。最新の部屋状態を取得しています。',
    )
    if (!result?.ok && transportRef.current?.connected) await resumeRoom(true)
  }, [request, resumeRoom])

  return { snapshot, session, status, error, pending, createRoom, joinRoom, leaveRoom, playCard, endTurn, useSideMenu, rematch, draftAction, serverNow }
}

export type OnlineRoomController = ReturnType<typeof useOnlineRoom>
