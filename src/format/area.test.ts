import { describe, expect, it } from "vitest";
import { pyeongToSqm, SQM_PER_PYEONG, sqmToPyeong } from "./area";

describe("sqmToPyeong / pyeongToSqm", () => {
  it("1평은 약 3.305785㎡다", () => {
    expect(SQM_PER_PYEONG).toBeCloseTo(3.305785, 5);
  });

  it("84㎡는 약 25.4평이다 — 국민주택 규모의 통상 표기와 맞는다", () => {
    expect(sqmToPyeong(84)).toBeCloseTo(25.41, 1);
  });

  it("서로 역함수다", () => {
    expect(pyeongToSqm(sqmToPyeong(59.3))).toBeCloseTo(59.3, 6);
    expect(sqmToPyeong(pyeongToSqm(24))).toBeCloseTo(24, 6);
  });
});
