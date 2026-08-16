import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { parseRules } from "./rules";

describe("parseRules", () => {
  it("실제 룰셋 파일을 통과시킨다", () => {
    const rules = parseRules(rawRules);
    expect(rules.version).toBe("2026-03");
    expect(rules.absoluteCap).toBe(600_000_000);
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
});
