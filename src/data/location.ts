import type {
  Coordinate,
  ElementarySchool,
  SubwayStation,
} from "../lib/location";

/**
 * 입지 사실을 재는 데 쓰는 좌표들 — **지금은 셋 다 비어 있다.**
 *
 * 단지 좌표를 얻으려면 지번 주소를 지오코딩해야 하는데 별도 API 키가
 * 필요하고 아직 신청 전이다. 학교·지하철역 좌표 표준데이터도 아직
 * 내려받지 않았다. 그래서 이 파일은 **자리만 잡아 둔 것**이고, 화면은
 * 지금 모든 단지에서 "아직 위치를 몰라요"를 낸다.
 *
 * **비어 있는 것이 이 파일의 정직한 상태다.** 그럴듯한 좌표를 채워 두면
 * 화면은 재는 데 성공하고 숫자만 통째로 틀린다 — 그 실패는 눈에 띄지
 * 않는다. 특히 하면 안 되는 두 가지:
 *
 * - 근처 단지의 좌표로 대신 채우기
 * - 법정동 중심점으로 대신 채우기. 법정동은 한 변이 몇 km라, 그걸로 재면
 *   "역까지 300m"와 "역까지 2.5km"가 뒤바뀐다
 *
 * 둘 다 우리가 모르는 것을 아는 척하는 것이고, 이 앱이 하지 않기로 한
 * 바로 그 일이다.
 *
 * ## 채워질 때 어떻게 채워지는가
 *
 * 파이프라인(`scripts/`)이 `data/raw/`의 지번 주소를 지오코딩해
 * `data/location.json`으로 구워 내고, 이 파일이 그 산출물을 정적으로
 * 들여오게 바뀐다. 필드 정의는 `data/README.md`의 "location.json" 절에
 * 있다.
 *
 * **좌표 조회를 여기서 하지 않는다.** `src/`는 네트워크를 타지 않는다는
 * 약속이 있고(`src/no-network.test.ts`), 좌표는 빌드 타임에 이미 구워져
 * 들어와야 한다. 이 파일이 하는 일은 구워진 값을 꺼내 주는 것뿐이다.
 */

/**
 * 단지 고유 ID(`complexKey`) → 그 단지의 좌표.
 *
 * **좌표를 못 구한 단지는 여기 항목 자체가 없다.** `null`을 값으로 넣지
 * 않는 이유는, 없는 키를 조회하면 자연히 `undefined`가 나와 "모른다"로
 * 가는데, `null`을 값으로 두면 그 자리가 "확인해 봤는데 없더라"처럼
 * 읽히기 시작하기 때문이다. 우리가 아는 것은 "좌표가 있다"뿐이고 나머지는
 * 전부 모르는 것이다.
 */
export const COMPLEX_COORDINATES: Readonly<Record<string, Coordinate>> = {};

/**
 * 지하철역 목록. **`null`은 "아직 못 실었다"**이지 "역이 없다"가 아니다.
 *
 * 「전국도시철도역사정보표준데이터」에서 온다. 한 역에 노선이 여럿이면
 * 원본에도 행이 여럿이라, 같은 이름의 역이 여러 번 들어올 수 있다 —
 * 엔진은 그중 가장 가까운 하나만 고르고 그 사실을 문구가 말한다.
 */
export const SUBWAY_STATIONS: readonly SubwayStation[] | null = null;

/**
 * 초등학교 목록. **`null`은 "아직 못 실었다"**이지 "학교가 없다"가 아니다.
 *
 * 「전국초중등학교위치표준데이터」에서 초등학교만 걸러 온다. 중·고등학교는
 * 담지 않는다 — 이 화면이 말하는 것은 초등학교 하나뿐이고, 학교급을 늘리면
 * "학군"처럼 읽히기 시작한다.
 */
export const ELEMENTARY_SCHOOLS: readonly ElementarySchool[] | null = null;

/**
 * 이 단지의 좌표. 모르면 `null`.
 *
 * `noUncheckedIndexedAccess`가 켜져 있어 없는 키는 `undefined`로 오고,
 * 여기서 `null`(모른다)로 좁힌다 — 화면과 엔진은 "모른다"를 한 가지
 * 모양으로만 다룬다.
 */
export function coordinateOf(complexKey: string): Coordinate | null {
  return COMPLEX_COORDINATES[complexKey] ?? null;
}
