import rawIndex from "../../data/school-zones-index.json";

/**
 * 초등학교 통학구역(학구도) — 색인과 디코딩만 여기 있다.
 *
 * ## 여기 있는 것이 무엇이 아닌가
 *
 * **배정 결과가 아니다.** 통학구역은 교육청이 정한 "이 구역에 살면 이 학교로
 * 갈 수 있다"는 경계일 뿐, 실제 배정은 공동통학구역·근거리 배정·학교 사정으로
 * 달라진다. 게다가 원본이 "수시"로 갱신된다(`DATA_AS_OF`가 이 파일이 굳은
 * 날이다). 그래서 화면은 이 경계를 그리면서도 룰셋의 `schoolZoneNote`
 * ("배정은 학구도로 정해지니 교육지원청에 확인하라")를 함께 낸다
 * (`ComplexMap.tsx` 참고).
 *
 * **도형 자체도 여기 없다.** 전국 6,198개 학교분 도형을 하나로 합쳐 정적
 * `import`하면 JS 번들이 gzip 6.9MB 불어난다(서울만일 때는 216KB였다) —
 * 실측: `vite build` 결과 전체 번들이 20.6MB(gzip 7.5MB)까지 커졌다. 그래서
 * 이 파일은 "이 학교는 통학구역이 있는가"만 아는 **작은 색인**(79KB)만
 * 정적으로 지고, 실제 도형은 `src/lib/loadSchoolZones.ts`가 학교를 펼치는
 * 순간 `public/school-zones/<학교ID>.json` 하나만 내려받아 채운다.
 *
 * ## 좌표가 접혀 있는 이유
 *
 * 학교별 청크 안의 링은 `[lon0, lat0, dlon1, dlat1, ...]` 꼴의 **정수 배열**이다
 * (단위 1e-6도 ≈ 11cm, 첫 점 뒤로는 이웃 점과의 차이만 적는다). 그대로
 * 좌표쌍을 적을 때보다 파일이 작다 — 정밀도는 그대로다
 * (`scripts/pipeline/school-zones.py`의 `encode_ring` 참고). `decodeRing`을
 * 여기서 내보내는 이유는 `loadSchoolZones.ts`가 네트워크만 맡고 디코딩
 * 로직은 하나로 유지하기 위해서다 — 두 곳에 같은 왕복 코드를 두면 언젠가
 * 어긋난다.
 */

/** 통학구역 하나. `rings`의 점은 **[경도, 위도]** 순서다(GeoJSON과 같다). */
export interface SchoolZone {
  id: string;
  /** 학구명(예: "서울학동초통학구역", "서울금옥초서울옥수초공동통학구역") */
  name: string;
  /**
   * 공동통학구역인가. **참이면 그 구역 안에서 학교를 고를 수 있다**는 뜻이라,
   * 경계를 "이 학교로 간다"로 읽으면 더 틀린다.
   */
  shared: boolean;
  rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

interface IndexFile {
  schemaVersion: number;
  dataAsOf: string | string[];
  schoolIds: string[];
}

const index = rawIndex as unknown as IndexFile;
const schoolIdsWithZones = new Set(index.schoolIds);

/** 도면이 굳은 날(원본의 데이터기준일자) */
export const DATA_AS_OF: string = Array.isArray(index.dataAsOf)
  ? index.dataAsOf.join(", ")
  : index.dataAsOf;

/** 접어 둔 정수 배열을 좌표쌍으로 되돌린다(`encode_ring`의 역). */
export function decodeRing(encoded: readonly number[]): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    if (i === 0) {
      x = encoded[0]!;
      y = encoded[1]!;
    } else {
      x += encoded[i]!;
      y += encoded[i + 1]!;
    }
    out.push([x / 1_000_000, y / 1_000_000]);
  }
  return out;
}

/**
 * 통학구역 자료가 있는 학교인가 — "없다"와 "모른다"를 가르는 데 쓴다.
 *
 * 내려받기 없이 바로 답한다(색인이 정적으로 실려 있어서다). 실제 도형은
 * `loadSchoolZones(schoolId)`로 따로 내려받아야 한다.
 */
export function hasSchoolZoneData(schoolId: string): boolean {
  return schoolIdsWithZones.has(schoolId);
}
