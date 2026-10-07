# ゼミサーバーへの自動転送・再起動

GitHubのmain更新をきっかけに、テスト、公開用ビルド、ゼミの自分のフォルダへの転送、対戦プログラムの再起動を実行します。公開画面は同梱の`api.php`から対戦プログラムへ通信します。OSやWebサーバーの全体設定は変更しません。

**2026-09-26に初回設定・自動配布・公開画面での対戦確認を完了し、`GMS_AUTO_DEPLOY=true`を有効化しました。** 通常の更新はmainへのpushで開始します。以下の初回手順は、設定を作り直す場合の参照用です。

全体の順番と役割分担は[初回設定のフロー](自動デプロイの実行フロー.md)を参照してください。現在手動で起動しているゲームは、接続確認が成功して切り替える段階まで止めません。すでに停止している場合は、そのまま接続確認と初回の自動起動へ進めます。

## PRからマージ・配布まで

このリポジトリ内のブランチからmainへ通常のPRを作成すると、テスト・ビルド成功後に`Merge verified pull requests`がマージします。作業途中で取り込ませたくないPRはDraftで作成し、準備ができたらReady for reviewへ切り替えます。

- 外部フォークのPR、Draft、失敗・中断したチェック、チェック後にコミットが追加されたPRは自動マージしません。
- GitHubに設定された必須レビューやブランチ保護はそのまま適用します。条件未達や競合で取り込めない場合はSummaryに理由を記録します。必要な対応後にチェックを再実行できます。
- マージ処理はmain上のコードだけを実行し、PRのコードや生成物を実行しません。PRのテストには従来どおり書き込み権限やSSH秘密鍵を渡しません。
- マージ時には検証済みコミットのSHAを指定し、検証後の差し替えを防ぎます。
- `GMS_AUTO_DEPLOY=true`なら、マージ直後にmainでテスト・ビルド・配布を再実行します。`false`ならマージまでで止まります。

GitHubの標準トークンでマージしても`push`ワークフローは起動しないため、配布を`workflow_dispatch`で明示的に呼び出します。呼び出しに失敗した場合はマージ処理を再実行できます。すでに新しいmainがある場合、古いPRから配布を再開しません。

自動マージを止める場合はActionsの`Merge verified pull requests`を無効化します。GitHubのリポジトリ設定にある「Allow auto-merge」や個人用アクセストークンは不要です。初回だけ、このワークフローを含むPRをチェック成功後に取り込むと有効になります。

参考: [別ワークフロー完了時の実行](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)、[トークンで発生させたイベントとワークフローの起動](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[マージAPIのSHA条件](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)。

## 最初に本人が行う設定

この手順は初回だけです。既存の個人用SSH秘密鍵は使わず、自動化専用の鍵を作ります。この鍵にはryom13としてファイルやコマンドを操作できる権限があるため、秘密鍵を登録する先はこのリポジトリのActions Secretsに限ってください。

### 1. Macで専用の鍵を作る

2026-09-25の今回の設定作業では、下記の場所に専用鍵を作成済みです。**今回は手順2から進めてください。** 以下は別のMacなどで新しく用意する場合のコマンドです。

ゼミへログイン中の端末ではなく、Mac側のターミナルで実行します。

```bash
mkdir -p '/Users/ryom/sushi battle/.cache/gms-actions-key'
ssh-keygen -t ed25519 -f '/Users/ryom/sushi battle/.cache/gms-actions-key/id_ed25519' -N '' -C 'sushi-battle-github-actions'
```

上書きを聞かれたら、既に作成済みの鍵があるため上書きせず、その鍵を使って続けてください。`.cache`はGitの管理対象外です。秘密鍵をチャットやリポジトリへ貼り付ける必要はありません。

### 2. 公開鍵だけをゼミのアカウントに登録する

Mac側で、末尾`.pub`の**公開鍵**をクリップボードへコピーします。

```bash
pbcopy < '/Users/ryom/sushi battle/.cache/gms-actions-key/id_ed25519.pub'
```

ゲームが動いているターミナルはそのままにし、**別のターミナル**で`ssh ryom13@gms.gdl.jp`を実行してログインします。その新しい端末で、次の`ssh-ed25519 ...`部分をコピーした公開鍵1行に置き換えて実行します。既存の登録内容は残したまま追記します。

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf 'restrict %s\n' 'ssh-ed25519 ここに公開鍵の残りを貼る' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

`restrict`で端末割り当てやポート転送等を禁止しますが、操作できるファイルやコマンドをこのゲームだけに限定する指定ではありません。

### 3. GitHubに2つのSecretを登録する

[このリポジトリのActions Secrets](https://github.com/MinobeRyo/sushi-battle/settings/secrets/actions)で、`New repository secret`から次の2つを登録します。登録先はリポジトリの「Deploy keys」ではありません。

| 名前 | 内容 |
| --- | --- |
| `GMS_SSH_KEY` | 手順1で作った専用の秘密鍵全文 |
| `GMS_KNOWN_HOSTS` | 接続済みのgmsについてMacが保存しているホスト公開鍵 |

秘密鍵はMac側でコピーし、GitHubの`GMS_SSH_KEY`の入力欄へ直接貼り付けます。

```bash
pbcopy < '/Users/ryom/sushi battle/.cache/gms-actions-key/id_ed25519'
```

ホスト公開鍵は、既にログインできたMac側で次のコマンドを実行し、`GMS_KNOWN_HOSTS`へ貼り付けます。

```bash
ssh-keygen -F gms.gdl.jp -f ~/.ssh/known_hosts | sed '/^#/d' | pbcopy
```

何もコピーされなければ、管理者が確認したホスト公開鍵が必要です。接続エラーを消すためにホスト確認を無効化したり、未確認の`ssh-keyscan`結果をそのまま登録したりしません。

### 4. 接続と配置の準備を確認する

この変更がGitHubのmainに反映された後、[Actions](https://github.com/MinobeRyo/sushi-battle/actions) → `Build and deploy to GMS` → `Run workflow`を開きます。ブランチは`main`、`operation`は初期値の **`check`** で実行してください。GitHubにまだファイルが反映されていない場合、ワークフローは表示されません。

テスト・ビルドの後、GitHubからのSSH接続、Node.jsとnpm、配置先の書き込み権限を必須項目として確認します。ゼミへのファイル転送やプログラムの停止・再起動はしません。**ここではCtrl+Cを押しません。**

現在の対戦プログラムと公開`api.php`への接続は、別に診断結果を表示します。対戦プログラムが停止していると503になりますが、これだけではSSHの接続確認を失敗にはしません。Summaryで「配置の準備」と「ゲームが現在動いているか」を分けて確認してください。意図して停止中なら、そのまま初回の`deploy`へ進めます。`deploy`では新版の起動と応答を必ず確認します。

GitHubからゼミへのSSHがネットワーク制限で拒否される場合もあります。その場合はゲームを起動したまま、失敗した項目を確認します。この確認が成功するまでは次へ進みません。

### 5. 初回だけ手動起動から切り替える

`check`の成功後、対戦中の人がいない時間に行います。

1. 手動の`npm run server`が動いている場合だけ、そのターミナルで **Ctrl+C** を押します。すでに停止している場合、この操作は不要です。
2. 同じ`Run workflow`から、`main`、`operation`を **`deploy`** にして実行します。
3. テスト・ビルド、転送、PM2による起動が完了するまで待ちます。この初回切り替えでは、ビルドを含む数分程度の停止時間が発生する見込みです。
4. Summaryで公開`api.php`への接続成功を確認し、2つのブラウザで部屋への参加・召喚・ターン終了を確認します。
5. ゼミへのSSHからログアウトし、もう一度ゲームで新しい部屋を作れるか確認します。実際のゼミ環境でログアウト後も動作することをここで確かめます。

PM2は対戦プログラムをターミナルとは別に動かす管理ツールです。次回以降はActionsが更新と起動・再起動をまとめて行うため、手動の`npm run server`は不要になります。管理外のプログラムが3001番ポートを使っている場合、自動化は勝手に止めず、エラーを表示して終了します。

初回に失敗した場合は、Actionsのエラーと[通信確認ページ](https://gms.gdl.jp/~ryom13/sushi-battle/api.php)を確認します。旧サーバーの`/home/h0/ryom13/sushi-battle-server`はこの自動化では変更しません。対戦プログラムが停止しており、3001番ポートに別のプログラムがいないことを確認できた場合、次のコマンドで以前の手動起動へ戻せます。

```bash
cd /home/h0/ryom13/sushi-battle-server
HOST=127.0.0.1 PORT=3001 SUSHI_ALLOWED_ORIGINS=https://gms.gdl.jp npm run server
```

### 6. 以後の自動実行を有効にする

初回が成功したら、Settings → Secrets and variables → Actions → Variablesで、リポジトリ変数 `GMS_AUTO_DEPLOY` を値 `true` で登録します。それ以後mainへのpushで転送・再起動します。値を`false`にすると自動転送を止め、手動実行だけに戻せます。

Pull requestではテスト・ビルドだけを行い、SSH秘密鍵は渡しません。古いビルドが遅れて終わっても最新mainを上書きしないよう、配布前にmainのSHAを確認します。

## 自動化が変更する場所

- `/home/h0/ryom13/public_html/sushi-battle`: 公開画面。新しい実ディレクトリへ切り替えます。
- 同じ`public_html`内の`.sushi-battle-previous-*`: 切り替え前の公開画面のバックアップ。
- `/home/h0/ryom13/.sushi-battle-deploy`: アーカイブ、配布履歴、PM2の専用管理情報。以前の配布物は失敗時の復旧に使います。
- 3001番ポート: 対戦プログラム。127.0.0.1だけで待ち受けます。

PM2はこのアプリの依存として導入し、専用の管理ディレクトリを使います。他のアプリのPM2プロセスは操作しません。ログアウト後も動かす仕組みですが、**サーバー自体の再起動後に自動起動するOS設定は行いません**。その場合はActionsで`operation: deploy`を手動実行して再起動します。配布履歴やログは自動削除しないため、運用が続く場合は容量を確認して保管方針を決めます。

再起動するとメモリ上の部屋・進行中の対戦は失われます。遊んでいる人がいないタイミングで更新してください。

## PHPで公開URLと対戦サーバーをつなぐ

2026-09-25、公開した診断ページで`php_executed`、`curl_available`、`upstream_ok`がすべてtrueであることを確認しました。PHPを公開用の窓口にし、同じサーバー内のNode.jsへ短いHTTP要求を中継します。

`node scripts/package-gms.mjs`がPHP通信を選択した画面と`api.php`をまとめて作成します。Actionsも同じスクリプトを使うため、以後の転送でPHPが配布物から抜けることはありません。通常のSocket.IO接続はローカル開発用に残しています。

`api.php`は転送先を`127.0.0.1:3001`の所定のパスに限定します。任意のURLやコマンドは受け付けず、POST元、本文サイズ、待機時間を制限します。ブラウザは対戦中おおむね1秒おきに状態を確認し、要求を重ねません。PHPは次の操作が来るまで接続を待ち続けることはありません。

手動アップロードの具体的な配置先は[PHP経由の配置手順](PHP経由の配置手順.md)を参照してください。多人数での負荷は別途測定が必要です。診断専用の`check-route.php`は自動配布には含めません。

参考: [GitHubのSecrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[Actionsの手動実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[PM2のOS起動設定](https://pm2.keymetrics.io/docs/usage/startup/)、[Socket.IOのHTTP通信](https://socket.io/docs/v4/engine-io-protocol/)、[PHP-FPMの同時処理数](https://www.php.net/manual/en/install.fpm.configuration.php)
