from __future__ import annotations

import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_JSON = ROOT / "data" / "wells.json"
SOURCE_ATTACHMENTS = ROOT / "data" / "attachments"
PUBLIC_DIR = ROOT / "public"
DOCS_DIR = ROOT / "docs"
OUT_DIR = DOCS_DIR / "data"
OUT_ATTACHMENTS = OUT_DIR / "attachments"


def safe_token(value: str, fallback: str) -> str:
    token = "".join(ch for ch in str(value or "") if ch.isalnum())
    return token or fallback


def copy_public_assets() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "app.js", "styles.css"):
        shutil.copy2(PUBLIC_DIR / name, DOCS_DIR / name)
    (DOCS_DIR / ".nojekyll").touch()


def export_data() -> dict:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_ATTACHMENTS.mkdir(parents=True, exist_ok=True)

    wells = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    exported = []
    photo_count = 0
    pdf_count = 0
    missing_files = []

    for well in wells:
        item = json.loads(json.dumps(well, ensure_ascii=False))
        station = safe_token(item.get("station"), "station")
        well_no = safe_token(item.get("wellNumber"), item.get("id", "well"))
        file_base = f"{station}-{well_no}"

        for index, photo in enumerate(item.get("photos") or [], 1):
            source = SOURCE_ATTACHMENTS / photo.get("storedName", "")
            if not source.exists():
                missing_files.append(str(source))
                continue
            target_name = f"{file_base}-photo-{index}{source.suffix.lower() or '.jpg'}"
            shutil.copy2(source, OUT_ATTACHMENTS / target_name)
            photo["storedName"] = target_name
            photo["size"] = (OUT_ATTACHMENTS / target_name).stat().st_size
            photo_count += 1

        for index, file in enumerate(item.get("attachments") or [], 1):
            if "pdf" not in str(file.get("mimeType", "")).lower():
                continue
            source = Path(file.get("storedName", ""))
            if not source.exists():
                missing_files.append(str(source))
                continue
            target_name = f"{file_base}-water-right-{index}.pdf"
            shutil.copy2(source, OUT_ATTACHMENTS / target_name)
            file["storedName"] = target_name
            file["size"] = (OUT_ATTACHMENTS / target_name).stat().st_size
            pdf_count += 1

        exported.append(item)

    (OUT_DIR / "wells.json").write_text(json.dumps(exported, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "wells": len(exported),
        "photos": photo_count,
        "pdfs": pdf_count,
        "files": len(list(OUT_ATTACHMENTS.iterdir())),
        "missing_files": missing_files,
    }


def main() -> None:
    copy_public_assets()
    summary = export_data()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if summary["missing_files"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
