import rawLocation from "../../data/location.json";
import type {
  Coordinate,
  ElementarySchool,
  SubwayStation,
} from "../lib/location";

/**
 * 지도 위 참고 표시 하나(중·고등학교). **입지 화면의 `ElementarySchool`과
 * 모양은 같지만 일부러 이름을 나눈 타입이다.**
 *
 * ⚠ TypeScript는 구조적 타입이라 이 타입만으로 `elementarySchool` 자리에
 * 흘러드는 것을 막지는 못한다(모양이 같으면 서로 대입된다) — 진짜 경계는
 * "`src/lib/location/`이 이 값을 읽는 코드가 없다"는 사실 자체이고,
 * `location.test.ts`의 "지도 참고 표시가 입지 화면 엔진에 새지 않는다"가
 * 그 소스 텍스트를 직접 확인한다. 이름을 나눈 것은 그 경계를 읽는 사람이
 * 코드에서 바로 알아보게 하려는 것뿐이다.
 */
export interface MapSchool {
  id: string;
  name: string;
  coordinate: Coordinate;
}

/**
 * 초등학교 하나의 기본정보(지도에서 마커를 눌렀을 때 띄우는 것).
 *
 * **좌표가 없다** — 일부러다. 좌표는 위 `ELEMENTARY_SCHOOLS`가 들고, 이
 * 타입은 "그 학교가 어떤 학교인가"만 말한다. 둘을 한 타입으로 합치면 입지
 * 화면 엔진(`src/lib/location/`)이 쓰는 `ElementarySchool`이 이 필드들까지
 * 끌고 들어가게 되는데, 그 엔진은 이 정보를 읽을 이유가 없다(반경 안
 * 개수를 셀 뿐이다).
 *
 * 값은 전부 「전국초중등학교위치표준데이터」가 준 그대로다 — 우리가
 * 만들거나 추정한 값이 없다(`data/README.md`의 `elementarySchools[]` 절).
 */
export interface ElementarySchoolDetail {
  id: string;
  name: string;
  /** 설립형태 — 공립·국립·사립 중 하나 */
  foundationType: string;
  /** 설립일자(YYYY-MM-DD) */
  foundedOn: string;
  /** 소재지 주소(도로명 우선, 없으면 지번). **빈 문자열이면 모른다는 뜻이다** */
  address: string;
  /** 시도교육청명(예: 서울특별시교육청) */
  officeOfEducation: string;
  /** 교육지원청명(예: 서울특별시동부교육지원청) */
  districtOfficeOfEducation: string;
  /**
   * 아래 넷은 **학교알리미 공시**에서 온다(위 다섯 필드와 다른 원본이다).
   * 공시는 해마다 한 번이라 오늘 기준이 아니고, 그래서 화면이
   * {@link ELEMENTARY_SCHOOL_INFO_YEAR}를 함께 낸다.
   *
   * **`null`은 "모른다"**이고, 화면은 그 줄을 아예 내지 않는다 — 전화번호는
   * 실제로 285곳 중 50곳이 공시에 없다. `0`으로 채우면 "교원이 0명"이라는
   * 틀린 사실이 된다.
   */
  phone: string | null;
  /** 설립유형 — 단설·병설·부설·부속 중 하나 */
  foundationForm: string | null;
  /** 학생 수(계·남·여). 계는 남 + 여와 맞는 것만 실려 있다 */
  students: SchoolHeadcount | null;
  /**
   * 교원 수(계·남·여). 공시의 "직위별 교원 현황" 총계이고, 기간제교사·강사를
   * 포함하고 원어민강사는 뺀 수다(휴직 교원은 남·여 안에 들어 있다).
   */
  teachers: SchoolHeadcount | null;
}

/** 사람 수 한 벌(계·남·여). `total`은 언제나 `male + female`이다 */
export interface SchoolHeadcount {
  total: number;
  male: number;
  female: number;
}

/**
 * 입지 사실을 재는 데 쓰는 좌표들.
 *
 * 학교·역은 **실제 값이 실려 있고**, 단지 좌표는 **아직 비어 있다.**
 * 지번 주소를 지오코딩하려면 별도 API 키가 필요한데 아직 없다. 그래서
 * 화면은 지금도 모든 단지에서 "아직 위치를 몰라요"를 낸다.
 *
 * **단지 좌표가 비어 있는 것이 이 파일의 정직한 상태다.** 그럴듯한 좌표를
 * 채워 두면 화면은 재는 데 성공하고 숫자만 통째로 틀린다 — 그 실패는 눈에
 * 띄지 않는다. 특히 하면 안 되는 두 가지:
 *
 * - 근처 단지의 좌표로 대신 채우기
 * - 법정동 중심점으로 대신 채우기. 법정동은 한 변이 몇 km라, 그걸로 재면
 *   "역까지 300m"와 "역까지 2.5km"가 뒤바뀐다
 *
 * 둘 다 우리가 모르는 것을 아는 척하는 것이고, 이 앱이 하지 않기로 한
 * 바로 그 일이다.
 *
 * ## 값이 어디서 오는가
 *
 * `data/location.json`이 유일한 출처이고, 그 파일은
 * `scripts/pipeline/location.ts`가 `data/sources/`의 표준데이터에서 구워
 * 낸다. 무엇을 실을지(어느 상자, 어느 버퍼)는 코드가 아니라
 * `scripts/pipeline/location-config.json`이 정한다. 필드 정의와 출처는
 * `data/README.md`의 "location.json" 절에 있다.
 *
 * **좌표 조회를 여기서 하지 않는다.** `src/`는 네트워크를 타지 않는다는
 * 약속이 있고(`src/no-network.test.ts`), 좌표는 빌드 타임에 이미 구워져
 * 들어와야 한다. 이 파일이 하는 일은 구워진 값을 꺼내 주는 것뿐이다.
 */

/**
 * 산출물의 평평한 위경도를 엔진이 쓰는 모양으로 바꾼다.
 *
 * 산출물은 `{ lat, lon }`을 항목에 바로 달고, 엔진은 `coordinate` 안에
 * 넣어 둔다(`Coordinate`가 한 덩어리로 다뤄지는 값이라서다). 그 이음매를
 * 여기 한 곳에서만 잇는다.
 */
function toCoordinate(row: { lat: number; lon: number }): Coordinate {
  return { lat: row.lat, lon: row.lon };
}

/**
 * 빈 목록을 **`null`("아직 못 실었다")로 접는다.**
 *
 * 빈 배열을 그대로 내보내면 "확인해 봤는데 하나도 없더라"로 읽히기
 * 시작한다. 전국 역·학교 목록이 정말로 0개일 수는 없으므로, 비어 있다는
 * 것은 이 단지 주변에 대한 사실이 아니라 데이터가 아직 없다는 사실이다.
 * 엔진도 같은 규칙을 한 번 더 적용한다(`src/lib/location/assess.ts`).
 */
function listOrNull<T>(list: readonly T[]): readonly T[] | null {
  return list.length === 0 ? null : list;
}

/**
 * 단지 고유 ID(`complexKey`) → 그 단지의 좌표.
 *
 * **지금은 비어 있다** — 지오코딩이 아직 붙지 않았다.
 *
 * **좌표를 못 구한 단지는 여기 항목 자체가 없다.** `null`을 값으로 넣지
 * 않는 이유는, 없는 키를 조회하면 자연히 `undefined`가 나와 "모른다"로
 * 가는데, `null`을 값으로 두면 그 자리가 "확인해 봤는데 없더라"처럼
 * 읽히기 시작하기 때문이다. 우리가 아는 것은 "좌표가 있다"뿐이고 나머지는
 * 전부 모르는 것이다.
 */
export const COMPLEX_COORDINATES: Readonly<Record<string, Coordinate>> =
  Object.fromEntries(
    rawLocation.complexes.map((row: { complexKey: string; lat: number; lon: number }) => [
      row.complexKey,
      toCoordinate(row),
    ]),
  );

/**
 * 지하철역 목록. **`null`은 "아직 못 실었다"**이지 "역이 없다"가 아니다.
 *
 * 「전국도시철도역사정보표준데이터」에서 온다. 한 역에 노선이 여럿이면
 * 원본에도 행이 여럿이라, 같은 이름의 역이 여러 번 들어올 수 있다 —
 * 엔진은 그중 가장 가까운 하나만 고르고 그 사실을 문구가 말한다.
 */
export const SUBWAY_STATIONS: readonly SubwayStation[] | null = listOrNull(
  rawLocation.subwayStations.map((row) => ({
    id: row.id,
    name: row.name,
    lineName: row.lineName,
    coordinate: toCoordinate(row),
  })),
);

/**
 * 초등학교 목록. **`null`은 "아직 못 실었다"**이지 "학교가 없다"가 아니다.
 *
 * 「전국초중등학교위치표준데이터」에서 초등학교만 걸러 온다. 중·고등학교는
 * 담지 않는다 — 이 화면이 말하는 것은 초등학교 하나뿐이고, 학교급을 늘리면
 * "학군"처럼 읽히기 시작한다.
 */
export const ELEMENTARY_SCHOOLS: readonly ElementarySchool[] | null = listOrNull(
  rawLocation.elementarySchools.map((row) => ({
    id: row.id,
    name: row.name,
    coordinate: toCoordinate(row),
  })),
);

/**
 * 학교ID → 그 초등학교의 기본정보. 지도에서 마커를 눌렀을 때만 쓴다.
 *
 * **`ELEMENTARY_SCHOOLS`와 일부러 나눠 둔 두 번째 통로다** — 위 배열은 입지
 * 화면 엔진이 좌표를 세는 데 쓰고(그 엔진은 기본정보를 읽지 않는다), 이
 * Map은 지도 패널이 "이 학교가 어떤 학교인가"를 띄우는 데만 쓴다.
 *
 * `null`을 쓰지 않는 이유: 찾는 학교가 없으면 `get`이 `undefined`를 주고,
 * 그 자체가 "그 학교 기본정보는 모른다"를 뜻한다 — 화면은 그때 패널을
 * 띄우지 않는다. 배열들의 `null`("아직 못 실었다")과 구분할 일이 없다.
 */
export const ELEMENTARY_SCHOOL_DETAILS: ReadonlyMap<string, ElementarySchoolDetail> =
  new Map(
    rawLocation.elementarySchools.map((row) => {
      // 공시에서 온 값들은 **키가 아예 없을 수 있다**(굽는 단계가 모르는
      // 값의 키를 만들지 않는다) — 여기서 `null`("모른다")로 좁힌다.
      const r = row as typeof row & {
        phone?: string;
        foundationForm?: string;
        students?: SchoolHeadcount;
        teachers?: SchoolHeadcount;
      };
      return [
        row.id,
        {
          id: row.id,
          name: row.name,
          foundationType: row.foundationType,
          foundedOn: row.foundedOn,
          address: row.address,
          officeOfEducation: row.officeOfEducation,
          districtOfficeOfEducation: row.districtOfficeOfEducation,
          phone: r.phone ?? null,
          foundationForm: r.foundationForm ?? null,
          students: r.students ?? null,
          teachers: r.teachers ?? null,
        },
      ];
    }),
  );

/**
 * 위 `phone`·`students`·`teachers`가 **몇 년 공시인가.** 공시는 해마다 한
 * 번이라 그 값들이 오늘 기준이 아니고, 화면은 이 연도를 함께 내야 정직하다.
 * 공시 원본을 아직 안 받았으면 `null`이다.
 */
export const ELEMENTARY_SCHOOL_INFO_YEAR: string | null =
  (rawLocation as { elementarySchoolInfoYear?: string }).elementarySchoolInfoYear ??
  null;

/**
 * 중·고등학교 목록. **지도 위 참고 표시 전용**(`ComplexMap.tsx`) — 지하철역
 * 마커와 같은 성격의 "여기 있다"는 사실 표시일 뿐이다.
 *
 * ⚠ **`src/lib/location/`(반경 안 개수를 세고 "학구도가 아니다"를 판정하는
 * 입지 화면 엔진)에 절대 넘기지 않는다.** 위 `ELEMENTARY_SCHOOLS`만 그
 * 판정에 쓰인다 — 학교급을 늘려 그 판정에 넣으면 화면이 "학군"처럼
 * 읽히기 시작한다(`data/README.md`의 "location.json" 절 참고).
 */
export const MIDDLE_SCHOOLS: readonly MapSchool[] | null = listOrNull(
  rawLocation.middleSchools.map((row) => ({
    id: row.id,
    name: row.name,
    coordinate: toCoordinate(row),
  })),
);

/** 위 `MIDDLE_SCHOOLS`와 같은 이유·같은 제약. */
export const HIGH_SCHOOLS: readonly MapSchool[] | null = listOrNull(
  rawLocation.highSchools.map((row) => ({
    id: row.id,
    name: row.name,
    coordinate: toCoordinate(row),
  })),
);

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
