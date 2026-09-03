import { describe, expect, it } from "vitest";
import {
  assertNonEmpty,
  buildElementarySchools,
  buildHighSchools,
  buildLocationFile,
  buildMiddleSchools,
  buildSubwayStations,
  expandBounds,
  loadLocationConfig,
  parseCoordinate,
  parseCsv,
  readTable,
  withinBounds,
  type Bounds,
  type LocationConfig,
} from "./location";

/**
 * 입지 산출물을 굽는 단계의 단위 검사.
 *
 * 실제로 실린 데이터가 맞는지는 `scripts/location-data.test.ts`가 본다 —
 * 여기서는 **거르는 규칙 자체**가 의도대로인지만 확인한다.
 */

const BOX: Bounds = { minLat: 37.4, maxLat: 37.6, minLon: 127.0, maxLon: 127.2 };

function schoolRow(
  over: Partial<Record<string, string>> = {},
): Record<string, string> {
  return {
    학교ID: "픽스처-학교-1",
    학교명: "픽스처초등학교",
    학교급구분: "초등학교",
    운영상태: "운영",
    위도: "37.5",
    경도: "127.1",
    설립일자: "1984-05-23",
    설립형태: "공립",
    소재지지번주소: "서울특별시 강남구 대치동 1",
    소재지도로명주소: "서울특별시 강남구 테헤란로 1",
    시도교육청명: "서울특별시교육청",
    교육지원청명: "서울특별시강남서초교육지원청",
    ...over,
  };
}

function stationRow(
  over: Partial<Record<string, string>> = {},
): Record<string, string> {
  return {
    역번호: "0001",
    역사명: "픽스처역",
    노선번호: "L1",
    노선명: "픽스처선",
    역위도: "37.5",
    역경도: "127.1",
    ...over,
  };
}

describe("CSV 읽기", () => {
  it("따옴표와 그 안의 쉼표·따옴표를 다룬다", () => {
    expect(parseCsv('a,b\n"x,1","y""z"\n')).toEqual([
      ["a", "b"],
      ["x,1", 'y"z'],
    ]);
  });

  it("BOM과 CRLF가 있어도 헤더 이름이 깨지지 않는다", () => {
    const rows = readTable("﻿학교ID,학교명\r\nA1,가나초등학교\r\n");
    expect(rows).toEqual([{ 학교ID: "A1", 학교명: "가나초등학교" }]);
  });

  it("빈 좌표를 0으로 채우지 않는다", () => {
    // Number("")은 0이고, 0,0은 기니만 한복판이다. 그대로 실리면 거리
    // 계산은 조용히 성공하고 숫자만 통째로 틀린다.
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("  ")).toBeNull();
    expect(parseCoordinate("0")).toBeNull();
    expect(parseCoordinate("없음")).toBeNull();
    expect(parseCoordinate("37.5")).toBe(37.5);
  });
});

describe("상자를 넓히는 계산", () => {
  it("사방으로 넓어진다", () => {
    const wide = expandBounds(BOX, 1000);
    expect(wide.minLat).toBeLessThan(BOX.minLat);
    expect(wide.maxLat).toBeGreaterThan(BOX.maxLat);
    expect(wide.minLon).toBeLessThan(BOX.minLon);
    expect(wide.maxLon).toBeGreaterThan(BOX.maxLon);
  });

  it("위도 1,000m는 약 0.009도다(독립 검산)", () => {
    const wide = expandBounds(BOX, 1000);
    expect(BOX.minLat - wide.minLat).toBeCloseTo(0.008993, 5);
  });

  it("경도 여유가 위도 여유보다 넓다 — 우리 위도에서 경도 1도가 더 짧기 때문", () => {
    const wide = expandBounds(BOX, 1000);
    expect(BOX.minLon - wide.minLon).toBeGreaterThan(BOX.minLat - wide.minLat);
  });

  it("경계 위의 점은 상자 안이다", () => {
    expect(withinBounds(BOX, BOX.minLat, BOX.minLon)).toBe(true);
    expect(withinBounds(BOX, BOX.maxLat, BOX.maxLon)).toBe(true);
    expect(withinBounds(BOX, BOX.minLat - 0.0001, BOX.minLon)).toBe(false);
  });
});

describe("초등학교만 거른다", () => {
  it("중·고등학교는 담기지 않는다", () => {
    const out = buildElementarySchools(
      [
        schoolRow({ 학교ID: "초1" }),
        schoolRow({ 학교ID: "중1", 학교급구분: "중학교" }),
        schoolRow({ 학교ID: "고1", 학교급구분: "고등학교" }),
      ],
      BOX,
    );
    expect(out.map((s) => s.id)).toEqual(["초1"]);
  });

  it("운영 중이 아닌 학교는 담기지 않는다", () => {
    const out = buildElementarySchools(
      [schoolRow({ 학교ID: "폐1", 운영상태: "폐교" })],
      BOX,
    );
    expect(out).toEqual([]);
  });

  it("좌표가 없거나 0인 행은 담기지 않는다", () => {
    const out = buildElementarySchools(
      [
        schoolRow({ 학교ID: "없1", 위도: "" }),
        schoolRow({ 학교ID: "영1", 위도: "0", 경도: "0" }),
      ],
      BOX,
    );
    expect(out).toEqual([]);
  });

  it("상자 밖은 담기지 않는다", () => {
    const out = buildElementarySchools(
      [schoolRow({ 학교ID: "밖1", 위도: "35.1", 경도: "129.0" })],
      BOX,
    );
    expect(out).toEqual([]);
  });

  it("id 오름차순으로 정렬된다", () => {
    const out = buildElementarySchools(
      [schoolRow({ 학교ID: "B" }), schoolRow({ 학교ID: "A" })],
      BOX,
    );
    expect(out.map((s) => s.id)).toEqual(["A", "B"]);
  });
});

/**
 * 지도 참고 표시 전용(`ComplexMap.tsx`) — 위 초등학교와 같은 필터링
 * 로직(`schoolsAtLevel`)을 공유하므로 "학교급만 다르게 거른다"만 확인한다.
 * 나머지 규칙(운영 중인 것만·상자 안만·정렬)은 위에서 이미 확인했다.
 */
describe("중·고등학교도 같은 규칙으로 거른다 — 지도 참고 표시 전용", () => {
  it("buildMiddleSchools는 중학교만 남긴다", () => {
    const out = buildMiddleSchools(
      [
        schoolRow({ 학교ID: "초1" }),
        schoolRow({ 학교ID: "중1", 학교급구분: "중학교" }),
        schoolRow({ 학교ID: "고1", 학교급구분: "고등학교" }),
      ],
      BOX,
    );
    expect(out.map((s) => s.id)).toEqual(["중1"]);
  });

  it("buildHighSchools는 고등학교만 남긴다", () => {
    const out = buildHighSchools(
      [
        schoolRow({ 학교ID: "초1" }),
        schoolRow({ 학교ID: "중1", 학교급구분: "중학교" }),
        schoolRow({ 학교ID: "고1", 학교급구분: "고등학교" }),
      ],
      BOX,
    );
    expect(out.map((s) => s.id)).toEqual(["고1"]);
  });

  /**
   * 기본정보(설립·주소·교육청)를 실은 학교급은 초등학교 하나뿐이다 —
   * 학교급을 늘려 기본정보까지 붙이면 화면이 "학군"처럼 읽히기 시작한다
   * (`buildElementarySchools`의 주석 참고).
   */
  it("중·고등학교에는 기본정보를 붙이지 않는다 — 좌표 네 필드뿐이다", () => {
    const middle = buildMiddleSchools(
      [schoolRow({ 학교ID: "중1", 학교급구분: "중학교" })],
      BOX,
    );
    const high = buildHighSchools(
      [schoolRow({ 학교ID: "고1", 학교급구분: "고등학교" })],
      BOX,
    );
    expect(Object.keys(middle[0]!).sort()).toEqual(["id", "lat", "lon", "name"]);
    expect(Object.keys(high[0]!).sort()).toEqual(["id", "lat", "lon", "name"]);
  });
});

/**
 * 사용자 지시로 지도에서 초등학교 마커를 누르면 기본정보를 띄우게 되며
 * 실었다. **값은 원본이 준 그대로**여야 한다 — 이 단계가 만들거나
 * 추정하는 값이 하나도 없는지 확인한다.
 */
describe("초등학교 기본정보", () => {
  it("설립·교육청을 원본 그대로 싣는다", () => {
    const [school] = buildElementarySchools([schoolRow()], BOX);
    expect(school).toMatchObject({
      foundationType: "공립",
      foundedOn: "1984-05-23",
      officeOfEducation: "서울특별시교육청",
      districtOfficeOfEducation: "서울특별시강남서초교육지원청",
    });
  });

  it("주소는 도로명을 쓴다", () => {
    const [school] = buildElementarySchools([schoolRow()], BOX);
    expect(school?.address).toBe("서울특별시 강남구 테헤란로 1");
  });

  it("도로명주소가 비면 지번주소로 물러난다 — 원본에 실제로 그런 학교가 있다", () => {
    const [school] = buildElementarySchools(
      [schoolRow({ 소재지도로명주소: "" })],
      BOX,
    );
    expect(school?.address).toBe("서울특별시 강남구 대치동 1");
  });

  it("둘 다 비면 빈 문자열이다 — 없는 주소를 지어내지 않는다", () => {
    const [school] = buildElementarySchools(
      [schoolRow({ 소재지도로명주소: "", 소재지지번주소: "" })],
      BOX,
    );
    expect(school?.address).toBe("");
  });
});

describe("지하철역은 노선별 행 그대로 싣는다", () => {
  it("같은 이름의 역이 노선마다 따로 실린다 — 좌표가 실제로 다르다", () => {
    const out = buildSubwayStations(
      [
        stationRow({ 역번호: "D004", 노선번호: "A", 노선명: "가선", 역위도: "37.51" }),
        stationRow({ 역번호: "0337", 노선번호: "B", 노선명: "나선", 역위도: "37.52" }),
      ],
      BOX,
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((s) => s.name))).toEqual(new Set(["픽스처역"]));
    expect(new Set(out.map((s) => s.lineName))).toEqual(new Set(["가선", "나선"]));
  });

  it("모든 필드가 똑같은 완전 중복 행은 한 번만 실린다", () => {
    const out = buildSubwayStations([stationRow(), stationRow()], BOX);
    expect(out).toHaveLength(1);
  });

  it("역번호가 겹치는 다른 노선은 id가 갈린다", () => {
    // 원본의 역번호는 운영기관마다 따로 매겨져 있어 전국에서 유일하지 않다.
    const out = buildSubwayStations(
      [
        stationRow({ 역번호: "101", 노선번호: "S29", 노선명: "가선" }),
        stationRow({ 역번호: "101", 노선번호: "S30", 노선명: "나선", 역위도: "37.45" }),
      ],
      BOX,
    );
    expect(new Set(out.map((s) => s.id)).size).toBe(2);
  });

  it("노선번호·역번호까지 같은데 내용이 다른 행도 id가 갈린다", () => {
    const out = buildSubwayStations(
      [
        stationRow({ 역사명: "이수" }),
        stationRow({ 역사명: "총신대입구(이수)" }),
      ],
      BOX,
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((s) => s.id)).size).toBe(2);
  });

  it("같은 입력이면 언제나 같은 순서·같은 id가 나온다", () => {
    const rows = [
      stationRow({ 역사명: "나역", 역위도: "37.55" }),
      stationRow({ 역사명: "가역", 역위도: "37.45" }),
    ];
    const a = buildSubwayStations(rows, BOX);
    const b = buildSubwayStations([...rows].reverse(), BOX);
    expect(a).toEqual(b);
  });
});

describe("산출물 전체", () => {
  const config: LocationConfig = {
    targetBounds: BOX,
    subwayBufferMeters: 4000,
    elementarySchoolBufferMeters: 1500,
  };

  it("단지 좌표는 언제나 비어 있다", () => {
    // 지오코딩이 붙기 전까지 채울 수 있는 정직한 값이 없다.
    const file = buildLocationFile([schoolRow()], [stationRow()], config);
    expect(file.complexes).toEqual([]);
  });

  it("버퍼가 다르면 거르는 상자도 다르다 — 설정이 실제로 쓰인다", () => {
    const far = schoolRow({ 학교ID: "링1", 위도: "37.61", 경도: "127.1" });
    const tight = buildLocationFile([far], [stationRow()], {
      ...config,
      elementarySchoolBufferMeters: 100,
    });
    const loose = buildLocationFile([far], [stationRow()], {
      ...config,
      elementarySchoolBufferMeters: 3000,
    });
    expect(tight.elementarySchools).toEqual([]);
    expect(loose.elementarySchools.map((s) => s.id)).toEqual(["링1"]);
  });

  it("거른 결과가 비면 던진다 — 성공한 얼굴로 빈 파일을 내지 않는다", () => {
    const empty = buildLocationFile([], [], config);
    expect(() => assertNonEmpty(empty)).toThrow(/거른 결과가 비었습니다/);
  });

  it("역만 있고 학교가 없어도 던진다", () => {
    const half = buildLocationFile([], [stationRow()], config);
    expect(() => assertNonEmpty(half)).toThrow();
  });
});

describe("설정 파일 읽기", () => {
  it("실제 설정 파일을 읽는다", () => {
    const config = loadLocationConfig();
    expect(config.targetBounds.minLat).toBeLessThan(config.targetBounds.maxLat);
    expect(config.subwayBufferMeters).toBeGreaterThan(0);
    expect(config.elementarySchoolBufferMeters).toBeGreaterThan(0);
  });

  it("없는 파일이면 던진다", () => {
    expect(() => loadLocationConfig("있을 리 없는 경로.json")).toThrow();
  });
});
