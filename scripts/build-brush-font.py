"""Subset the official Yuji Boku TTF for the current game text.
Usage: python3 scripts/build-brush-font.py .cache/ui-review/YujiBoku-Regular.ttf
Requires fontTools. The output is licensed under public/fonts/OFL-Yuji.txt.
"""
import argparse
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
text = ''.join(path.read_text() for path in (root / 'src').rglob('*') if path.suffix in {'.ts', '.tsx', '.css'})
# Keep all kana, Latin and Japanese punctuation, plus kanji used in the game.
unicodes = set(map(ord, text)) | set(range(0x20, 0x100)) | set(range(0x3000, 0x3100))
font = TTFont(args.source)
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
# Give the derivative its own family name; retain author/copyright/license records.
names = {1: 'Sushi Brush', 2: 'Regular', 3: 'SushiBrush-Regular-1.0', 4: 'Sushi Brush Regular', 6: 'SushiBrush-Regular', 16: 'Sushi Brush', 17: 'Regular'}
for record in font['name'].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = 'woff'
output = root / 'public/fonts/SushiBrush-Regular.woff'
font.save(output)
print(f'{output.relative_to(root)}: {output.stat().st_size:,} bytes, {len(font.getBestCmap())} glyphs')
