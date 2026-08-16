import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";

describe("parseRules", () => {
  it("실제 룰셋 파일을 통과시킨다", () => {
    const rules = parseRules(rawRules);
    expect(rules.version).toBe("2026-03");
    expect(rules.absoluteCap).toBe(600_000_000);
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

  it.each([
    ["ltv.default", { ltv: { default: 0, firstTimeBuyer: 0.7 } }],
    ["ltv.default", { ltv: { default: 1.2, firstTimeBuyer: 0.7 } }],
    ["ltv.firstTimeBuyer", { ltv: { default: 0.7, firstTimeBuyer: -0.1 } }],
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
});
