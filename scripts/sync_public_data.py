#!/usr/bin/env python3
"""Build public-site JSON from groundwater Drive indexes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path


NUMERIC_FIELDS = {
    "depthMeters",
    "diameterMm",
    "pumpHorsepower",
    "pumpOutletInch",
    "planFlowCms",
    "benefitedAreaHa",
    "registeredFlowCms",
}


def clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    return re.sub(r"\s+", "", text)


def text(value: object) -> str:
    return clean(value).replace("台中市", "臺中市")


def number(value: object):
    if value in (None, ""):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(result):
        return None
    return int(result) if result.is_integer() else result


def roc_date(value: object) -> str:
    raw = clean(value)
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 7:
        return f"{digits[:3]}.{digits[3:5]}.{digits[5:7]}"
    if len(digits) == 6:
        return f"{digits[:2]}.{digits[2:4]}.{digits[4:6]}"
    return raw


def parse_roc_date(value: object) -> date | None:
    label = roc_date(value)
    match = re.fullmatch(r"(\d{2,4})\.(\d{1,2})\.(\d{1,2})", label)
    if not match:
        return None
    year = int(match.group(1))
    if year < 1911:
        year += 1911
    try:
        return date(year, int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def full_address(value: object) -> str:
    value = text(value)
    if not value:
        return ""
    if value.startswith(("臺中市", "苗栗縣")):
        return value
    return f"臺中市{value}"


def public_id(station: str, water_right_no: str) -> str:
    return f"well-{station}-{water_right_no.lower()}"


def source_value(source: dict, *names: str):
    for name in names:
        if name in source:
            return source.get(name)
    return ""


def well_patch(index_record: dict, today: date, warning_days: int) -> dict:
    source = index_record.get("source", {})
    water_right_no = index_record.get("wellKey") or text(source.get("水權狀號"))
    station = text(index_record.get("station") or source.get("站別"))
    start = roc_date(source_value(source, "核准水權年限"))
    end = roc_date(source_value(source, "核准水權年限_2"))
    next_start = roc_date(source_value(source, "下次申請時間"))
    next_end = roc_date(source_value(source, "下次申請時間_2"))
    diameter_m = number(source_value(source, "井徑 (M)", "井徑(M)"))
    end_date = parse_roc_date(source_value(source, "核准水權年限_2"))
    expiration_status = ""
    days_until_expiration = None
    if end_date:
        days_until_expiration = (end_date - today).days
        if days_until_expiration < 0:
            expiration_status = "expired"
        elif days_until_expiration <= warning_days:
            expiration_status = "expiring-soon"
        else:
            expiration_status = "active"
    else:
        expiration_status = "unknown"

    return {
        "id": public_id(station, water_right_no),
        "wellNumber": water_right_no,
        "waterRightNo": water_right_no,
        "name": text(source.get("井別")),
        "station": station,
        "address": full_address(source.get("井址")),
        "purpose": text(source.get("用途")),
        "depthMeters": number(source_value(source, "井深 (M)", "井深(M)")),
        "diameterMm": number(diameter_m * 1000 if diameter_m is not None else None),
        "pumpHorsepower": number(source_value(source, "抽水機馬力數 (HP)", "抽水機馬力數(HP)")),
        "pumpOutletInch": number(source_value(source, "抽水機口徑 (吋)", "抽水機口徑(吋)")),
        "planFlowCms": number(source_value(source, "計畫出水量 (cms)", "計畫出水量(cms)")),
        "benefitedAreaHa": number(source_value(source, "受益面積 (ha)", "受益面積(ha)")),
        "registeredFlowCms": number(source_value(source, "水權登記量 (cms)", "水權登記量(cms)")),
        "irrigationSystem": text(source.get("所屬灌溉系統")),
        "waterRightPeriod": f"{start} 至 {end}" if start or end else "",
        "nextApplicationPeriod": f"{next_start} 至 {next_end}" if next_start or next_end else "",
        "electricityNo": text(source.get("用電電號")),
        "agriculturalPower": text(source.get("有無申請農業用電")),
        "publicNote": text(source.get("備註")),
        "status": "使用中",
        "managementUnit": f"{station}工作站" if station else "",
        "isPublic": True,
        "sync": {
            "sourceRow": index_record.get("sourceRow"),
            "rowHash": index_record.get("rowHash"),
            "photoHash": index_record.get("photoHash"),
            "changeHash": index_record.get("changeHash"),
            "embeddedPhotoCount": len(index_record.get("embeddedPhotos") or []),
            "waterRightExpirationStatus": expiration_status,
            "waterRightEndDate": end_date.isoformat() if end_date else "",
            "daysUntilExpiration": days_until_expiration,
        },
    }


def equivalent(field: str, left, right) -> bool:
    if field in NUMERIC_FIELDS:
        if left in ("", None) and right in ("", None):
            return True
        try:
            return math.isclose(float(left), float(right), rel_tol=0, abs_tol=0.000001)
        except (TypeError, ValueError):
            return False
    return text(left) == text(right)


def merge_wells(existing_wells: list[dict], index_records: list[dict], today: date, warning_days: int):
    existing_by_key = {text(well.get("waterRightNo") or well.get("wellNumber")): well for well in existing_wells}
    index_by_key = {record.get("wellKey"): record for record in index_records}
    merged = []
    changed = []
    added = []
    missing = []
    expired = []
    expiring = []
    photo_refresh = []

    patch_fields = [
        "id",
        "wellNumber",
        "waterRightNo",
        "name",
        "station",
        "address",
        "purpose",
        "depthMeters",
        "diameterMm",
        "pumpHorsepower",
        "pumpOutletInch",
        "planFlowCms",
        "benefitedAreaHa",
        "registeredFlowCms",
        "irrigationSystem",
        "waterRightPeriod",
        "nextApplicationPeriod",
        "electricityNo",
        "agriculturalPower",
        "publicNote",
        "status",
        "managementUnit",
        "isPublic",
        "sync",
    ]

    for key in sorted(index_by_key):
        patch = well_patch(index_by_key[key], today, warning_days)
        before = existing_by_key.get(key, {})
        after = {**before}
        for field in patch_fields:
            value = patch.get(field)
            if value in ("", None) and before.get(field) not in ("", None) and field not in {"sync", "publicNote"}:
                continue
            after[field] = value
        after.setdefault("district", before.get("district", ""))
        after.setdefault("section", before.get("section", ""))
        after.setdefault("latitude", before.get("latitude"))
        after.setdefault("longitude", before.get("longitude"))
        after.setdefault("twd97X", before.get("twd97X", ""))
        after.setdefault("twd97Y", before.get("twd97Y", ""))
        after.setdefault("completionDate", before.get("completionDate", ""))
        after.setdefault("constructionYear", before.get("constructionYear", ""))
        after.setdefault("startedAt", before.get("startedAt", ""))
        after.setdefault("internalNote", before.get("internalNote", "由一覽表索引同步。"))
        after.setdefault("attachments", before.get("attachments", []))
        after.setdefault("photos", before.get("photos", []))
        after.setdefault("auditTrail", before.get("auditTrail", []))
        after.setdefault("createdAt", before.get("createdAt", ""))
        after.setdefault("createdBy", before.get("createdBy", "system"))
        after["updatedAt"] = datetime.now(timezone.utc).isoformat()
        after["updatedBy"] = "groundwater-sync-pipeline"

        if not before:
            added.append(key)
        else:
            field_changes = [
                field for field in patch_fields
                if field != "sync" and not equivalent(field, patch.get(field), before.get(field))
            ]
            if field_changes:
                changed.append({"waterRightNo": key, "fields": field_changes})
            old_hash = ((before.get("sync") or {}).get("photoHash") or (before.get("sourceIndex") or {}).get("photoHash"))
            new_hash = patch["sync"].get("photoHash")
            if new_hash and old_hash and new_hash != old_hash:
                photo_refresh.append(key)

        status = patch["sync"]["waterRightExpirationStatus"]
        if status == "expired":
            expired.append(key)
        elif status == "expiring-soon":
            expiring.append(key)
        merged.append(after)

    for key in sorted(set(existing_by_key) - set(index_by_key)):
        missing.append(key)
        merged.append(existing_by_key[key])

    merged.sort(key=lambda item: (text(item.get("station")), text(item.get("waterRightNo"))))
    return merged, {
        "added": added,
        "changed": changed,
        "missingFromIndex": missing,
        "expired": expired,
        "expiringSoon": expiring,
        "photoRefreshNeeded": photo_refresh,
    }


def build_pumping_history(existing_payload: dict, pumping_index: list[dict]) -> dict:
    if not pumping_index:
        records = existing_payload.get("records")
        if not isinstance(records, list):
            records = []
        years = [record.get("yearMinguo") for record in records if isinstance(record.get("yearMinguo"), int)]
        payload = dict(existing_payload)
        payload["records"] = records
        payload["recordCount"] = len(records)
        payload["monthlyRecordCount"] = sum(
            len(record.get("monthlyM3") or [])
            for record in records
            if isinstance(record, dict)
        )
        if years:
            payload["yearFrom"] = min(years)
            payload["yearTo"] = max(years)
        payload["preservedBecauseIndexEmpty"] = True
        return payload

    records = []
    for item in pumping_index:
        records.append({
            "waterRightNo": item.get("waterRightNo"),
            "wellName": item.get("wellName"),
            "station": item.get("station"),
            "authority": item.get("authority"),
            "yearMinguo": item.get("yearMinguo"),
            "monthlyM3": item.get("monthlyM3") or [],
            "sourceTotalM3": item.get("sourceTotalM3"),
            "anomalies": item.get("anomalies") or [],
        })
    records.sort(key=lambda item: (text(item.get("waterRightNo")), -(item.get("yearMinguo") or 0)))

    years = [record["yearMinguo"] for record in records if isinstance(record.get("yearMinguo"), int)]
    payload = {key: value for key, value in existing_payload.items() if key != "records"}
    payload["recordCount"] = len(records)
    payload["monthlyRecordCount"] = len(records) * 12
    if years:
        payload["yearFrom"] = min(years)
        payload["yearTo"] = max(years)
    payload["records"] = records
    return payload


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_state(path: Path) -> dict:
    if not path.exists():
        return {
            "path": str(path),
            "exists": False,
            "size": 0,
            "modifiedAt": "",
            "sha256": "",
        }
    stat = path.stat()
    return {
        "path": str(path),
        "exists": True,
        "size": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "sha256": file_hash(path),
    }


def read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_summary(path: Path, well_summary: dict, pumping_payload: dict) -> None:
    lines = [
        "# Groundwater Public Sync Summary",
        "",
        f"- Generated at: {datetime.now(timezone.utc).isoformat()}",
        f"- Added wells: {len(well_summary['added'])}",
        f"- Changed wells: {len(well_summary['changed'])}",
        f"- Existing wells missing from index: {len(well_summary['missingFromIndex'])}",
        f"- Expired water rights: {len(well_summary['expired'])}",
        f"- Expiring soon water rights: {len(well_summary['expiringSoon'])}",
        f"- Photo refresh needed: {len(well_summary['photoRefreshNeeded'])}",
        f"- Pumping yearly records: {pumping_payload.get('recordCount', 0)}",
        f"- Pumping monthly records: {pumping_payload.get('monthlyRecordCount', 0)}",
        "",
    ]
    if well_summary["expired"]:
        lines.extend(["## Expired Water Rights", ""])
        lines.extend(f"- {key}" for key in well_summary["expired"])
        lines.append("")
    if well_summary["missingFromIndex"]:
        lines.extend(["## Missing From Well Index", ""])
        lines.extend(f"- {key}" for key in well_summary["missingFromIndex"])
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build public groundwater site data from generated indexes.")
    parser.add_argument("--well-index", required=True, type=Path)
    parser.add_argument("--site-wells", required=True, type=Path)
    parser.add_argument("--pumping-index", required=True, type=Path)
    parser.add_argument("--site-pumping-history", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--today", default=date.today().isoformat())
    parser.add_argument("--expiration-warning-days", type=int, default=90)
    args = parser.parse_args()

    today = date.fromisoformat(args.today)
    well_index = read_json(args.well_index, [])
    site_wells = read_json(args.site_wells, [])
    pumping_index = read_json(args.pumping_index, [])
    site_pumping_history = read_json(args.site_pumping_history, {})

    merged_wells, well_summary = merge_wells(site_wells, well_index, today, args.expiration_warning_days)
    pumping_payload = build_pumping_history(site_pumping_history, pumping_index)

    write_json(args.out_dir / "data" / "wells.json", merged_wells)
    write_json(args.out_dir / "data" / "pumping-history.json", pumping_payload)
    write_json(args.out_dir / "sync-index.json", {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "wellIndex": file_state(args.well_index),
            "siteWells": file_state(args.site_wells),
            "pumpingIndex": file_state(args.pumping_index),
            "sitePumpingHistory": file_state(args.site_pumping_history),
        },
        "outputs": {
            "wells": {
                "recordCount": len(merged_wells),
                "expiredWaterRights": len(well_summary["expired"]),
                "expiringSoonWaterRights": len(well_summary["expiringSoon"]),
            },
            "pumping": {
                "recordCount": pumping_payload.get("recordCount"),
                "monthlyRecordCount": pumping_payload.get("monthlyRecordCount"),
                "yearFrom": pumping_payload.get("yearFrom"),
                "yearTo": pumping_payload.get("yearTo"),
            },
        },
    })
    write_json(args.out_dir / "sync-summary.json", {"wells": well_summary, "pumping": {
        "recordCount": pumping_payload.get("recordCount"),
        "monthlyRecordCount": pumping_payload.get("monthlyRecordCount"),
        "yearFrom": pumping_payload.get("yearFrom"),
        "yearTo": pumping_payload.get("yearTo"),
    }})
    write_summary(args.out_dir / "sync-summary.md", well_summary, pumping_payload)

    print(json.dumps({
        "wells": len(merged_wells),
        "addedWells": len(well_summary["added"]),
        "changedWells": len(well_summary["changed"]),
        "expiredWaterRights": len(well_summary["expired"]),
        "expiringSoonWaterRights": len(well_summary["expiringSoon"]),
        "pumpingRecords": pumping_payload.get("recordCount", 0),
        "out": str(args.out_dir),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
