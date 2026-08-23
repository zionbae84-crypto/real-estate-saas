import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BARGAIN_MUST_BE_ALLOWED,
  BARGAIN_MUST_BE_CAUGHT,
  bargainClaimsIn,
  MUST_BE_ALLOWED,
  MUST_BE_CAUGHT,
  RATING_MUST_BE_ALLOWED,
  RATING_MUST_BE_CAUGHT,
  ratingClaimsIn,
  safetyClaimsIn,
} from "../../scripts/claims-safety";
import {
  assessLocation,
  EARTH_MEAN_RADIUS_M,
  type Coordinate,
  type ElementarySchool,
  type LocationAssessment,
  type LocationInput,
  type SubwayStation,
} from "../lib/location";
import { locationRules } from "../state/useLocationFacts";
import { LocationFacts, LocationFactsView } from "./LocationFacts";

const RADIUS = locationRules.elementarySchool.radiusMeters;

/** 픽스처는 전부 지어낸 것이고, 이름부터 그렇게 보이게 지었다 */
const BASE: Coordinate = { lat: 37.5, lon: 127.0 };
const METERS_PER_DEGREE_LAT = (EARTH_MEAN_RADIUS_M * Math.PI) / 180;

function north(meters: number): Coordinate {
  return { lat: BASE.lat + meters / METERS_PER_DEGREE_LAT, lon: BASE.lon };
}

function school(name: string, meters: number): ElementarySchool {
  return { id: `fixture-school-${name}`, name, coordinate: north(meters) };
}

function station(name: string, meters: number): SubwayStation {
  return {
    id: `fixture-station-${name}`,
    name,
    lineName: "픽스처선",
    coordinate: north(meters),
  };
}

function assess(overrides: Partial<LocationInput> = {}): LocationAssessment {
  return assessLocation(locationRules, {
    coordinate: BASE,
    subwayStations: [station("픽스처역 가", 400)],
    elementarySchools: [school("픽스처초등학교 가", 300)],
    ...overrides,
  });
}

function renderView(assessment: LocationAssessment) {
  return render(
    <LocationFactsView rules={locationRules} assessment={assessment} />,
  );
}

/** 화면에 실제로 그려진 글자 전부 */
function screenText(): string {
  return document.body.textContent ?? "";
}

/**
 * 화면이 그릴 수 있는 모든 상태.
 *
 * 좌표가 아직 없어 지금 앱에서는 첫 줄 하나밖에 볼 수 없지만, 좌표가
 * 들어오는 날 나머지가 처음으로 그려지면 그때 무엇이 빠졌는지 알게 된다.
 * 그래서 지금 다 그려 본다.
 */
const EVERY_STATE: Array<[string, LocationAssessment]> = [
  ["좌표를 모름", assess({ coordinate: null })],
  [
    "좌표는 알고 목록은 없음",
    assess({ subwayStations: null, elementarySchools: null }),
  ],
  [
    "반경 안에 학교 0곳",
    assess({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS * 3)] }),
  ],
  [
    "반경 안에 학교 여러 곳",
    assess({
      elementarySchools: [
        school("픽스처초등학교 가", 120),
        school("픽스처초등학교 나", 640),
      ],
    }),
  ],
  ["역이 아주 멂", assess({ subwayStations: [station("픽스처역 멀리", 9_000)] })],
];

describe("LocationFacts — 지금(좌표가 없는 상태)", () => {
  it("어느 단지든 '아직 위치를 몰라요'가 나온다", () => {
    render(<LocationFacts complexKey="11680-9001" />);
    expect(
      screen.getByText(locationRules.states.unlocated.label),
    ).toBeInTheDocument();
  });

  it("'주변에 아무것도 없다'로 읽히지 않는다", () => {
    const { container } = render(<LocationFacts complexKey="11680-9001" />);

    // 목록을 그릴 재료 자체가 없다 — 빈 목록은 언제나 가장 낙관적으로
    // 읽히므로, 이 상태에서 목록 요소가 하나도 없어야 한다.
    expect(container.querySelector(".location-fact-list")).toBeNull();
    expect(container.querySelectorAll(".location-fact")).toHaveLength(0);
    expect(container.querySelector(".location-school-list")).toBeNull();
    expect(container.querySelector(".location-distance")).toBeNull();

    // 대신 왜 못 쟀는지를 말한다.
    expect(screenText()).toContain(locationRules.states.unlocated.note);
  });

  it("'0곳'이라고 말하지 않는다", () => {
    render(<LocationFacts complexKey="11680-9001" />);
    const text = screenText();
    expect(text).not.toContain("0곳");
    expect(text).not.toContain("한 곳도 없");
  });

  it("좌표를 못 구했어도 고지 넷은 그대로 나온다", () => {
    render(<LocationFacts complexKey="11680-9001" />);
    const text = screenText();
    expect(text).toContain(locationRules.disclosure.straightLineNote);
    expect(text).toContain(locationRules.disclosure.schoolZoneNote);
    expect(text).toContain(locationRules.disclosure.missingFactorsNote);
    expect(text).toContain(locationRules.disclosure.notARatingNote);
  });

  it("존재하지 않는 단지 키에도 무너지지 않고 '모른다'로 간다", () => {
    render(<LocationFacts complexKey="없는-키" />);
    expect(
      screen.getByText(locationRules.states.unlocated.label),
    ).toBeInTheDocument();
  });
});

describe("LocationFacts — 직선거리 고지와 학구도 고지는 언제나 함께 나온다", () => {
  it.each(EVERY_STATE)("%s — 직선거리 고지가 있다", (_label, assessment) => {
    renderView(assessment);
    expect(screenText()).toContain(locationRules.disclosure.straightLineNote);
    // 문구가 실제로 그 사실을 말하는지도 함께 본다.
    expect(locationRules.disclosure.straightLineNote).toContain("직선");
    expect(locationRules.disclosure.straightLineNote).toContain("걸어");
  });

  it.each(EVERY_STATE)("%s — 학구도 고지가 있다", (_label, assessment) => {
    renderView(assessment);
    expect(screenText()).toContain(locationRules.disclosure.schoolZoneNote);
    expect(locationRules.disclosure.schoolZoneNote).toContain("배정");
    expect(locationRules.disclosure.schoolZoneNote).toContain("학구도");
  });

  it.each(EVERY_STATE)("%s — 나머지 고지 둘도 있다", (_label, assessment) => {
    renderView(assessment);
    const text = screenText();
    expect(text).toContain(locationRules.disclosure.missingFactorsNote);
    expect(text).toContain(locationRules.disclosure.notARatingNote);
  });

  it.each(EVERY_STATE)("%s — 면책 문구가 전부 있다", (_label, assessment) => {
    renderView(assessment);
    const text = screenText();
    for (const line of locationRules.disclaimer) {
      expect(text).toContain(line);
    }
  });
});

describe("LocationFacts — '모른다'가 '없다'로 접히지 않는다", () => {
  it("학교 목록을 못 실었으면 학교 목록을 그리지 않는다", () => {
    const { container } = renderView(assess({ elementarySchools: null }));
    expect(container.querySelector(".location-school-list")).toBeNull();
    expect(screenText()).toContain(
      locationRules.elementarySchool.messages.unknown
        .split("{radius}")
        .join(String(RADIUS)),
    );
  });

  it("반경 안에 0곳이면 '한 곳도 없었어요'라고 문장으로 말한다", () => {
    const { container } = renderView(
      assess({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS * 3)] }),
    );
    // 빈 <ol>을 그리지 않는다 — 빈 목록은 아무 말도 하지 않는다.
    expect(container.querySelector(".location-school-list")).toBeNull();
    expect(screenText()).toContain(
      locationRules.elementarySchool.messages.none
        .split("{radius}")
        .join(String(RADIUS)),
    );
  });

  it("'못 셌다'와 '0곳'이 화면에서 서로 다른 문장이다", () => {
    renderView(assess({ elementarySchools: null }));
    const unknownText = screenText();
    document.body.innerHTML = "";
    renderView(
      assess({ elementarySchools: [school("픽스처초등학교 멀리", RADIUS * 3)] }),
    );
    const noneText = screenText();
    expect(unknownText).not.toBe(noneText);
  });

  it("역 목록을 못 실었으면 역 이름 자리를 비우지 않고 이유를 말한다", () => {
    const { container } = renderView(assess({ subwayStations: null }));
    const subway = container.querySelector('[data-fact="subway"]');
    expect(subway).not.toBeNull();
    expect(subway?.querySelector(".location-distance")).toBeNull();
    expect(subway?.querySelector(".location-place-name")).toBeNull();
    expect(subway?.textContent).toContain(locationRules.subway.messages.unknown);
  });
});

describe("LocationFacts — 잰 값을 그리는 자리", () => {
  it("가장 가까운 역과 그 직선거리를 적는다", () => {
    renderView(assess({ subwayStations: [station("픽스처역 가", 420)] }));
    const text = screenText();
    expect(text).toContain("픽스처역 가");
    expect(text).toContain("420m");
  });

  it("거리 옆에 '직선거리'라는 말이 붙는다", () => {
    // 아래 고지가 같은 말을 다시 하지만, 숫자를 읽는 순간에 그 말이
    // 눈에 없으면 사용자는 숫자부터 기억한다.
    const { container } = renderView(
      assess({ subwayStations: [station("픽스처역 가", 420)] }),
    );
    const distance = container.querySelector(".location-distance");
    expect(distance?.textContent).toContain(locationRules.distanceLabel);
    expect(locationRules.distanceLabel).toContain("직선");
    expect(distance?.textContent).toContain("420m");
  });

  it("반경 안의 학교를 가까운 차례로 적는다", () => {
    const { container } = renderView(
      assess({
        elementarySchools: [
          school("픽스처초등학교 나", 640),
          school("픽스처초등학교 가", 120),
        ],
      }),
    );
    const names = [...container.querySelectorAll(".location-school")].map(
      (node) => node.querySelector(".location-place-name")?.textContent,
    );
    expect(names).toEqual(["픽스처초등학교 가", "픽스처초등학교 나"]);
  });

  it("도보 시간을 적지 않는다", () => {
    // 경로를 모르는 채로 분 단위를 적으면 사용자는 그것을 우리가 아는
    // 사실로 읽는다. 고지의 "걸어서 15분일 수도 있어요"는 반대 방향의
    // 말이라 지켜야 하므로, 약속하는 꼴만 겨눈다.
    renderView(assess());
    expect(screenText()).not.toMatch(/도보\s*\d+\s*분|걸어서\s*\d+\s*분(?!일)/);
  });
});

describe("LocationFacts — 등급을 말하지 않는다", () => {
  it("탐지기 셋이 잡아야 할 것을 잡고 놓아줄 것을 놓아준다(전제)", () => {
    for (const caught of MUST_BE_CAUGHT) {
      expect(safetyClaimsIn(caught), caught).not.toEqual([]);
    }
    for (const allowed of MUST_BE_ALLOWED) {
      expect(safetyClaimsIn(allowed), allowed).toEqual([]);
    }
    for (const caught of BARGAIN_MUST_BE_CAUGHT) {
      expect(bargainClaimsIn(caught), caught).not.toEqual([]);
    }
    for (const allowed of BARGAIN_MUST_BE_ALLOWED) {
      expect(bargainClaimsIn(allowed), allowed).toEqual([]);
    }
    for (const caught of RATING_MUST_BE_CAUGHT) {
      expect(ratingClaimsIn(caught), caught).not.toEqual([]);
    }
    for (const allowed of RATING_MUST_BE_ALLOWED) {
      expect(ratingClaimsIn(allowed), allowed).toEqual([]);
    }
  });

  it.each(EVERY_STATE)(
    "%s — 렌더 결과 전체가 점수·등급·순위를 말하지 않는다",
    (_label, assessment) => {
      renderView(assessment);
      const text = screenText();
      expect(text.length).toBeGreaterThan(100);
      expect(ratingClaimsIn(text)).toEqual([]);
    },
  );

  it.each(EVERY_STATE)(
    "%s — 렌더 결과 전체가 '안전'을 주장하지 않는다",
    (_label, assessment) => {
      renderView(assessment);
      expect(safetyClaimsIn(screenText())).toEqual([]);
    },
  );

  it.each(EVERY_STATE)(
    "%s — 렌더 결과 전체가 값을 매기지 않는다",
    (_label, assessment) => {
      renderView(assessment);
      expect(bargainClaimsIn(screenText())).toEqual([]);
    },
  );

  it("화면에 등급 문구를 심으면 탐지기가 잡아낸다(변이 검사)", () => {
    // 실제 렌더 결과가 통과한다는 사실만으로는 그물이 살아 있는지 알 수
    // 없다. 이 화면이 가장 미끄러지기 쉬운 문장을 직접 심어 본다.
    const poisoned: LocationAssessment = {
      ...assess(),
      stateNote: "역이 가까워서 교통이 우수해요.",
    };
    renderView(poisoned);
    expect(ratingClaimsIn(screenText())).not.toEqual([]);
  });
});

describe("LocationFacts — 색이 아니라 글자가 상태를 말한다", () => {
  it.each(EVERY_STATE)("%s — 상태가 글자로 적혀 있다", (_label, assessment) => {
    const { container } = renderView(assessment);
    const state = container.querySelector(".location-state");
    expect(state?.textContent).toBe(assessment.stateLabel);
    expect((state?.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("좌표를 모를 때와 알 때의 글자가 다르다", () => {
    expect(locationRules.states.unlocated.label).not.toBe(
      locationRules.states.located.label,
    );
  });
});

describe("LocationFacts — 주소를 화면에 내지 않는다", () => {
  it.each(EVERY_STATE)("%s — 지번 주소 꼴이 없다", (_label, assessment) => {
    renderView(assessment);
    // 지번 주소는 좌표를 얻는 입력으로만 쓴다. "반포동 612-2" 같은 꼴이
    // 화면에 나오면 안 된다.
    expect(screenText()).not.toMatch(/[가-힣]+(동|리|가)\s*\d+-\d+/);
    expect(screenText()).not.toMatch(/[가-힣]+로\s*\d+길/);
  });
});
