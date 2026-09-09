from pathlib import Path
from pypdf import PdfReader
source = Path(r"G:\共有ドライブ\バックオフィス共有ドライブ\デザイン素材\ファミーユ素材")
out = Path(r"C:\Users\USER\famille_shift_matching\tmp\pdfs\key-knowledge-review")
out.mkdir(parents=True, exist_ok=True)
for name in ["FBP広告①_202607.pdf", "FBP広告②_202607.pdf", "FBP広告③_202608.pdf", "FBP広告④_202608.pdf", "ヘルパーサービス４.0 全体像.pdf"]:
    reader = PdfReader(source / name)
    text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    (out / f"{Path(name).stem}.txt").write_text(text, encoding="utf-8")
    print(f"--- {name} ({len(reader.pages)} page) ---")
    print(text[:10000])
