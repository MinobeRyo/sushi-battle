# ゼミサーバーへの自動転送・再起動

GitHubのmain更新をきっかけに、テスト、公開用ビルド、ゼミの自分のフォルダへの転送、対戦プログラムの再起動を実行します。OSやWebサーバーの全体設定は変更しません。管理者の設定が必要な公開通信経路とは別の作業です。

## 最初に本人が行う設定

この手順は初回だけです。既存の個人用SSH秘密鍵は使わず、自動化専用の鍵を作ります。この鍵にはryom13としてファイルやコマンドを操作できる権限があるため、秘密鍵を登録する先はこのリポジトリのActions Secretsに限ってください。

### 1. Macで専用の鍵を作る

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

ゼミへログインしたターミナルで、次の`ssh-ed25519 ...`部分をコピーした公開鍵1行に置き換えて実行します。既存の登録内容は残したまま追記します。

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

### 4. 初回を手動実行する

この変更がGitHubのmainに反映された後、ゼミで手動起動している`npm run server`のターミナルで **Ctrl+C** を押します。初回の自動化がそのプログラムをPM2管理に切り替えます。管理外のプログラムが3001番ポートを使っている場合、自動化は勝手に止めず、エラーを表示して終了します。

[Actions](https://github.com/MinobeRyo/sushi-battle/actions) → `Build and deploy to GMS` → `Run workflow` → `main`で実行します。転送と起動が成功しても、公開通信先が404ならオンライン対戦は未接続です。実行結果のSummaryにも別項目で表示します。

GitHubからゼミへのSSHがネットワーク制限で拒否される場合もあります。その場合は自動化を有効にせず、結果の接続エラーを確認してください。

### 5. 以後の自動実行を有効にする

初回が成功したら、Settings → Secrets and variables → Actions → Variablesで、リポジトリ変数 `GMS_AUTO_DEPLOY` を値 `true` で登録します。それ以後mainへのpushで転送・再起動します。値を`false`にすると自動転送を止め、手動実行だけに戻せます。

Pull requestではテスト・ビルドだけを行い、SSH秘密鍵は渡しません。古いビルドが遅れて終わっても最新mainを上書きしないよう、配布前にmainのSHAを確認します。

## 自動化が変更する場所

- `/home/h0/ryom13/public_html/sushi-battle`: 公開画面。新しい実ディレクトリへ切り替えます。
- 同じ`public_html`内の`.sushi-battle-previous-*`: 切り替え前の公開画面のバックアップ。
- `/home/h0/ryom13/.sushi-battle-deploy`: アーカイブ、配布履歴、PM2の専用管理情報。以前の配布物は失敗時の復旧に使います。
- 3001番ポート: 対戦プログラム。127.0.0.1だけで待ち受けます。

PM2はこのアプリの依存として導入し、専用の管理ディレクトリを使います。他のアプリのPM2プロセスは操作しません。ログアウト後も動かす仕組みですが、**サーバー自体の再起動後に自動起動するOS設定は行いません**。その場合はActionsを手動実行して再起動します。配布履歴やログは自動削除しないため、運用が続く場合は容量を確認して保管方針を決めます。

再起動するとメモリ上の部屋・進行中の対戦は失われます。遊んでいる人がいないタイミングで更新してください。

## 中継設定を変更できない場合

ゼミサーバー経由の対戦が不可能と決まったわけではありません。PHPが動き、PHPから同じサーバー内のNode.jsへ通信できれば、PHPを公開用の窓口にできます。

最初は`deploy/gms/check-route.php`だけを`public_html/sushi-battle/check-route.php`へ置き、公開URLを開いて確認します。対戦プログラムは3001番で起動したままにします。この診断は固定の`/health`へ最大2秒のGETを1回行い、実行可否だけを返します。任意URLの中継やコマンド実行、設定・秘密情報の表示は行いません。

`php_executed`、`curl_available`、`upstream_ok`がすべてtrueなら、PHPからNode.jsへ届くことが確認できます。失敗しても直ちに全方式が不可能と判断せず、PHP拡張、Web実行環境からの接続制限、Node.jsの稼働状況を切り分けます。この診断ファイルは自動配布には含めません。

候補は、PHP経由で短いHTTP APIを呼び、ブラウザから一定間隔で状態を確認する方式です。既存ゲームルールを流用できますが、通信層の実装追加が必要です。Socket.IOのlong pollingをそのままPHP中継する方が変更は少ないものの、待機中にPHPの同時処理枠を占有するため、共用環境での利用人数に制約があります。

参考: [GitHubのSecrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[Socket.IOのHTTP通信](https://socket.io/docs/v4/engine-io-protocol/)、[PHP-FPMの同時処理数](https://www.php.net/manual/en/install.fpm.configuration.php)
