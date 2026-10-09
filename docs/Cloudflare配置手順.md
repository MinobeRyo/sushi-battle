# Cloudflare 配置手順

ゼミサーバー（gms.gdl.jp）の代わりに、Cloudflare Workers の無料枠で公開する。

## 構成

- Worker `sushi-battle` が、画面（`dist`）と対戦サーバー（`/api/room`）を同じオリジンで配信する。
- 対戦サーバーは Durable Object `RoomLobby`（1個）。中身は Node 版と同じ `server/roomService.ts`。
- 通信は Node 版の HTTP 版と同じ短い POST（`src/network/httpRoomTransport.ts`）。PHP の中継は使わない。
- 設定は `wrangler.jsonc`。入口は `worker/index.ts`。

## Cloudflare 側の設定（Workers Builds）

| 項目 | 値 |
|---|---|
| リポジトリ | `MinobeRyo/sushi-battle` |
| プロジェクト名 | `sushi-battle`（`wrangler.jsonc` の `name` と一致させる） |
| ビルドコマンド | `npm run build:cloudflare` |
| デプロイコマンド | `npx wrangler deploy` |
| 本番ブランチ | `main` |

`main` が更新されると自動でデプロイされる。GitHub Secrets や API トークンは不要。

## 手元での確認

```bash
npm run cf:dev
```

`http://127.0.0.1:8787/` を2つのタブで開き、オンライン対戦で部屋を作成・参加する。

## 注意

- デプロイすると Durable Object が再起動し、進行中の部屋は消える（部屋の保存は未実装）。
- 無料枠には1日のリクエスト上限がある。対戦中は1人あたり毎秒1回問い合わせる。
