import { describe, expect, it } from "vitest";
import rawRules from "../../../rules/2026-03.json";
import { calcAcquisitionCosts } from "./acquisition-cost";
import { calcAffordablePrice, PRICE_STEP } from "./affordable-price";
import { calcAvailableCash } from "./available-cash";
import { calcMaxLoan } from "./loan-limit";
import { matchPolicyLoans } from "./policy-loans";
import { parseRules } from "./rules";
import type { BuyerProfile, Rules } from "./types";

const rules = parseRules(rawRules);

// affordable-price.ts의 내부 상수와 동일한 값. 탐색 상한은 공개 계약이
// 아니므로 export하지 않고 여기서만 복제한다.
const SEARCH_UPPER_BOUND = 10_000_000_000;
/** 브루트포스 스캔의 상한. 아래 테스트가 이 값에 잘리지 않음을 검증한다 */
const BRUTE_FORCE_CEILING = 900_000_000;

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    status: "무주택",
    cash: 200_000_000,
    annualIncome: 100_000_000,
    existingDebtAnnualPayment: 0,
    isFirstTimeBuyer: false,
    exclusiveAreaSqm: 84,
    // 이 파일의 기존 테스트는 전부 비규제 수도권 70% 기준으로 쓰였다.
    // 기본값을 false로 둬 기존 기대값이 그대로 유지되게 한다.
    isRegulatedArea: false,
    ...overrides,
  };
}

/**
 * 해당 매매가에서 사용자가 현금으로 내야 하는 총액. 매 가격마다 정직하게
 * 재계산한다. 정책대출 한도는 calcMaxLoan이 가격에서 직접 도출하므로
 * 이 헬퍼가 따로 넘길 값이 없다 — 엔진과 같은 모델을 쓰게 된다.
 */
function ownFundsAt(price: number, p: BuyerProfile, r: Rules): number {
  const loan = calcMaxLoan(p, r, price);
  const costs = calcAcquisitionCosts(price, p, r);
  return price - loan.amount + costs.total;
}

/** [from, to] 구간을 PRICE_STEP 그리드로 훑어 실제 감당 가능한 최대가를 브루트포스로 찾는다. */
function bruteForceMax(
  p: BuyerProfile,
  r: Rules,
  cashAmount: number,
  from: number,
  to: number,
): number {
  let best = 0;
  for (let price = from; price <= to; price += PRICE_STEP) {
    if (ownFundsAt(price, p, r) <= cashAmount) best = price;
  }
  return best;
}

const cliffSpanningProfiles: Array<[string, BuyerProfile]> = [
  [
    "연소득 65,000,000 (보금자리론만 해당, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 65_000_000 }),
  ],
  [
    "연소득 68,000,000 (보금자리론만 해당, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 68_000_000 }),
  ],
  [
    "연소득 70,000,000 (보금자리론 상한, 절벽 1개)",
    profile({ cash: 220_000_000, annualIncome: 70_000_000 }),
  ],
  [
    "연소득 50,000,000 (디딤돌+보금자리론, 절벽 2개)",
    profile({ cash: 220_000_000, annualIncome: 50_000_000 }),
  ],
  [
    "연소득 80,000,000 (정책대출 대상 밖, 절벽 없음)",
    profile({ cash: 220_000_000, annualIncome: 80_000_000 }),
  ],
];

describe("calcAffordablePrice", () => {
  // 두 테스트 모두 ownFundsAt(=엔진과 동일한 모델)로 재계산한다.
  // 예전에는 정책대출 한도를 빠뜨린 calcMaxLoan 호출로 검증해, 엔진이
  // 실제로 쓰는 숫자와 다른 값을 확인하고 있었다.
  it("결과 가격에서 자기부담금이 가용현금을 넘지 않는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    expect(ownFundsAt(result.affordablePrice, profile(), rules)).toBeLessThanOrEqual(
      result.availableCash,
    );
  });

  it("백만원만 더 비싸도 예산을 넘는 경계값을 찾는다", () => {
    const result = calcAffordablePrice(profile(), rules);
    const overPrice = result.affordablePrice + 1_000_000;
    expect(ownFundsAt(overPrice, profile(), rules)).toBeGreaterThan(
      result.availableCash,
    );
  });

  it("현금이 많을수록 실구매력이 커진다", () => {
    const poor = calcAffordablePrice(profile({ cash: 100_000_000 }), rules);
    const rich = calcAffordablePrice(profile({ cash: 400_000_000 }), rules);
    expect(rich.affordablePrice).toBeGreaterThan(poor.affordablePrice);
  });

  it("소득이 낮으면 DSR에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 500_000_000, annualIncome: 30_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("DSR");
  });

  it("현금과 소득이 모두 많으면 6억 캡에 걸린다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 2_000_000_000, annualIncome: 500_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("CAP");
  });

  // 결함 수정(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 직전 모델은
  // 정책 경로에 상품 고시 한도만 적용해, 무소득·무현금 구매자에게
  // 실구매력 354,500,000 · 대출 360,000,000(binding POLICY)을 제시했다.
  // 정책대출은 심사 면제가 아니라 금리 우대이므로 상환능력(DSR)과
  // 담보가치(LTV)의 제약을 함께 받는다 — 연소득 0이면 정책 DSR도 0이다.
  it("무소득·무현금이면 정책대출 자격이 있어도 실구매력이 0이다", () => {
    const 무소득 = profile({ cash: 0, annualIncome: 0, isFirstTimeBuyer: true });
    const result = calcAffordablePrice(무소득, rules);

    expect(result.affordablePrice).toBe(0);
    expect(calcMaxLoan(무소득, rules, 354_500_000).amount).toBe(0);
    // 자격 판정 자체는 성립한다 — 0이 되는 이유는 자격이 아니라 상환능력이다
    expect(
      matchPolicyLoans(무소득, rules, 354_500_000).length,
    ).toBeGreaterThan(0);
  });

  // 연소득 1만원(사실상 무소득)도 같은 방향이어야 한다. 직전 모델에서는
  // 연소득 0과 똑같이 354,500,000이 나왔다 — 소득이 결과에 전혀 영향을
  // 주지 못한다는 사실 자체가 결함의 증거였다.
  it("연소득이 1만원이어도 무현금이면 실구매력이 0이다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 0, annualIncome: 10_000 }),
      rules,
    );
    expect(result.affordablePrice).toBe(0);
  });

  it("정책대출 선택지가 없는 무소득·무현금이면 실구매력이 0이다", () => {
    // 갈아타기는 requiresNoHome을 만족하지 못해 정책대출 자격이 없다.
    // 이 경로에서는 실구매력이 0으로 무너지는 성질이 그대로 유지된다.
    const result = calcAffordablePrice(
      profile({ status: "갈아타기", cash: 0, annualIncome: 0 }),
      rules,
    );
    expect(result.affordablePrice).toBe(0);
  });

  it("갈아타기 경고가 결과로 전달된다", () => {
    const result = calcAffordablePrice(
      profile({
        status: "갈아타기",
        cash: 50_000_000,
        existingHome: {
          expectedSalePrice: 700_000_000,
          remainingLoan: 300_000_000,
        },
      }),
      rules,
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("정책대출 자격이 있으면 한도 후보에 포함된다", () => {
    const result = calcAffordablePrice(
      profile({
        cash: 300_000_000,
        annualIncome: 50_000_000,
        isFirstTimeBuyer: true,
      }),
      rules,
    );
    // 최대값 의미론에서 POLICY가 0이면 "정책대출 선택지 없음"이다.
    // 자격이 있으면 0보다 큰 실제 한도가 들어와야 한다.
    expect(result.loanLimit.breakdown.POLICY).toBeGreaterThan(0);
  });

  it("실구매력은 10만원 단위로 내림한 정수다", () => {
    const result = calcAffordablePrice(profile(), rules);
    expect(result.affordablePrice % 100_000).toBe(0);
  });

  // 코드 리뷰 결함(Critical, 재발): 이 결과 객체가 matchedPolicyLoans에
  // PolicyLoanRule을 그대로 실어 보내던 시절에는, UI가 loan.maxAmount를
  // "받을 수 있는 정책대출"로 렌더링할 경우 연소득 0원·현금 0원·무주택·
  // 생애최초 구매자에게 보금자리론 한도 360,000,000원을 받을 수 있다고
  // 답하게 되었다 — 이 엔진이 막으려는 바로 그 오답이다. 이제
  // matchedPolicyLoans의 각 항목은 availableAmount(실제 수령 가능액)를
  // 함께 실어 나른다.
  it("무소득·무현금 구매자의 matchedPolicyLoans는 maxAmount는 그대로, availableAmount는 0이다", () => {
    const 무소득 = profile({
      cash: 0,
      annualIncome: 0,
      isFirstTimeBuyer: true,
    });
    const result = calcAffordablePrice(무소득, rules);

    // 자격 판정 자체는 여전히 성립한다 — 상품이 존재하지 않는 게 아니다.
    expect(result.matchedPolicyLoans.length).toBeGreaterThan(0);

    for (const entry of result.matchedPolicyLoans) {
      expect(entry.loan.maxAmount).toBeGreaterThan(0);
      expect(entry.availableAmount).toBe(0);
    }

    const maxAvailable = Math.max(
      ...result.matchedPolicyLoans.map((e) => e.availableAmount),
    );
    expect(maxAvailable).toBe(result.loanLimit.breakdown.POLICY);
    expect(maxAvailable).toBe(0);
  });
});

describe("calcAffordablePrice — 정책대출 절벽 구간", () => {
  it("정책대출 절벽 너머에 있는 최대가를 찾아낸다", () => {
    // 연소득 70,000,000, 무주택, 생애최초 아님. 이 구매자의 답은
    // 보금자리론 절벽(600,000,000) 너머에 있다.
    //
    // 최대값 의미론 도입 전에는 절벽을 넘는 순간 정책 한도라는 "상한"이
    // 사라져 대출한도가 뛰고 자기부담금이 떨어졌다 — f가 아래로 꺾여
    // 단순 이분 탐색이 절벽을 넘지 못하는 것이 이 테스트의 원래 표적이었다.
    // 이제 절벽은 반대 방향(선택지 상실 → f 상승)으로 작용해 그 실패 양상은
    // 사라졌지만, 구간 분할 탐색이 절벽 너머 답을 놓치지 않는다는 성질은
    // 그대로 지켜야 하므로 회귀 고정용으로 남긴다.
    //
    // 값 변경(Task 3, 중개보수 부가세·국민주택채권 도입): 부대비용이
    // 늘어난 만큼 답이 610,300,000에서 609,200,000으로 낮아졌다. 임계값도
    // 절벽(600,000,000)과 새 답(609,200,000) 사이로 낮춘다.
    const result = calcAffordablePrice(
      profile({
        cash: 220_000_000,
        annualIncome: 70_000_000,
        status: "무주택",
        isFirstTimeBuyer: false,
        existingDebtAnnualPayment: 0,
        exclusiveAreaSqm: 84,
      }),
      rules,
    );
    expect(result.affordablePrice).toBeGreaterThanOrEqual(605_000_000);
  });

  it.each(cliffSpanningProfiles)(
    "브루트포스로 찾은 실제 최대가와 일치한다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const cashAmount = calcAvailableCash(p).amount;
      const trueMax = bruteForceMax(
        p,
        rules,
        cashAmount,
        0,
        BRUTE_FORCE_CEILING,
      );
      // 스캔 상한에 잘린 "진짜 최대가"는 진짜가 아니다. 더 부유한 프로필이
      // 추가되면 이 단언이 먼저 깨져 상한을 올리도록 알려준다.
      expect(trueMax).toBeLessThan(BRUTE_FORCE_CEILING);
      expect(result.affordablePrice).toBe(trueMax);
    },
  );

  it.each(cliffSpanningProfiles)(
    "결과 가격에서 자기부담금이 가용현금을 넘지 않는다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      const ownFunds =
        result.affordablePrice - result.loanLimit.amount + result.costs.total;
      expect(ownFunds).toBeLessThanOrEqual(result.availableCash);
    },
  );

  it.each(cliffSpanningProfiles)(
    "한 스텝(PRICE_STEP) 위 가격은 예산을 넘는다: %s",
    (_label, p) => {
      const result = calcAffordablePrice(p, rules);
      // 예전에는 0이면 early return이라, 실구매력이 0으로 무너지는 회귀가
      // 이 테스트를 조용히 통과했다. 이 프로필들은 모두 현금 2.2억을
      // 들고 있으므로 0이어서는 안 된다 — 단언으로 바꾼다.
      expect(result.affordablePrice).toBeGreaterThan(0);
      expect(result.affordablePrice).toBeLessThan(SEARCH_UPPER_BOUND);

      const overPrice = result.affordablePrice + PRICE_STEP;
      const overOwnFunds = ownFundsAt(overPrice, p, rules);
      expect(overOwnFunds).toBeGreaterThan(result.availableCash);
    },
  );

  // 프로필·값 변경(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 이전 프로필
  // (cash 220,000,000 · 연소득 5천만)은 정책 한도가 상품 고시액
  // 360,000,000 그대로여서 POLICY에 걸렸다. 이제 그 구매자의 정책 한도는
  // min(360,000,000, LTV, DSR@4.2%+1.5%)로 눌려 은행 DSR과 정확히 같아지고
  // (보금자리론 금리가 baseRate와 같은 4.2%), 동률이면 binding은 DSR로
  // 남는다 — 실구매력 497,500,000.
  //
  // "정책대출이 최대치를 만드는" 사례는 이제 금리 우위가 실제로 작동하는
  // 쪽에서 나온다. cash 150,000,000 · 연소득 3천만은 디딤돌(3.2%) 자격이
  // 되고,
  //   은행 DSR@5.7% = 172,294,842
  //   디딤돌 DSR@4.7% = 192,812,784  (상품한도 250,000,000·LTV 미만)
  // 이므로 정책 경로가 20,517,942원 더 크다. 순수하게 금리 차이가 만든 값이다.
  // 두 DSR 값 모두 소득 기반이라 가격에 무관하므로 아래 가격 변경에도 그대로다.
  //
  // 값 변경(Task 3, 중개보수 부가세·국민주택채권 도입): 부대비용이 늘어난
  // 만큼 실구매력이 335,600,000에서 335,100,000으로 500,000원 낮아졌다.
  it("정책대출이 실제로 최종 대출 한도를 결정짓는 케이스가 있다", () => {
    const result = calcAffordablePrice(
      profile({ cash: 150_000_000, annualIncome: 30_000_000 }),
      rules,
    );
    expect(result.loanLimit.binding).toBe("POLICY");
    expect(result.loanLimit.amount).toBe(192_812_784);
    expect(result.affordablePrice).toBe(335_100_000);
    // 은행 경로(DSR 172,294,842)보다 정책대출이 더 크다
    expect(result.loanLimit.breakdown.DSR).toBeLessThan(
      result.loanLimit.breakdown.POLICY,
    );
  });

  it("고정 부대비용조차 감당하지 못하면 0원과 경고를 반환한다", () => {
    const result = calcAffordablePrice(profile({ cash: 1_000_000 }), rules);
    expect(result.affordablePrice).toBe(0);
    expect(result.warnings).toContain(
      "고정 부대비용(법무비·이사비)만으로도 보유 현금을 초과합니다.",
    );
  });

  // 이분 탐색은 high를 좁히기만 하고 low에 대입하지 않으므로, 구간 전체를
  // 감당할 수 있어도 low는 구간 상단 B에 도달하지 못한다. 예전에는 그대로
  // 내림해 답이 정확히 한 스텝 낮게(B − PRICE_STEP) 나왔다.
  //
  // 아래 픽스처는 그 상황을 정확히 만든다: 정책대출 상한 5억이 구간 경계를
  // 만들고, 구간 [0, 5억]은 전부 감당 가능하며, 5억을 넘는 순간 정책대출
  // 선택지를 잃어 자기부담금이 급등한다. 따라서 정답은 정확히 5억이다.
  // 수정 전에는 499,900,000이 나왔다.
  //
  // 픽스처 변경(2026-08-17, 정책 경로에 DSR·LTV 제약 도입): 이전 픽스처는
  // 연소득 3억 · 상품금리 3.0% · 상품한도 400,000,000 · cash 109,600,000이었다.
  // 정책 경로가 LTV를 넘지 못하게 된 지금 그 조합은 경계에서 정책 한도가
  // LTV 350,000,000으로 눌려 절벽이 사라진다(은행 경로도 LTV 350,000,000).
  // 절벽을 되살리려면 은행 경로가 DSR에 걸리고 정책 경로는 낮은 금리 덕에
  // LTV까지 도달해야 한다. 연소득 5,500만 · 상품금리 2.5%로 바꾸면
  //   경계 500,000,000에서
  //     은행 = min(LTV 350,000,000, DSR@5.7% 315,873,877, CAP) = 315,873,877
  //     정책 = min(400,000,000, LTV 350,000,000, DSR@4.0% 384,012,274)
  //          = 350,000,000  → binding POLICY
  //     부대비용 9,600,000 → 자기부담금 159,600,000
  //   한 스텝 위에서는 정책 선택지를 잃어 315,873,877로 떨어진다.
  //
  // 값 변경(Task 3, 중개보수 부가세·국민주택채권 도입): 대출한도(350,000,000)
  // 자체는 가격·소득 기반이라 그대로지만, 부대비용이 9,600,000에서
  // 10,528,000(= 부가세 200,000 + 채권비용 728,000 추가)으로 늘어
  // 자기부담금이 159,600,000에서 160,528,000으로 오른다. 픽스처의 cash도
  // 그만큼 올려야 경계에서 "딱 맞는" 상황이 유지된다.
  it("구간 상단이 정답이면 한 스텝 낮은 값이 아니라 상단 그대로를 반환한다", () => {
    const boundary = 500_000_000;
    const fixtureRules: Rules = {
      ...rules,
      policyLoans: [
        {
          id: "구간경계픽스처",
          eligibility: { maxHousePrice: boundary },
          maxAmount: 400_000_000,
          rate: 0.025,
        },
      ],
    };
    const buyer = profile({
      cash: 160_528_000,
      annualIncome: 55_000_000,
    });

    // 경계에서 정책대출이 실제로 최대치를 만든다(절벽이 존재한다).
    expect(calcMaxLoan(buyer, fixtureRules, boundary).binding).toBe("POLICY");
    // 경계에서의 자기부담금이 정확히 가용현금과 같음을 먼저 확인한다.
    expect(ownFundsAt(boundary, buyer, fixtureRules)).toBe(160_528_000);
    // 한 스텝 위는 정책대출 선택지를 잃어 예산을 넘는다.
    expect(
      ownFundsAt(boundary + PRICE_STEP, buyer, fixtureRules),
    ).toBeGreaterThan(160_528_000);

    const result = calcAffordablePrice(buyer, fixtureRules);
    expect(result.affordablePrice).toBe(boundary);
  });

  // 결함(코드 리뷰 발견): 참 임계값 T*가 구간 "내부"에서 정확히
  // PRICE_STEP의 배수와 일치할 때, 이분 탐색의 low는 부동소수점 오차로
  // T* 바로 아래에서 수렴한다. floor(low / PRICE_STEP) * PRICE_STEP은
  // 그 순간 n-1단계로 내려가 결과가 T* - PRICE_STEP이 되어 버린다.
  // segHigh 후보는 "구간 상단이 정답인" 경우만 구제하므로, 구간 내부의
  // 같은 사각은 구제되지 않았다. cash를 ownFundsAt(T)로 정확히 맞춰
  // T 자체가 임계값이 되도록 픽스처를 구성한다.
  it.each([
    [300_000_000, profile({ annualIncome: 80_000_000 })],
    [
      200_000_000,
      profile({ annualIncome: 60_000_000, isFirstTimeBuyer: true }),
    ],
    [450_000_000, profile({ annualIncome: 120_000_000 })],
    [750_000_000, profile({ annualIncome: 300_000_000 })],
  ] as Array<[number, BuyerProfile]>)(
    "T=%i가 구간 내부의 정확한 그리드 경계일 때 T-PRICE_STEP이 아니라 T를 반환한다",
    (T, p) => {
      const requiredCash = ownFundsAt(T, p, rules);
      const buyer = { ...p, cash: requiredCash };

      // 전제 확인: T가 실제 임계값이며(한 스텝 위는 예산 초과), 구간
      // 상단이 아니라 내부에 있다(SEARCH_UPPER_BOUND나 절벽 경계가 아님).
      expect(
        ownFundsAt(T + PRICE_STEP, buyer, rules),
      ).toBeGreaterThan(requiredCash);

      const result = calcAffordablePrice(buyer, rules);
      expect(result.affordablePrice).toBe(T);
    },
  );
});

/**
 * 안전하지 않은 방향의 오답을 격자로 훑는다.
 *
 * 이 엔진이 낼 수 있는 최악의 오답은 "감당하지 못할 가격을 감당할 수 있다고
 * 답하는 것"이다. 개별 사례 테스트는 그 사례에서만 방향을 지키므로, 소득
 * (0 포함) · 현금(0 포함) · 생애최초 · 보유상황을 곱한 격자 전체에서 방향이
 * 지켜지는지 확인한다. 정책대출 자격 유무와 절벽 양쪽이 모두 격자에 들어간다.
 */
describe("calcAffordablePrice — 안전하지 않은 방향 스윕", () => {
  const incomes = [0, 10_000, 30_000_000, 50_000_000, 70_000_000, 120_000_000];
  const cashes = [0, 30_000_000, 150_000_000, 300_000_000];
  const statuses: BuyerProfile["status"][] = ["무주택", "갈아타기"];

  const grid: Array<[string, BuyerProfile]> = [];
  for (const annualIncome of incomes) {
    for (const cash of cashes) {
      for (const isFirstTimeBuyer of [false, true]) {
        for (const status of statuses) {
          grid.push([
            `소득 ${annualIncome} · 현금 ${cash} · 생애최초 ${isFirstTimeBuyer} · ${status}`,
            profile({ annualIncome, cash, isFirstTimeBuyer, status }),
          ]);
        }
      }
    }
  }

  it("격자 전체에서 자기부담금이 가용현금을 넘지 않는다", () => {
    expect(grid.length).toBe(96);

    for (const [label, p] of grid) {
      const result = calcAffordablePrice(p, rules);
      const ownFunds =
        result.affordablePrice - result.loanLimit.amount + result.costs.total;

      if (result.affordablePrice > 0) {
        expect(
          ownFunds,
          `${label} — 자기부담금 ${ownFunds} > 가용현금 ${result.availableCash}`,
        ).toBeLessThanOrEqual(result.availableCash);
      } else {
        // 0원은 "이 조건으로는 살 수 없다"는 답이므로 안전한 방향이다.
        // 고정 부대비용(법무비·이사비)조차 못 내는 구매자는 여기로 떨어지며,
        // 이때 costs.total은 성사되지 않는 거래의 가상 비용이라 위 부등식의
        // 대상이 아니다.
        //
        // (코드 리뷰 지적) 예전 단언 `expect(result.loanLimit.amount).toBe(0)`은
        // price = 0에서 항상 참이다 — calcLtvLimit이 프로필과 무관하게
        // 0 × rate = 0을 반환해 LTV가 항상 은행 경로 최소값을 만들기
        // 때문이다. 즉 이 카브아웃 자체를 검증하지 못했다. 이 케이스가
        // 실제로 뜻하는 바("그리드에서 가장 싼 가격조차 감당할 수 없다")를
        // 직접 검증한다.
        expect(
          ownFundsAt(PRICE_STEP, p, rules),
          label,
        ).toBeGreaterThan(result.availableCash);
      }
    }
  });

  it("격자 전체에서 실구매력이 10만원 단위 정수이고 대출액도 정수다", () => {
    for (const [label, p] of grid) {
      const result = calcAffordablePrice(p, rules);
      expect(result.affordablePrice % PRICE_STEP, label).toBe(0);
      expect(Number.isInteger(result.loanLimit.amount), label).toBe(true);
      expect(result.loanLimit.amount, label).toBe(
        result.loanLimit.breakdown[result.loanLimit.binding],
      );
    }
  });

  // 현금이 0이면 고정 부대비용(법무비 600,000 + 이사비 1,500,000)조차 낼 수
  // 없으므로 소득이 얼마든 답은 0이다. 직전 결함에서는 정책대출이 상환능력을
  // 우회해 이 구매자에게 354,500,000을 제시했다.
  it("현금이 0이면 소득과 무관하게 실구매력이 0이다", () => {
    for (const annualIncome of incomes) {
      const result = calcAffordablePrice(
        profile({ cash: 0, annualIncome }),
        rules,
      );
      expect(result.affordablePrice, `소득 ${annualIncome}`).toBe(0);
    }
  });

  // 소득이 결과에 영향을 주지 못하면 상환능력 제약이 어딘가에서 빠진 것이다.
  // 직전 결함에서는 연소득 0과 1만원이 정책대출 덕에 똑같은 답을 냈다.
  // 현금 1.5억은 상환능력이 실제로 구속력을 갖는 구간이다. 현금이 아주 적거나
  // (예: 3천만) 소득이 아주 높으면 LTV가 먼저 걸려 소득을 올려도 답이 움직이지
  // 않으므로, 소득 반영 여부는 DSR이 지배하는 구간에서 봐야 한다. 그래서
  // 전 구간에는 "감소하지 않는다"만 요구하고, DSR 구간에서만 강한 증가를 건다.
  it("같은 현금이라면 소득이 클수록 실구매력이 크다", () => {
    const at = (annualIncome: number): number =>
      calcAffordablePrice(profile({ cash: 150_000_000, annualIncome }), rules)
        .affordablePrice;

    let previous = -1;
    for (const annualIncome of incomes) {
      const price = at(annualIncome);
      expect(price, `소득 ${annualIncome}`).toBeGreaterThanOrEqual(previous);
      previous = price;
    }

    // 소득 0은 전액 현금 매수뿐이므로 현금(1.5억)에 부대비용을 뺀 수준이다
    expect(at(0)).toBeLessThan(150_000_000);
    expect(at(30_000_000)).toBeGreaterThan(at(0));
    expect(at(60_000_000)).toBeGreaterThan(at(30_000_000));
  });
});
