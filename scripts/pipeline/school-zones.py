#!/usr/bin/env python3
"""초등학교 통학구역(학구도) 도면을 학교별 청크(public/school-zones/*.json)로 굽는다.

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

## 무엇을 거르고, 어떻게 나누나

`data/location.json`에 실린 초등학교(전국)와 이어진 학구만 남긴다. 산출물은
두 곳으로 갈린다:

- `data/school-zones-index.json` — 통학구역이 있는 학교ID 목록뿐인 작은
  파일. `src/data/school-zones.ts`가 정적으로 `import`해서, "이 학교는
  통학구역이 없다"를 내려받기 없이 바로 안다.
- `public/school-zones/<학교ID>.json` — 그 학교의 학구 도형(들). 학교를
  펼치는 순간 `src/lib/loadSchoolZones.ts`가 그 하나만 내려받는다. 전국
  6,198개 학교분을 하나로 합쳐 정적 import하면 번들이 gzip 6.9MB로
  불어나(실측: JS 번들 전체가 7.5MB) 첫 로드가 느려지므로, 학교 단위로
  쪼갠다 — 공동통학구역이 걸린 학교끼리는 같은 학구 도형이 양쪽 파일에
  중복되지만, 각 파일은 그 학교를 펼친 사람만 받으므로 중복 자체는
  문제가 아니다.
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
INDEX_JSON = os.path.join(REPO, "data", "school-zones-index.json")
CHUNKS_DIR = os.path.join(REPO, "public", "school-zones")

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

    **왜 크기를 줄이나.** 학교 하나를 펼칠 때 `public/school-zones/<학교ID>.json`
    하나만 내려받는다(`src/lib/loadSchoolZones.ts` 참고) — 전국 규모에서는 이
    한 번의 내려받기도 모바일에서 체감되므로, 인코딩으로 그 payload를 더
    줄인다.
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


def distance_to_ring_m(point: tuple[float, float], ring: list[list[float]]) -> float:
    """점에서 링의 가장 가까운 변까지의 대략적인 거리(m). 아래 검증에서만 쓴다."""
    plon, plat = point
    m_per_lat = 111_320.0
    m_per_lon = 111_320.0 * math.cos(math.radians(plat))
    px, py = 0.0, 0.0  # 점을 원점으로 둔 로컬 좌표계(미터)
    best = math.inf
    n = len(ring)
    for i in range(n):
        x1, y1 = (ring[i][0] - plon) * m_per_lon, (ring[i][1] - plat) * m_per_lat
        x2, y2 = (
            (ring[(i + 1) % n][0] - plon) * m_per_lon,
            (ring[(i + 1) % n][1] - plat) * m_per_lat,
        )
        dx, dy = x2 - x1, y2 - y1
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(x1 * dx + y1 * dy) / length_sq))
        cx, cy = x1 + t * dx, y1 + t * dy
        best = min(best, math.hypot(cx - px, cy - py))
    return best


# 학교 위치표준데이터와 학구도 SHP는 **서로 다른 기관이 따로 관리하는
# 원본**이라, 한 학교가 자기 학구 경계 바깥에 살짝 걸리는 채로 공시될 수
# 있다 — 우리 좌표계 변환의 결함이 아니라 원본 두 벌 사이의 실측 오차다.
#
# **서울(778개 학구)에서는 이름으로 콕 집은 예외 둘이면 충분했다**(은빛초
# 15.8m, 화곡초 390.6m — 화곡초는 화곡초·화일초 공동통학구역이라 경계가
# 어느 한쪽 건물을 정확히 감싸지 않았다). 그런데 전국(7,117개 학구)으로
# 넓히자 18곳으로 늘었고, 그중엔 분교장(11km — 본교와 분교 건물이 원래
# 멀리 떨어져 있다)·광역통학구역(5.5km — 이름 그대로 넓은 시골 학구다)처럼
# **이름으로 하나하나 손으로 확인하는 게 더는 안전하지 않은** 사례가
# 섞였다. 그래서 이름을 박아 두는 대신 **거리 문턱**을 쓴다: 문턱을 넘는
# school↔zone 연결은 막지 않고 조용히 뺀다(그 학교는 "통학구역 없음"으로
# 남는다) — 잘못됐을 수 있는 경계를 그리느니 안 그리는 편이 낫다(이
# 저장소의 "모른다 vs 없다" 원칙과 같다). 아래에서 뺀 목록을 표준출력에
# 남겨, 다음에 다시 구울 때 사람이 그 목록의 변화를 볼 수 있게 한다.
#
# 값은 서울에서 손으로 확인한 가장 큰 사례(화곡초 390.6m)보다 조금 여유를
# 둔 500m다 — 그 밑은 지금까지 실측으로 확인된 "정상적인 원본 간 오차"
# 범위 안이고, 그 위는 "믿고 그릴 근거가 없다"로 본다.
MAX_ACCEPTABLE_MISMATCH_M = 500.0

# `MAX_ACCEPTABLE_MISMATCH_M`을 넘어서서 뺀 학교가 이 비율을 넘으면
# **문턱 조정이 아니라 좌표계 자체를 의심해야 한다** — 무작위로 드문드문
# 튀는 것과 무언가 체계적으로 틀린 것(예: 잘못된 EPSG, 잘못 읽은 열)은
# 뺀 비율로 갈린다. 실측으로 이 비율(len(dropped)/len(schools))이 얼마나
# 낮은지: 서울(818곳)에서는 2곳, 전국(6,205곳)에서는 7곳(0.11%) — 둘 다
# 한참 아래다. (예전엔 여기 "18/6205"를 적어 뒀는데, 그건 문턱을 적용하기
# **전** 순수 point-in-polygon 실패 수였다 — 이 문턱을 걸어 실제로 뺀
# 수(=이 비율의 분자)는 7이다. 헷갈리지 않게 실제로 이 코드가 계산하는
# 값과 같은 것만 적는다.)
MAX_MISMATCH_RATE = 0.02


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
            simplified = rdp(ring, SIMPLIFY_EPSILON_DEG)
            # 원본에 넓이가 사실상 0인 링이 실제로 있다(예: 용신초통학구역의
            # 세 번째 링은 589·619점짜리 진짜 구역 둘 옆에 4점 — 서로 15cm
            # 안쪽에 몰린 — 이 붙어 있었다, 아마 편집 과정의 찌꺼기). 그런
            # 링은 단순화가 2점으로 접어 버려 폴리곤이 못 된다 — 애초에
            # 지도에 그려도 안 보일 크기라 조용히 뺀다.
            if len(simplified) < 3:
                continue
            rings.append(encode_ring(simplified))
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
    #
    # **학교 단위로 거른다 — 학구 단위가 아니다.** 처음엔 학구 하나하나를
    # 따로 걸러 봤는데, 그러면 실측 오탐이 11,614개 연결 중 4,434개(38%)나
    # 나왔다. 이유는 공동통학구역의 생김새 자체에 있다: 학교 하나가 여러
    # 학구에 걸릴 때, 그 여러 학구는 "이 학교가 그 학구들 전부를 감싸야
    # 한다"는 뜻이 아니라 "그 학구들 중 어디에 살아도 이 학교를 고를 수
    # 있다"는 뜻이다 — 짝을 이루는 다른 학교 쪽 학구는 이 학교 건물에서
    # 멀리 있는 게 정상이다. 그래서 "이 학교가 **자기 학구들 중 적어도
    # 하나** 안에(또는 문턱 안에) 있는가"만 본다 — 그 하나가 있으면 나머지
    # 학구도 전부 그대로 싣는다(공동 배정의 진짜 선택지들이라 솎아 낼
    # 이유가 없다).
    decoded = {
        zid: [decode_ring(ring) for ring in z["rings"]] for zid, z in zones.items()
    }

    dropped: list[tuple[str, float]] = []  # (학교명, 가장 가까운 학구까지 거리)
    filtered_by_school: dict[str, list[str]] = {}
    for sid, zids in by_school.items():
        point = (schools[sid]["lon"], schools[sid]["lat"])
        rings = [ring for z in zids for ring in decoded[z]]
        if any(point_in_ring(point, ring) for ring in rings):
            filtered_by_school[sid] = zids
            continue
        nearest = min((distance_to_ring_m(point, ring) for ring in rings), default=math.inf)
        if nearest <= MAX_ACCEPTABLE_MISMATCH_M:
            filtered_by_school[sid] = zids
        else:
            dropped.append((schools[sid]["name"], nearest))
    by_school = filtered_by_school

    rate = len(dropped) / len(schools) if schools else 0.0
    if rate > MAX_MISMATCH_RATE:
        worst = sorted(dropped, key=lambda d: -d[1])[:5]
        print(
            f"학교 {len(dropped)}/{len(schools)}곳({rate:.1%})이 자기 학구들 중 "
            f"어디에도(문턱 {MAX_ACCEPTABLE_MISMATCH_M:.0f}m 포함) 안 든다 — "
            f"정상 범위(과거 실측 0.3% 안팎)를 크게 벗어났으니 문턱이 아니라 "
            f"좌표계 변환 자체를 의심하라: {worst}",
            file=sys.stderr,
        )
        return 1
    if dropped:
        worst = sorted(dropped, key=lambda d: -d[1])[:10]
        print(
            f"학교 {len(dropped)}곳({rate:.2%})을 '통학구역 없음'으로 뺐다 — "
            f"자기 학구들 중 어디에도 {MAX_ACCEPTABLE_MISMATCH_M:.0f}m 안으로도 "
            f"안 든다(분교장·광역통학구역처럼 정상일 수도, 두 원본 간 실제 "
            f"어긋남일 수도 있다). 가장 먼 10곳: {worst}"
        )
    # 필터링 후 아무 학교도 참조하지 않는 학구는 산출물에서 뺀다 — 안 그러면
    # 뺀 학교의 학구 도형만 죽은 데이터로 남는다.
    referenced = {zid for zids in by_school.values() for zid in zids}
    zones = {zid: z for zid, z in zones.items() if zid in referenced}
    total_schools = len(by_school) + len(dropped)
    print(
        f"검증: 학교 {len(by_school)}/{total_schools}곳 중 "
        f"{len(by_school)}곳이 자기 학구들 중 하나에 든다"
    )

    data_as_of = sorted(base_dates)[-1] if len(base_dates) == 1 else sorted(base_dates)

    # data/school-zones-index.json — 정적 import되는 작은 색인. 학교ID
    # 목록만 담아, "이 학교는 통학구역이 없다"를 내려받기 없이 바로 안다.
    index = {
        "schemaVersion": SCHEMA_VERSION,
        "dataAsOf": data_as_of,
        "schoolIds": sorted(by_school),
    }
    with open(INDEX_JSON, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    # public/school-zones/<학교ID>.json — 학교 하나를 펼칠 때만 내려받는
    # 청크. 이전 실행의 청크가 그대로 남아 있으면(학교가 통학구역을 잃은
    # 경우 등) 죽은 파일이 되므로, 새로 쓰기 전에 디렉터리를 통째로 비운다.
    if os.path.isdir(CHUNKS_DIR):
        for name in os.listdir(CHUNKS_DIR):
            os.remove(os.path.join(CHUNKS_DIR, name))
    else:
        os.makedirs(CHUNKS_DIR)

    total_points = 0
    total_bytes = 0
    for sid, zids in by_school.items():
        chunk = {
            "schemaVersion": SCHEMA_VERSION,
            "zones": [{"id": zid, **zones[zid]} for zid in zids],
        }
        path = os.path.join(CHUNKS_DIR, f"{sid}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(chunk, f, ensure_ascii=False, separators=(",", ":"))
        total_bytes += os.path.getsize(path)
        total_points += sum(len(r) // 2 for zid in zids for r in zones[zid]["rings"])

    print(
        f"완료. public/school-zones/*.json {len(by_school)}개 파일 "
        f"(학구 {len(zones)}종 / 점 {total_points:,}개 / 합계 {total_bytes / 1024 / 1024:.1f}MB), "
        f"data/school-zones-index.json ({os.path.getsize(INDEX_JSON) / 1024:.0f}KB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
