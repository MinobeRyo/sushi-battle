# Sushi Brush

`SushiBrush-Regular.woff` is a renamed subset of **Yuji Boku Regular**, by the Yuji Project Authors / Kinuta Font Factory.

- Upstream: https://github.com/Kinutafontfactory/Yuji
- Official Google Fonts binary used: https://fonts.gstatic.com/s/yujiboku/v8/P5sAzZybeNzXsA9xj1FkjQ.ttf
- License: SIL Open Font License 1.1, included in `OFL-Yuji.txt`.
- Changes: the family is renamed to Sushi Brush, unused glyphs are removed, and the file is compressed as WOFF. Letter shapes are unchanged.

All Japanese characters currently used in `src`, plus kana, Latin and Japanese punctuation, are included. After adding new text to a brush-styled heading, run:

```sh
python3 scripts/build-brush-font.py path/to/YujiBoku-Regular.ttf
```

The script requires Python fontTools. Normal app builds need no Python or external font service.
