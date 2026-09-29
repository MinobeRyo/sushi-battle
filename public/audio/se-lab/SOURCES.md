# SE試聴室の音源

01〜18 は CC0-1.0 の公開素材を元にしています。19〜36 のタッチ音・デフォルメした皿音は、このプロジェクト用のオリジナル合成音です。ゲーム中の用途を示す名前は、録音時の器具や動作の特定を意味しません。

## 食器・木・厨房・ベル

- 作者: rubberduck
- 素材: [100 CC0 SFX](https://opengameart.org/node/85570)
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 原音: dishes_01/02/04、glass_01、bell_01/02、wooden_03、pot_01
- 作者の説明では Android device で収録した音です。特定の寿司屋や湯のみの録音ではありません。

## カード・紙

- 作者: Kenney
- 素材: [Casino Audio](https://kenney.nl/assets/casino-audio)
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 原音: card-slide-1/4、card-fan-1、cards-pack-open-2、card-place-1/4、card-shove-1、card-shuffle

## 加工

録音素材を 44.1kHz / 16bit / mono WAV に変換。前後の無音調整、55Hz以下と14.5kHz以上の帯域整理、音量調整、1msのフェードインと25msのフェードアウトを適用しています。シャッフルは先頭の有音区間から1.35秒に短縮しています。湯注ぎは3.25〜4.70秒付近を抽出し、40msでフェードイン。グラスと木の卓は0.185〜0.72秒付近を抽出しています。

各WAVと元ファイルの対応・切り出し位置・ゲインは `sources.json` に記録しています。`src/features/sound-lab/presets.ts` の波形は、生成した音声の実振幅から求めています。

再生成には ffmpeg と Python 3 が必要です。原音ZIPを次のディレクトリに展開して、プロジェクトルートで `python3 scripts/build-se-foley.py` を実行します。

- `.cache/restaurant-foley/selected/`: 上記の食器・ベル等の OGG
- `.cache/se-foley/casino/Audio/`: Kenney Casino Audio の Audio ディレクトリ
- `.cache/restaurant-foley/recordings/`: 下記 BigSoundBank の MP3 を `hot_water_mug_3312.mp3` と `glass_wooden_table_1204.mp3` の名前で保存

通常の開発・ビルドは同梱のWAVを使うため、ffmpegや再ダウンロードは不要です。

## 注文タブレットの比較候補（19〜24）

`tablet-*.wav` の6音は、このプロジェクト用に新規合成したオリジナルの電子音です。外部の録音素材を使用しておらず、CC0の実録素材ではありません。いずれも試聴用の候補で、ゲームへの採用は未決定です。

`scripts/build-se-foley.py` の `tablet_candidates()` で再生成します。44.1kHz / 16bit / mono WAV にそろえ、立ち上がりと終わりを滑らかにフェードしています。平均的な音量を表す RMS 振幅は約0.308、原音ピーク振幅は0.54以下を目安にそろえています。

| 番号 | ファイル | 音の構成 | 長さ |
| --- | --- | --- | --- |
| 19 | `tablet-touch.wav` | 1220Hzの正弦波と薄い三角波の倍音 | 約76ms |
| 20 | `tablet-pop.wav` | 丸い860Hzの正弦波 | 約88ms |
| 21 | `tablet-double.wav` | 1160Hzと1322.4Hzの2音 | 約148ms |
| 22 | `tablet-crisp.wav` | 1400Hzと控えめな奇数倍音 | 約64ms |
| 23 | `tablet-glass.wav` | 1580Hzと減衰する微小な高音 | 約96ms |
| 24 | `tablet-low.wav` | 640Hzと控えめな第3倍音 | 約84ms |

## 丸いタッチ音とデフォルメした皿音（25〜36）

`pop-*.wav` と下表の `dish-*.wav` は、このプロジェクト用に合成したオリジナル音です。外部の録音素材は使用していません。現実の食器を録音したものではなく、丸い破裂音やおもちゃの着地を思わせる音として制作しています。25「小さなぽっ」をタブレット操作、31「皿のぽこん」をレーンの皿の購入・特急皿の受け取りに採用しています。音量はいずれも45%です。カードを場に出す音は15「カードを場に出す」を20%で使用します。採用設定は `src/audio/gameSounds.ts` で管理します。

`scripts/build-se-foley.py` の `playful_candidates()` で再生成します。一定の音程を保持する電子的な確認音を避け、数ms〜数十msのピッチ降下、指数的に減衰する短い共鳴、帯域を絞ったノイズを組み合わせています。ノイズの乱数種は固定しており、同じ波形を再生成できます。各音の先頭・末尾はゼロにし、長い余韻や過大な低音を抑えています。

44.1kHz / 16bit / mono WAV。RMS 振幅は約0.10〜0.135、原音ピーク振幅は0.60以下です。プレビューの標準音量45%ではピーク約0.27以下になります。長さ・波形・合成方法は `presets.ts` と `sources.json` に記録しています。

| 番号 | ファイル | 音の構成 | 長さ |
| --- | --- | --- | --- |
| 25 | `pop-soft.wav` | 小さく丸い「ぽっ」、急なピッチ降下 | 約85ms |
| 26 | `pop-round.wav` | 少し低くふくらみのある「ぽん」 | 約120ms |
| 27 | `pop-dry.wav` | 余韻の少ない乾いた「ぷっ」 | 約68ms |
| 28 | `pop-bubble.wav` | 泡がつぶれるように音程が落ちる「ぽこっ」 | 約135ms |
| 29 | `pop-puff.wav` | 息のようなノイズを含む「ぷふっ」 | 約80ms |
| 30 | `pop-tiny.wav` | 小粒で少し明るい「ぽちっ」 | 約80ms |
| 31 | `dish-pokon.wav` | おもちゃの皿が丸く着地する「ぽこん」 | 約160ms |
| 32 | `dish-koton.wav` | 短い共鳴で木質感を付けた「ことん」 | 約100ms |
| 33 | `dish-pon.wav` | 低中域を中心に控えめな「とん」 | 約140ms |
| 34 | `dish-tokon.wav` | 小さな二打目で揺れを付けた「とこん」 | 約155ms |
| 35 | `dish-potan.wav` | 柔らかい接触ノイズを含む「ぽたん」 | 約175ms |
| 36 | `dish-comic.wav` | 大きく音程が落ちて弾む「ぽこんっ」 | 約195ms |

## お湯・グラスと木の卓

- 作者: Joseph SARDIN / BigSoundBank
- [Hot Water in Mug #2](https://bigsoundbank.com/eau-chaude-dans-mug-2-s3312.html): 90℃のお湯をマグへ注ぐ録音。お茶や湯のみの録音とは表示していません。
- [Glass, Placed on Table](https://bigsoundbank.com/verre-pose-sur-table-s1204.html): 木のテーブルでグラスを置く・持ち上げる録音。
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
