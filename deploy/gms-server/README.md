# ゼミサーバー用の依存ファイル

対戦サーバーの実行に必要な Socket.IO、tsx と、自動デプロイで常駐・再起動を行う PM2 を管理します。画面用の React、Three.js、Vite は公開用JavaScriptにビルド済みなので、サーバーへのインストールは不要です。PM2が使うjs-yamlは修正版4.3.2に限定しています。

プロジェクト直下で `node scripts/package-server.mjs` を実行すると、`release/gms/sushi-battle-server` にソースとこのディレクトリの依存ファイルをコピーします。ソースはルート側、配布用の依存はこのディレクトリ側で管理します。

旧配布物の `npm ci` が `@emnapi/core` / `@emnapi/runtime` の不足で失敗する場合は、生成後の `package.json` と `package-lock.json` の2つを `/home/h0/ryom13/sushi-battle-server` に上書きし、`npm ci --omit=dev` を実行してください。既存のソースをアップロード済みなら、この修正のために画面やソースを再アップロードする必要はありません。

起動手順は `起動方法.txt` を参照してください。起動確認と公開URLへの中継設定は別の確認項目です。

GitHub Actionsによる自動転送・再起動は `docs/GitHub Actions自動デプロイ.md` を参照してください。PM2は専用の管理ディレクトリを使い、他アプリのプロセスには触れません。OS再起動時の自動起動設定は含めていません。

2026-09-25の修正時は、macOS上の空の検証フォルダで Node.js 20.20.2 / npm 10.8.2 による `npm ci --omit=dev --engine-strict` を確認しました。依存が検証フォルダ内から解決されること、`/health`、Socket.IO polling接続、既存の通信テスト16件が通ることも確認済みです。lockにはLinux x64 / arm64用のesbuildを含みますが、ゼミのLinuxサーバーでの再実行は別途確認が必要です。
