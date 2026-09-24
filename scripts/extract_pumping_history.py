import json
import re
import sys
from calendar import monthrange
from pathlib import Path
from urllib.parse import unquote



AUTHORITY_BY_PREFIX = {
    "B": "臺中市政府",
    "K": "苗栗縣政府",
}
EXPECTED_EMPTY_WATER_RIGHTS = {
    "B1150050",
    "B1150051",
    "B1150052",
    "B1150103",
    "K0124336",
}


def parse_number(value):
    text = (value or "").replace(",", "").strip()
    if not text:
        return None
    return float(text) if "." in text else int(text)


def detect_anomalies(record, well):
    monthly = record["monthlyM3"]
    positives = sorted(
        ((value, month_index + 1) for month_index, value in enumerate(monthly) if value and value > 0),
        reverse=True,
    )
    anomaly_reasons = {}
    if len(positives) >= 4 and positives[1][0] > 0:
        largest_value, largest_month = positives[0]
        if largest_value / positives[1][0] >= 10:
            anomaly_reasons.setdefault(largest_month, []).append(
                "單月值明顯高於同年度其他月份"
            )

    registered_flow = float(well.get("registeredFlowCms") or 0)
    if registered_flow > 0:
        western_year = record["yearMinguo"] + 1911
        for month_index, value in enumerate(monthly):
            if value is None or value <= 0:
                continue
            days = monthrange(western_year, month_index + 1)[1]
            theoretical_max = registered_flow * 86400 * days
            if value > theoretical_max * 2:
                anomaly_reasons.setdefault(month_index + 1, []).append(
                    "超過依目前登記流量換算的理論月上限"
                )

    return [
        {"month": month, "reasons": reasons}
        for month, reasons in sorted(anomaly_reasons.items())
    ]


def main():
    import pdfplumber
    if len(sys.argv) != 4:
        raise SystemExit(
            "Usage: extract_pumping_history.py SOURCE.pdf docs/data/wells.json OUTPUT.json"
        )

    source_pdf = Path(sys.argv[1])
    wells_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    wells = json.loads(wells_path.read_text(encoding="utf-8-sig"))
    well_lookup = {str(well.get("waterRightNo") or "").strip(): well for well in wells}

    records = []
    with pdfplumber.open(source_pdf) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    if not row or len(row) < 15:
                        continue
                    water_right_no = (row[0] or "").strip()
                    year_text = (row[1] or "").strip()
                    if not re.fullmatch(r"[BK]\d{7}", water_right_no):
                        continue
                    if not re.fullmatch(r"\d{3}", year_text):
                        continue

                    well = well_lookup.get(water_right_no)
                    if not well:
                        continue
                    monthly = [parse_number(value) for value in row[2:14]]
                    records.append(
                        {
                            "waterRightNo": water_right_no,
                            "wellName": well.get("name") or "",
                            "station": well.get("station") or "",
                            "authority": AUTHORITY_BY_PREFIX[water_right_no[0]],
                            "yearMinguo": int(year_text),
                            "monthlyM3": monthly,
                            "sourceTotalM3": parse_number(row[14]),
                        }
                    )

    records.sort(key=lambda item: (item["waterRightNo"], -item["yearMinguo"]))
    for record in records:
        record["anomalies"] = detect_anomalies(
            record, well_lookup[record["waterRightNo"]]
        )
    unique_water_rights = sorted({record["waterRightNo"] for record in records})
    years = sorted({record["yearMinguo"] for record in records})
    empty_water_rights = sorted(set(well_lookup) - set(unique_water_rights))
    authority_counts = {
        authority: len(
            {
                record["waterRightNo"]
                for record in records
                if record["authority"] == authority
            }
        )
        for authority in AUTHORITY_BY_PREFIX.values()
    }

    if len(wells) != 111 or len(unique_water_rights) != 106 or len(records) != 824:
        raise ValueError(
            f"資料筆數不符：井籍 {len(wells)}、水權 {len(unique_water_rights)}、年度 {len(records)}"
        )
    if set(empty_water_rights) != EXPECTED_EMPTY_WATER_RIGHTS:
        raise ValueError(f"無歷史資料水權不符：{empty_water_rights}")
    if authority_counts != {"臺中市政府": 91, "苗栗縣政府": 15}:
        raise ValueError(f"主管機關筆數不符：{authority_counts}")

    payload = {
        "schemaVersion": 1,
        "title": "本處抽水井歷年每月抽水量",
        "source": "https://wr.wra.gov.tw/WRTInfoFrontEnd/WaterRecord/WaterSearch",
        "sourcePdf": unquote(source_pdf.name),
        "waterRightCount": len(unique_water_rights),
        "wellCount": len(wells),
        "recordCount": len(records),
        "monthlyRecordCount": len(records) * 12,
        "yearFrom": years[0],
        "yearTo": years[-1],
        "authorityCounts": authority_counts,
        "emptyWaterRightNos": empty_water_rights,
        "anomalyRecordCount": sum(
            len(record["anomalies"]) for record in records
        ),
        "records": records,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "waterRights": payload["waterRightCount"],
                "annualRecords": payload["recordCount"],
                "monthlyRecords": payload["monthlyRecordCount"],
                "emptyWaterRights": payload["emptyWaterRightNos"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
