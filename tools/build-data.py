import json, sys, re
src = sys.argv[1]; out = sys.argv[2]
BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
VERS = {"KJV":"en_kjv","WEB":"en_web","ASV":"en_asv","BBE":"en_bbe","YLT":"en_ylt98","Darby":"en_darby"}
def clean(t):
    t = re.sub(r'\{[^}]*\}', '', t)       # strip {notes}
    t = re.sub(r'\\[a-z0-9*+]+\s?', '', t) # strip usfm-ish
    t = re.sub(r'\s*"\s\([^)]*\)\.', '', t)   # stray WEB footnote fragment: God " (Elohim).
    t = t.replace('[', '').replace(']', '')       # supplied-word / selah brackets (YLT, ASV, BBE)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s+([,.;:!?])', r'\1', t)
    t = re.sub(r"(\w)\s+([\u2019'])(s|t|d|ll|re|ve|m)\b", r'\1\2\3', t)   # God 's -> God's
    t = re.sub(r"(\w)([\u2019'])\s+(t|s|d|ll|re|ve|m)\b", r'\1\2\3', t)   # doesn' t -> doesn't
    return t
data = {"books": BOOKS, "versions": {}}
for name, f in VERS.items():
    d = json.load(open(f"{src}/{f}.json", encoding='utf-8-sig'))
    assert len(d) == 66, (name, len(d))
    data["versions"][name] = [[[clean(v) for v in ch] for ch in b["chapters"]] for b in d]
    n = sum(len(ch) for b in data["versions"][name] for ch in b)
    print(name, "verses:", n)
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(',',':'))
