#!/usr/bin/env python3
"""초등학교 통학구역(학구도) 도면을 data/school-zones.json으로 굽는다.

**왜 파이썬인가.** 이 저장소의 파이프라인은 TypeScript고 외부 파서 없이 돈다.
그런데 원본은 55MB짜리 Shapefile이고 좌표계가 EPSG:5186(중부원점)이라, 읽으려면
SHP 파서와 좌표계 변환이 둘 다 필요하다. 둘 다 손으로 구현하면 조용히 틀릴 수
있는 종류의 코드다 — 특히 좌표계 변환이 몇 미터씩 어긋나면 화면은 멀쩡히
그려지고 경계만 통째로 틀린다. 그래서 `data/sources/subway-stations.csv`를
xlsx에서 한 번 바꿔 보관한 것과 **같은 방식**을 쓴다: 검증된 도구로 한 번
변환해 산출물을 저장소에 넣고, 파이프라인 본체는 그 도구에 의존하지 않는다.

**원본을 저장소에 넣지 않는 이유는 크기다**(SHP 하나가 55MB). 대신 받는 곳과
바꾸는 법을 여기와 data/README.md에 적어 둔다.

## 다시 만들려면

    # 1. 원본을 받는다(학구도안내서비스 → 공공데이터 → "초등학교 통학구역 및 공동통학구역")
    #    https://schoolzone.emac.kr/publicData/publicDataList.do
    #    같은 데이터가 공공데이터포털 15021149에도 있다.
    # 2. 학교-학구도 연계정보 CSV도 같은 목록에서 받는다.
    # 3. 변환 도구를 격리된 환경에 깔고 돌린다(저장소 의존성이 아니다).
    python3 -m venv /tmp/zone-venv
    /tmp/zone-venv/bin/pip install pyshp pyproj
    /tmp/zone-venv/bin/python scripts/pipeline/school-zones.py \\
        --shp <풀어 둔>/초등학교통학구역.shp \\
        --link <풀어 둔>/한국교육시설안전원_학교학구도연계정보_20260320.csv

## 무엇을 거르나

`data/location.json`에 실린 초등학교(= `location-config.json`의 targetBounds가
정한 우리 지역)와 이어진 학구만 남긴다. 전국 7,140개 중 우리에게 필요한 것은
300여 개뿐이다.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCATION_JSON = os.path.join(REPO, "data", "location.json")
OUT_JSON = os.path.join(REPO, "data", "school-zones.json")

SCHEMA_VERSION = 1

# 원본 좌표계(Korea 2000 / Central Belt 2010). .prj가 말하는 값 그대로다 —
# False_Easting 200000, False_Northing 600000, 중앙자오선 127, 원점위도 38.
SOURCE_CRS = "EPSG:5186"
TARGET_CRS = "EPSG:4326"

# 단순화 허용오차(도). 1e-5도 ≈ 위도 1.1m.
#
# **더 줄이지 않는다.** 통학구역 경계는 "길 어느 쪽에 사는가"를 가르는 선이라,
# 몇 미터를 흐리면 실제로 갈리는 집이 생긴다. 이 값에서 60,389점이 21,288점으로
# 줄어 파일이 1.36MB → 0.49MB가 되는데, 그보다 더 굵게 잡아 아끼는 양(2e-5에서
# 84KB, 5e-5에서 182KB)은 그 위험에 비하면 남는 장사가 아니다.
SIMPLIFY_EPSILON_DEG = 1e-5


def rdp(points: list[list[float]], eps: float) -> list[list[float]]:
    """Douglas-Peucker. 링의 모양을 유지한 채 점만 솎아 낸다."""
    if len(points) < 3:
        return list(points)
    x1, y1 = points[0]
    x2, y2 = points[-1]
    dx, dy = x2 - x1, y2 - y1
    den = math.hypot(dx, dy)
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        d = (
            abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / den
            if den
            else math.hypot(x0 - x1, y0 - y1)
        )
        if d > dmax:
            dmax, idx = d, i
    if dmax <= eps:
        return [points[0], points[-1]]
    return rdp(points[: idx + 1], eps)[:-1] + rdp(points[idx:], eps)


# 좌표를 정수로 담는 단위. 1e-6도 ≈ 위도 11cm — 단순화 허용오차(1.1m)보다
# 한 자리 작으므로 이 양자화가 모양을 더 흐리지는 않는다.
COORD_SCALE = 1_000_000


def encode_ring(ring: list[list[float]]) -> list[int]:
    """링 하나를 `[lon0, lat0, dlon1, dlat1, ...]` 정수 배열로 접는다.

    **정밀도를 버리지 않고 크기만 줄이는 인코딩이다.** 좌표를 그대로
    `[[127.169825,37.441926], ...]`로 적으면 점당 22바이트쯤 되는데, 이웃한
    점끼리는 소수점 아래 몇 자리만 다르므로 차이만 적으면 점당 6~8바이트로
    준다(실측 470KB → 190KB).

    **왜 크기를 줄이나.** 이 파일은 `src/data/school-zones.ts`가 정적으로
    `import`한다 — 늦게 부르려면 동적 `import()`가 필요한데, 그건
    `src/no-network.test.ts`가 막는 패턴이다(리뷰어가 심었던 유출 경로 7개
    중 하나가 `import(url)`이었다). 그 가드를 느슨하게 하는 것보다 payload를
    줄이는 편이 맞바꿈이 낫다고 보아 이렇게 한다.
    """
    out: list[int] = []
    prev_x = prev_y = 0
    for i, (lon, lat) in enumerate(ring):
        x = round(lon * COORD_SCALE)
        y = round(lat * COORD_SCALE)
        if i == 0:
            out.extend((x, y))
        else:
            out.extend((x - prev_x, y - prev_y))
        prev_x, prev_y = x, y
    return out


def decode_ring(encoded: list[int]) -> list[list[float]]:
    """`encode_ring`의 역. 아래 검증에서만 쓴다 — 실제 복원은 TS 쪽이 한다."""
    out: list[list[float]] = []
    x = y = 0
    for i in range(0, len(encoded), 2):
        if i == 0:
            x, y = encoded[0], encoded[1]
        else:
            x += encoded[i]
            y += encoded[i + 1]
        out.append([x / COORD_SCALE, y / COORD_SCALE])
    return out


def point_in_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    """짝수-홀수 규칙. 아래 검증에서만 쓴다."""
    x, y = point
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shp", required=True, help="초등학교통학구역.shp 경로")
    ap.add_argument("--link", required=True, help="학교-학구도 연계정보 CSV 경로")
    args = ap.parse_args()

    import shapefile  # pyshp
    from pyproj import Transformer

    with open(LOCATION_JSON, encoding="utf-8") as f:
        location = json.load(f)
    schools = {s["id"]: s for s in location["elementarySchools"]}

    # 학교ID → 학구ID(여럿일 수 있다). 한 학교가 여러 학구를 갖는 경우가
    # 실제로 흔하다 — 우리 지역만 봐도 272곳 중 85곳이 둘 이상이다.
    by_school: dict[str, list[str]] = {}
    with open(args.link, encoding="cp949", newline="") as f:
        for row in csv.DictReader(f):
            if row["학교급구분"] != "초등학교":
                continue
            sid = row["학교ID"].strip()
            if sid not in schools:
                continue
            by_school.setdefault(sid, []).append(row["학구ID"].strip())

    wanted = {z for zids in by_school.values() for z in zids}
    print(f"우리 초등학교 {len(schools)}곳 중 학구가 있는 곳: {len(by_school)}곳")
    print(f"필요한 학구: {len(wanted)}개")

    transformer = Transformer.from_crs(SOURCE_CRS, TARGET_CRS, always_xy=True)
    reader = shapefile.Reader(args.shp, encoding="euc-kr")
    field_names = [f[0] for f in reader.fields[1:]]
    at = {name: i for i, name in enumerate(field_names)}

    zones: dict[str, dict] = {}
    base_dates: set[str] = set()
    for i in range(len(reader)):
        record = list(reader.record(i))
        zid = record[at["HAKGUDO_ID"]]
        if zid not in wanted:
            continue
        shape = reader.shape(i)
        bounds = list(shape.parts) + [len(shape.points)]
        rings = []
        for a, b in zip(bounds, bounds[1:]):
            chunk = shape.points[a:b]
            lons, lats = transformer.transform(
                [p[0] for p in chunk], [p[1] for p in chunk]
            )
            ring = [[round(lo, 6), round(la, 6)] for lo, la in zip(lons, lats)]
            rings.append(encode_ring(rdp(ring, SIMPLIFY_EPSILON_DEG)))
        zone = zones.setdefault(
            zid,
            {
                "name": record[at["HAKGUDO_NM"]],
                # HAKGUDO_GB: '0' 단독통학구역 / '1' 공동통학구역. 실측으로
                # 확인했다 — '1'인 57개는 이름에 전부 "공동"이 들어 있고
                # '0'인 271개는 하나도 없다.
                "shared": record[at["HAKGUDO_GB"]] == "1",
                "rings": [],
            },
        )
        zone["rings"].extend(rings)
        base_dates.add(str(record[at["BASE_DT"]]).strip())

    missing = wanted - set(zones)
    if missing:
        print(f"도면을 못 찾은 학구 {len(missing)}개: {sorted(missing)[:5]}", file=sys.stderr)
        return 1

    # ── 검증: 학교가 자기 학구 안에 있는가 ──────────────────────────────
    #
    # 좌표계 변환이 맞는지를 확인하는 **독립된 두 데이터의 교차검증**이다.
    # 학교 좌표는 「전국초중등학교위치표준데이터」(위경도)에서 오고 학구 도면은
    # 이 SHP(중부원점)에서 온다 — 변환이 틀리면 이 검사가 무너진다.
    # 인코딩한 링을 **다시 풀어서** 검사한다 — 좌표계 변환뿐 아니라
    # `encode_ring`/`decode_ring` 왕복까지 한 번에 확인하는 셈이다.
    decoded = {
        zid: [decode_ring(ring) for ring in z["rings"]] for zid, z in zones.items()
    }
    outside = [
        schools[sid]["name"]
        for sid, zids in by_school.items()
        if not any(
            point_in_ring((schools[sid]["lon"], schools[sid]["lat"]), ring)
            for z in zids
            for ring in decoded[z]
        )
    ]
    if outside:
        print(
            f"학교 {len(outside)}곳이 자기 학구 밖에 있다 — 좌표계 변환을 의심하라: "
            f"{outside[:5]}",
            file=sys.stderr,
        )
        return 1
    print(f"검증: 학교 {len(by_school)}곳 전부 자기 학구 안에 있다")

    out = {
        "schemaVersion": SCHEMA_VERSION,
        # 원본이 행마다 들고 있는 기준일자. 값이 여럿이면 가장 늦은 것을
        # 쓰지 않고 그대로 드러낸다 — 섞여 있다는 사실 자체가 알아야 할
        # 정보다(지금은 전부 같은 하루다).
        "dataAsOf": sorted(base_dates)[-1] if len(base_dates) == 1 else sorted(base_dates),
        "zones": dict(sorted(zones.items())),
        "bySchool": {sid: sorted(z) for sid, z in sorted(by_school.items())},
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    points = sum(len(r) // 2 for z in zones.values() for r in z["rings"])
    print(
        f"완료. data/school-zones.json "
        f"(학구 {len(zones)}개 / 점 {points:,}개 / {os.path.getsize(OUT_JSON) / 1024:.0f}KB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
