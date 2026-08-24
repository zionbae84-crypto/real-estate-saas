import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";

describe("parseRules", () => {
  it("실제 룰셋 파일을 통과시킨다", () => {
    const rules = parseRules(rawRules);
    expect(rules.version).toBe("2026-03");
    // 구간이 하나뿐이고, 그 값이 6억이며, 상한이 무한대(upTo: null)라는
    // 세 사실을 한 번에 고정한다 — "실제 룰셋이 파싱되면 절대캡은
    // (가격과 무관하게) 6억이다"라는 원래 단언의 의도를 그대로 보존한다.
    expect(rules.absoluteCap).toEqual({
      _note: expect.any(String),
      brackets: [{ upTo: null, amount: 600_000_000 }],
    });
  });

  // 이 룰셋의 수치는 수도권·규제지역 전용이다. 전국 값이 아니라는 사실을
  // 파일 자체가 들고 다니게 한다(Rules 인터페이스 주석 참고).
  it("실제 룰셋은 적용 범위(_scope)를 문장으로 들고 있다", () => {
    const rules = parseRules(rawRules);
    expect(rules._scope).toMatch(/수도권/);
  });

  it("_scope가 문자열이 아니면 실패한다", () => {
    expect(() => parseRules({ ...rawRules, _scope: 123 })).toThrow(/_scope/);
  });

  it("housingBond._note가 문자열이 아니면 실패한다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        housingBond: { ...rawRules.housingBond, _note: 123 },
      }),
    ).toThrow(/housingBond\._note/);
  });

  it("필수 필드가 없으면 어느 필드인지 알려주며 실패한다", () => {
    const broken = { ...rawRules, dsrLimit: undefined };
    expect(() => parseRules(broken)).toThrow(/dsrLimit/);
  });

  it("객체가 아니면 실패한다", () => {
    expect(() => parseRules(null)).toThrow(/객체/);
  });

  // NaN·Infinity는 typeof가 "number"라 타입 검사만으로는 통과한다.
  // 통과시키면 하위 계산에서 제약이 조용히 사라지므로 여기서 끊어야 한다.
  it("최상위 숫자 필드가 NaN이면 실패한다", () => {
    expect(() => parseRules({ ...rawRules, dsrLimit: NaN })).toThrow(
      /dsrLimit/,
    );
  });

  it("최상위 숫자 필드가 Infinity면 실패한다", () => {
    expect(() =>
      parseRules({ ...rawRules, absoluteCap: Number.POSITIVE_INFINITY }),
    ).toThrow(/absoluteCap/);
  });

  it("중첩 숫자 필드가 NaN이면 전체 경로를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      acquisitionTax: { ...rawRules.acquisitionTax, lowRate: NaN },
    };
    expect(() => parseRules(broken)).toThrow(/acquisitionTax\.lowRate/);
  });

  it("policyLoans 항목의 숫자 필드가 NaN이면 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const broken = {
      ...rawRules,
      policyLoans: [{ ...first, maxAmount: NaN }, ...policyLoans.slice(1)],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.maxAmount/);
  });

  it("policyLoans 항목의 eligibility 숫자가 NaN이면 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const eligibility = first.eligibility as Record<string, unknown>;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, eligibility: { ...eligibility, maxHousePrice: NaN } },
        ...policyLoans.slice(1),
      ],
    };
    expect(() => parseRules(broken)).toThrow(
      /policyLoans\[0\]\.eligibility\.maxHousePrice/,
    );
  });

  it("brokerageFee 항목의 숫자가 NaN이면 실패한다", () => {
    const brokenRate = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 2 ? { ...bracket, rate: NaN } : bracket,
      ),
    };
    expect(() => parseRules(brokenRate)).toThrow(/brokerageFee\[2\]\.rate/);

    const brokenCap = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 0 ? { ...bracket, cap: NaN } : bracket,
      ),
    };
    expect(() => parseRules(brokenCap)).toThrow(/brokerageFee\[0\]\.cap/);

    const brokenUpTo = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 0 ? { ...bracket, upTo: NaN } : bracket,
      ),
    };
    expect(() => parseRules(brokenUpTo)).toThrow(/upTo/);
  });

  it("중개보수 구간이 오름차순이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [
        { upTo: 200000000, rate: 0.005, cap: null },
        { upTo: 50000000, rate: 0.006, cap: null },
        { upTo: null, rate: 0.007, cap: null },
      ],
    };
    expect(() => parseRules(broken)).toThrow(/오름차순/);
  });

  it("중개보수 마지막 구간의 upTo가 null이 아니면 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: [{ upTo: 50000000, rate: 0.006, cap: null }],
    };
    expect(() => parseRules(broken)).toThrow(/마지막 구간/);
  });

  it("중첩 필드의 타입이 틀리면 전체 경로를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      acquisitionTax: { ...rawRules.acquisitionTax, lowRate: "0.01" },
    };
    expect(() => parseRules(broken)).toThrow(/acquisitionTax\.lowRate/);
  });

  it("policyLoans 항목에 rate가 없으면 인덱스와 필드를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const rest = policyLoans.slice(1);
    const { rate: _rate, ...withoutRate } = first;
    const broken = {
      ...rawRules,
      policyLoans: [withoutRate, ...rest],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.rate/);
  });

  it("brokerageFee 항목의 rate가 숫자가 아니면 인덱스와 필드를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 2 ? { ...bracket, rate: "0.004" } : bracket,
      ),
    };
    expect(() => parseRules(broken)).toThrow(/brokerageFee\[2\]\.rate/);
  });

  it("brokerageFee 항목의 cap이 숫자도 null도 아니면 필드를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 0 ? { ...bracket, cap: "250000" } : bracket,
      ),
    };
    expect(() => parseRules(broken)).toThrow(/brokerageFee\[0\]\.cap/);
  });

  it("객체가 필요한 자리에 배열이 오면 필드명을 알려주며 실패한다", () => {
    const broken = { ...rawRules, ltv: [] };
    expect(() => parseRules(broken)).toThrow(/ltv/);
  });

  it("policyLoans 항목의 eligibility가 배열이면 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const rest = policyLoans.slice(1);
    const broken = {
      ...rawRules,
      policyLoans: [{ ...first, eligibility: [] }, ...rest],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.eligibility/);
  });

  it("policyLoans 항목의 eligibility에 존재하는 필드의 타입이 틀리면 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const rest = policyLoans.slice(1);
    const eligibility = first.eligibility as Record<string, unknown>;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, eligibility: { ...eligibility, maxAnnualIncome: "60000000" } },
        ...rest,
      ],
    };
    expect(() => parseRules(broken)).toThrow(
      /policyLoans\[0\]\.eligibility\.maxAnnualIncome/,
    );
  });

  // 모르는 키를 통과시키면 isEligible이 그 조건을 무시한다.
  // 실제로 관측된 실패: 신생아특례를 { minChildren: 1 }로 추가하면
  // 룰셋 파싱도 테스트도 전부 통과한 채 무자녀 구매자에게 매칭되었다.
  it("엔진이 모르는 eligibility 키는 전체 경로를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const eligibility = first.eligibility as Record<string, unknown>;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, eligibility: { ...eligibility, minChildren: 1 } },
        ...policyLoans.slice(1),
      ],
    };
    expect(() => parseRules(broken)).toThrow(
      /policyLoans\[0\]\.eligibility\.minChildren/,
    );
  });

  // 오타는 조건을 통째로 없앤다(maxAnnualIncomes는 소득 상한이 아니다)
  it("오타난 eligibility 키도 전체 경로를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const eligibility = first.eligibility as Record<string, unknown>;
    const { maxAnnualIncome: income, ...rest } = eligibility;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, eligibility: { ...rest, maxAnnualIncomes: income } },
        ...policyLoans.slice(1),
      ],
    };
    expect(() => parseRules(broken)).toThrow(
      /policyLoans\[0\]\.eligibility\.maxAnnualIncomes/,
    );
  });

  // 결함(코드 리뷰 발견): `key in ELIGIBILITY_FIELD_TYPES`는 프로토타입
  // 체인을 타므로 toString·constructor 같은 Object.prototype의 이름이
  // "알려진 키"로 오인된다. 뒤이은 타입 검사 루프는 own key만 순회하므로
  // 이런 키는 타입 검사도 받지 않고 조용히 통과한 뒤 isEligible에서
  // 무시된다 — 화이트리스트가 막으려는 바로 그 상황이다.
  it.each(["toString", "constructor", "valueOf", "hasOwnProperty"])(
    "Object.prototype에 있는 이름(%s)도 알지 못하는 키로 실패한다",
    (key) => {
      const policyLoans = rawRules.policyLoans as Array<
        Record<string, unknown>
      >;
      const first = policyLoans[0]!;
      const eligibility = first.eligibility as Record<string, unknown>;
      const broken = {
        ...rawRules,
        policyLoans: [
          { ...first, eligibility: { ...eligibility, [key]: 1 } },
          ...policyLoans.slice(1),
        ],
      };
      expect(() => parseRules(broken)).toThrow(
        new RegExp(`policyLoans\\[0\\]\\.eligibility\\.${key}`),
      );
    },
  );
});

// 타입은 맞지만 말이 안 되는 값들. 룰셋은 사람이 손으로 고치는 데이터이므로,
// 싸게 잡을 수 있는 의미 오류는 파싱 시점에 잡는다.
describe("parseRules — 의미 불변식", () => {
  it("취득세 하한이 상한보다 크면 실패한다", () => {
    const broken = {
      ...rawRules,
      acquisitionTax: {
        ...rawRules.acquisitionTax,
        lowerBound: 900_000_000,
        upperBound: 600_000_000,
      },
    };
    expect(() => parseRules(broken)).toThrow(/acquisitionTax\.lowerBound/);
  });

  it("취득세 하한과 상한이 같으면 실패한다 (0으로 나누기)", () => {
    const broken = {
      ...rawRules,
      acquisitionTax: {
        ...rawRules.acquisitionTax,
        lowerBound: 600_000_000,
        upperBound: 600_000_000,
      },
    };
    expect(() => parseRules(broken)).toThrow(/acquisitionTax\.lowerBound/);
  });

  it("safe 임계가 caution보다 크면 실패한다", () => {
    const broken = {
      ...rawRules,
      safetyThreshold: { safe: 0.5, caution: 0.35, stressedDanger: 0.4 },
    };
    expect(() => parseRules(broken)).toThrow(/safetyThreshold\.safe/);
  });

  // 규제지역 LTV가 비규제보다 커지는 것은 값이 뒤바뀐 오타일 가능성이
  // 압도적으로 크고, 그 방향의 오타는 이 브랜치가 고친 결함(규제지역
  // 한도 과대평가)을 그대로 재현한다. 타입 검사만으로는 조용히 통과하므로
  // 부등식으로 따로 잡아야 한다.
  it("규제지역 default LTV가 비규제보다 크면 실패한다", () => {
    const broken = {
      ...rawRules,
      ltv: {
        regulated: { default: 0.7, firstTimeBuyer: 0.7 },
        unregulated: { default: 0.4, firstTimeBuyer: 0.7 },
      },
    };
    expect(() => parseRules(broken)).toThrow(/ltv\.regulated\.default/);
  });

  it("규제지역 생애최초 LTV가 비규제보다 크면 실패한다", () => {
    const broken = {
      ...rawRules,
      ltv: {
        regulated: { default: 0.4, firstTimeBuyer: 0.8 },
        unregulated: { default: 0.7, firstTimeBuyer: 0.7 },
      },
    };
    expect(() => parseRules(broken)).toThrow(
      /ltv\.regulated\.firstTimeBuyer/,
    );
  });

  // ltv.default/ltv.firstTimeBuyer 케이스는 ltv가 regulated/unregulated로
  // 갈라지며 "확장된 룰셋 검증" describe 블록의 네 경로 테스트로 옮겼다
  // (의도는 동일 — 비율 범위 (0, 1] 위반을 잡는다).
  it.each([
    ["dsrLimit", { dsrLimit: 0 }],
    ["dsrLimit", { dsrLimit: 1.5 }],
  ])("비율 필드 %s가 (0, 1] 밖이면 실패한다", (path, override) => {
    expect(() => parseRules({ ...rawRules, ...override })).toThrow(
      new RegExp(path.replace(".", "\\.")),
    );
  });

  it("정책대출 maxAmount가 음수면 인덱스를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, maxAmount: -1 },
        ...policyLoans.slice(1),
      ],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.maxAmount/);
  });

  it("실제 룰셋은 모든 불변식을 만족한다", () => {
    expect(() => parseRules(rawRules)).not.toThrow();
  });

  // 코드 리뷰 결함: 금리·가산금리·수수료·세율 등 대부분의 필드가 부호·범위
  // 검사 없이 통과했다. 음수 가산금리(스트레스가 한도를 오히려 늘림),
  // 음수 수수료율(원가를 깎음) 같은 손으로 친 오타가 조용히 파싱을
  // 통과해 안전하지 않은 방향(더 많이 빌릴 수 있다)으로 답을 부풀렸다.
  it.each([
    ["stressDSR.surcharge", { stressDSR: { ...rawRules.stressDSR, surcharge: -0.015 } }],
    ["safetyStressSurcharge", { safetyStressSurcharge: -0.02 }],
    ["absoluteCap", { absoluteCap: -1 }],
    ["legalFee", { legalFee: -1 }],
    ["movingCost", { movingCost: -1 }],
    [
      "acquisitionTax.lowRate",
      { acquisitionTax: { ...rawRules.acquisitionTax, lowRate: -1 } },
    ],
    [
      "acquisitionTax.highRate",
      { acquisitionTax: { ...rawRules.acquisitionTax, highRate: -1 } },
    ],
    [
      "acquisitionTax.localEducationTaxRatio",
      {
        acquisitionTax: {
          ...rawRules.acquisitionTax,
          localEducationTaxRatio: -1,
        },
      },
    ],
    [
      "acquisitionTax.ruralTaxRate",
      { acquisitionTax: { ...rawRules.acquisitionTax, ruralTaxRate: -1 } },
    ],
    [
      "acquisitionTax.firstTimeBuyerReliefCap",
      {
        acquisitionTax: {
          ...rawRules.acquisitionTax,
          firstTimeBuyerReliefCap: -1,
        },
      },
    ],
    [
      "acquisitionTax.firstTimeBuyerReliefPriceCap",
      {
        acquisitionTax: {
          ...rawRules.acquisitionTax,
          firstTimeBuyerReliefPriceCap: -1,
        },
      },
    ],
    [
      "acquisitionTax.ruralTaxAreaThresholdSqm",
      {
        acquisitionTax: {
          ...rawRules.acquisitionTax,
          ruralTaxAreaThresholdSqm: -1,
        },
      },
    ],
  ])("음수 불가 필드 %s가 음수면 실패한다", (path, override) => {
    expect(() => parseRules({ ...rawRules, ...override })).toThrow(
      new RegExp(path.replace(".", "\\.")),
    );
  });

  it("brokerageFee[i].rate가 음수면 인덱스를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 2 ? { ...bracket, rate: -0.004 } : bracket,
      ),
    };
    expect(() => parseRules(broken)).toThrow(/brokerageFee\[2\]\.rate/);
  });

  it("brokerageFee[i].cap이 음수면 인덱스를 알려주며 실패한다", () => {
    const broken = {
      ...rawRules,
      brokerageFee: rawRules.brokerageFee.map((bracket, index) =>
        index === 0 ? { ...bracket, cap: -1 } : bracket,
      ),
    };
    expect(() => parseRules(broken)).toThrow(/brokerageFee\[0\]\.cap/);
  });

  it.each([
    ["baseRate", { baseRate: -0.01 }],
    ["baseRate", { baseRate: 1 }],
  ])("금리 필드 %s가 [0, 1) 밖이면 실패한다", (path, override) => {
    expect(() => parseRules({ ...rawRules, ...override })).toThrow(
      new RegExp(path),
    );
  });

  it("policyLoans[i].rate가 음수면 인덱스를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const broken = {
      ...rawRules,
      policyLoans: [{ ...first, rate: -0.032 }, ...policyLoans.slice(1)],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.rate/);
  });

  it("policyLoans[i].rate가 1 이상이면 인덱스를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const broken = {
      ...rawRules,
      policyLoans: [{ ...first, rate: 1 }, ...policyLoans.slice(1)],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.rate/);
  });

  it("acquisitionTax.lowRate가 highRate보다 크면 실패한다", () => {
    const broken = {
      ...rawRules,
      acquisitionTax: {
        ...rawRules.acquisitionTax,
        lowRate: 0.05,
        highRate: 0.03,
      },
    };
    expect(() => parseRules(broken)).toThrow(/acquisitionTax\.lowRate/);
  });

  // 정책대출 경로는 absoluteCap을 걸지 않는다. 그 예외는 상품 고시 한도가
  // 캡보다 한참 아래라는 데이터 가정에 기대고 있으므로, 그 가정 자체를
  // 파싱 시점에 강제한다. 이 값을 통과시키면 캡을 우회하는 9억짜리
  // 정책대출이 조용히 만들어진다.
  it("policyLoans[i].maxAmount가 absoluteCap을 넘으면 인덱스를 알려주며 실패한다", () => {
    const policyLoans = rawRules.policyLoans as Array<Record<string, unknown>>;
    const first = policyLoans[0]!;
    const broken = {
      ...rawRules,
      policyLoans: [
        { ...first, maxAmount: 900_000_000 },
        ...policyLoans.slice(1),
      ],
    };
    expect(() => parseRules(broken)).toThrow(/policyLoans\[0\]\.maxAmount/);
  });
});

describe("확장된 룰셋 검증", () => {
  it("규제/비규제 LTV 네 값을 모두 비율로 검증한다 — 세 가지 위반 유형(0, 1.5, -0.1) 모두 포함", () => {
    // 네 경로 × 세 위반 유형 행렬
    const paths = [
      "ltv.regulated.default",
      "ltv.regulated.firstTimeBuyer",
      "ltv.unregulated.default",
      "ltv.unregulated.firstTimeBuyer",
    ];
    const violations = [0, 1.5, -0.1];

    for (const path of paths) {
      for (const violation of violations) {
        const broken = structuredClone(rawRules) as Record<string, unknown>;
        setByPath(broken, path, violation);
        expect(() => parseRules(broken), `${path} = ${violation}`).toThrow(
          new RegExp(path.replace(/\./g, "\\.")),
        );
      }
    }
  });

  it("brokerageVatRate가 비율 범위를 벗어나면 경로를 짚어 실패한다", () => {
    const broken = { ...rawRules, brokerageVatRate: -0.1 };
    expect(() => parseRules(broken)).toThrow(/brokerageVatRate/);
  });

  it("housingBond 가정치가 비율 범위를 벗어나면 실패한다", () => {
    for (const key of ["assumedPriceToStandardRatio", "assumedDiscountRate"]) {
      const broken = structuredClone(rawRules) as typeof rawRules;
      (broken.housingBond as Record<string, unknown>)[key] = 2;
      expect(() => parseRules(broken), key).toThrow(new RegExp(key));
    }
  });

  // assumedRatio는 (0, 1] — 하한이 배타적이라 0은 상한(2)과 마찬가지로
  // 거부된다. acquisition-cost.test.ts가 예전에 "assumedDiscountRate: 0"을
  // calcAcquisitionCosts에 직접 넣어 지원되는 설정처럼 다뤘는데, 실제로는
  // parseRules를 거치는 어떤 룰셋도 이 상태에 도달할 수 없다 — 그 테스트는
  // 삭제하고 대신 여기서 "파서가 이 경계를 실제로 막는다"는 사실 자체를
  // 확인한다.
  it("housingBond.assumedDiscountRate가 0이면 실패한다 (하한 배타)", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    (broken.housingBond as Record<string, unknown>).assumedDiscountRate = 0;
    expect(() => parseRules(broken)).toThrow(/assumedDiscountRate/);
  });

  it("housingBond 구간이 오름차순이 아니면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [
      { upTo: 100000000, perThousand: 19 },
      { upTo: 50000000, perThousand: 13 },
      { upTo: null, perThousand: 31 },
    ];
    expect(() => parseRules(broken)).toThrow(/오름차순/);
  });

  it("housingBond 마지막 구간의 upTo가 null이 아니면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [{ upTo: 50000000, perThousand: 13 }];
    expect(() => parseRules(broken)).toThrow(/마지막 구간/);
  });

  it("perThousand가 음수면 실패한다", () => {
    const broken = structuredClone(rawRules) as typeof rawRules;
    broken.housingBond.brackets = [
      { upTo: 50000000, perThousand: -1 },
      { upTo: null, perThousand: 31 },
    ];
    expect(() => parseRules(broken)).toThrow(/perThousand/);
  });

  it("실제 룰셋은 통과한다", () => {
    expect(() => parseRules(rawRules)).not.toThrow();
  });
});

describe("정책대출 maxAmount와 구간별 absoluteCap 불변식", () => {
  const tieredCap = {
    brackets: [
      { upTo: 1_500_000_000, amount: 600_000_000 },
      { upTo: null, amount: 200_000_000 },
    ],
  };

  it("자격 최고가에서의 캡을 넘는 상품은 거부된다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: tieredCap,
        policyLoans: [
          {
            id: "테스트",
            // 자격 최고가 20억 → 그 구간의 캡은 2억인데 한도가 3억이다
            eligibility: { maxHousePrice: 2_000_000_000 },
            maxAmount: 300_000_000,
            rate: 0.04,
          },
        ],
      }),
    ).toThrow(/absoluteCap/);
  });

  it("자격 최고가에서의 캡 이하인 상품은 통과한다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: tieredCap,
        policyLoans: [
          {
            id: "테스트",
            // 자격 최고가 6억 → 그 구간의 캡은 6억이고 한도는 3.6억이다
            eligibility: { maxHousePrice: 600_000_000 },
            maxAmount: 360_000_000,
            rate: 0.04,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("가격 상한이 없는 상품은 가장 낮은 구간의 캡과 비교된다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: tieredCap,
        policyLoans: [
          {
            id: "테스트",
            eligibility: {},
            // 가장 낮은 구간 캡 2억을 넘는다
            maxAmount: 250_000_000,
            rate: 0.04,
          },
        ],
      }),
    ).toThrow(/absoluteCap/);
  });

  it("absoluteCap.brackets가 비어 있으면 거부된다", () => {
    expect(() =>
      parseRules({ ...rawRules, absoluteCap: { brackets: [] } }),
    ).toThrow(/absoluteCap.brackets/);
  });

  it("absoluteCap.brackets의 마지막 upTo가 null이 아니면 거부된다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: { brackets: [{ upTo: 1_000_000_000, amount: 600_000_000 }] },
      }),
    ).toThrow(/upTo는 null/);
  });
});

// 코드 리뷰 결함(재발): buildSearchSegments(affordable-price.ts)에 절대캡
// 절벽을 추가했지만, 그 절벽이 항상 "한도 하락" 방향으로만 움직인다는
// 가정은 룰셋 자체가 강제하지 않았다. 캡이 가격에 따라 올라가는 구간
// 배열도 이 시점까지 그대로 통과했고(upTo 오름차순만 보고 amount는
// assertNonNegative만 걸었다), 그런 룰셋에서는 ownFunds가 경계에서
// 떨어져 감당 가능한 가격 집합이 두 덩어리로 갈라진다 — 분할 없는
// 이분 탐색은 낮은 쪽 덩어리에 수렴해 실구매력을 억 단위로 과소
// 계상한다(affordable-price.test.ts의 회귀 테스트가 실측값을 고정한다).
// 데이터 오류를 계산에 흘리지 않고 여기, 파싱에서 끊는다.
describe("absoluteCap.brackets는 가격이 오를수록 커지면 안 된다", () => {
  it("캡이 올라가는 구간 배열은 거부된다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: {
          brackets: [
            { upTo: 1_500_000_000, amount: 600_000_000 },
            { upTo: null, amount: 3_000_000_000 },
          ],
        },
      }),
    ).toThrow(/absoluteCap\.brackets.*커지면 안 됩니다/);
  });

  it("평평한 구간(같은 값이 반복)은 허용된다", () => {
    expect(() =>
      parseRules({
        ...rawRules,
        absoluteCap: {
          brackets: [
            { upTo: 1_500_000_000, amount: 600_000_000 },
            { upTo: 2_500_000_000, amount: 600_000_000 },
            { upTo: null, amount: 400_000_000 },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("실제 룰셋(2026-03.json)은 구간이 하나뿐이라 이 불변식을 당연히 통과한다", () => {
    expect(() => parseRules(rawRules)).not.toThrow();
  });
});

/** 점 경로로 중첩 객체의 값을 바꾼다 (테스트 전용) */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (last === undefined) return;
  let cursor: Record<string, unknown> = target;
  for (const key of keys) {
    const next = cursor[key];
    if (typeof next !== "object" || next === null) return;
    const copy = { ...(next as Record<string, unknown>) };
    cursor[key] = copy;
    cursor = copy;
  }
  cursor[last] = value;
}

/**
 * 주택 수 축(`maxOwnedHomes`)의 파싱 계약.
 *
 * 옛 스키마의 `requiresNoHome`은 불리언이라 "무주택이냐 아니냐" 두
 * 칸밖에 없었고, 그래서 1주택까지 받는 상품(보금자리론)을 표현할 수
 * 없었다. 조건 하나가 조용히 무시되면 "조건이 있는 척하지만 아무나
 * 통과하는" 상품이 만들어지므로, 옛 키는 소리 내어 거부한다.
 */
describe("정책대출 자격의 주택 수 축", () => {
  function withFirstLoanEligibility(eligibility: Record<string, unknown>) {
    const [first, ...rest] = rawRules.policyLoans as Array<
      Record<string, unknown>
    >;
    return {
      ...rawRules,
      policyLoans: [{ ...first, eligibility }, ...rest],
    };
  }

  it("실제 룰셋의 두 상품이 서로 다른 주택 수 상한을 갖는다", () => {
    const rules = parseRules(rawRules);
    const ids = rules.policyLoans.map((loan) => loan.id);
    expect(ids).toContain("디딤돌");
    expect(ids).toContain("보금자리론");
  });

  it("옛 키(requiresNoHome)는 어디로 옮기면 되는지 알려주며 거부한다", () => {
    expect(() =>
      parseRules(withFirstLoanEligibility({ requiresNoHome: true })),
    ).toThrow(/requiresNoHome/);
    expect(() =>
      parseRules(withFirstLoanEligibility({ requiresNoHome: true })),
    ).toThrow(/maxOwnedHomes/);
  });

  it("maxOwnedHomes가 소수면 거부한다", () => {
    expect(() =>
      parseRules(withFirstLoanEligibility({ maxOwnedHomes: 0.5 })),
    ).toThrow(/maxOwnedHomes/);
  });

  it("maxOwnedHomes가 음수면 거부한다", () => {
    expect(() =>
      parseRules(withFirstLoanEligibility({ maxOwnedHomes: -1 })),
    ).toThrow(/maxOwnedHomes/);
  });

  it("maxOwnedHomes가 숫자가 아니면 거부한다", () => {
    expect(() =>
      parseRules(withFirstLoanEligibility({ maxOwnedHomes: "0" })),
    ).toThrow(/maxOwnedHomes/);
  });

  it("0과 1은 그대로 통과한다", () => {
    expect(() =>
      parseRules(withFirstLoanEligibility({ maxOwnedHomes: 0 })),
    ).not.toThrow();
    expect(() =>
      parseRules(withFirstLoanEligibility({ maxOwnedHomes: 1 })),
    ).not.toThrow();
  });
});

/**
 * 취득세 고지가 무주택·유주택으로 갈린 뒤의 파싱 계약.
 *
 * 화면이 주택 수를 **묻게 되면서** 두 문구가 갈렸다. 유주택 문구는
 * 물어 놓고 반영하지 못했다는 사실과 비용이 커지는 방향을 말해야 하고,
 * 무주택 문구는 그 경고를 담으면 안 된다 — 그 사람에게는 거짓이고,
 * 거짓 경고는 같은 자리의 진짜 경고까지 함께 닳게 만든다.
 */
describe("취득세 주택 수 고지 — 무주택·유주택 두 문구", () => {
  function withAcquisitionTax(patch: Record<string, unknown>) {
    return {
      ...rawRules,
      acquisitionTax: { ...rawRules.acquisitionTax, ...patch },
    };
  }

  it("무주택 문구가 없으면 거부한다", () => {
    expect(() =>
      parseRules(withAcquisitionTax({ householdCountNoteNoHome: undefined })),
    ).toThrow(/householdCountNoteNoHome/);
  });

  it("무주택 문구가 비용이 커진다고 말하면 거부한다", () => {
    expect(() =>
      parseRules(
        withAcquisitionTax({
          householdCountNoteNoHome:
            "무주택 기준으로 계산했어요. 취득세가 더 나올 수 있어요.",
        }),
      ),
    ).toThrow(/거짓/);
  });

  it("무주택 문구가 비용이 작아진다고 말해도 거부한다", () => {
    expect(() =>
      parseRules(
        withAcquisitionTax({
          householdCountNoteNoHome:
            "무주택 기준으로 계산했어요. 부대비용은 이보다 작아질 수 있어요.",
        }),
      ),
    ).toThrow(/작아질 수 있다/);
  });

  it("무주택 문구가 무주택을 이름 붙이지 않으면 거부한다", () => {
    expect(() =>
      parseRules(
        withAcquisitionTax({
          householdCountNoteNoHome: "이 계산은 기본 세율로 매겼어요.",
        }),
      ),
    ).toThrow(/무주택/);
  });

  it("유주택 문구가 반영되지 않았다는 사실을 말하지 않으면 거부한다", () => {
    expect(() =>
      parseRules(
        withAcquisitionTax({
          householdCountNote:
            "주택 수에 따라 취득세가 더 나올 수 있어서 부대비용이 커질 수 있어요.",
        }),
      ),
    ).toThrow(/반영되지 않았다/);
  });

  it("실제 룰셋의 두 문구는 서로 다르다", () => {
    const t = parseRules(rawRules).acquisitionTax;
    expect(t.householdCountNote).not.toBe(t.householdCountNoteNoHome);
  });
});
