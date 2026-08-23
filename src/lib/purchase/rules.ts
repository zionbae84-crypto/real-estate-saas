import {
  PURCHASE_METRIC_IDS,
  type PurchaseMetricId,
  type PurchaseOverall,
  type PurchaseRules,
  type PurchaseVerdict,
} from "./types";

const VERDICTS: readonly PurchaseVerdict[] = [
  "stop",
  "expert",
  "checked",
  "unknown",
];
const OVERALLS: readonly PurchaseOverall[] = [
  "stop",
  "incomplete",
  "expert",
  "clear",
];

const GAP_FIELD_IDS = ["price", "deposit", "cash"] as const;
const RENTAL_FIELD_IDS = [
  "price",
  "deposit",
  "cash",
  "monthlyRent",
  "annualOperatingCost",
  "loanPrincipal",
  "annualDebtService",
  "annualInterest",
] as const;

/**
 * 부대비용이 **작아진다**고 말하는 표현과 **커진다**고 말하는 표현.
 *
 * 부대비용 전제 문구가 한 방향으로만 단언하는 것을 막는 데 쓴다 —
 * {@link parseAcquisition} 참고.
 */
const COST_SHRINKS = /작아질|작아져|적어질|줄어들|덜 나올|덜 나와/;
const COST_GROWS = /커질|커지|많아질|늘어날|더 나올|더 나와/;

/**
 * 구매 유형 룰셋 JSON을 검증해 {@link PurchaseRules}로 바꾼다.
 *
 * `src/lib/rights/rules.ts`와 같은 태도다 — 사람이 손으로 고치는
 * 데이터이므로 틀렸을 때 어디가 틀렸는지 말해 준다. 여기서 지키는
 * 불변식은 **이 제품이 절대 하면 안 되는 계산**에 대한 것이다:
 *
 * 1. **실거주는 투자 지표를 하나도 갖지 않는다.** 부모 스펙 14절이
 *    말한 그대로다 — DSCR은 임대수익이 0이라 분자가 성립하지 않는다.
 *    코드가 아니라 데이터 수준에서 막는다. 실거주의 `metrics`에 무엇을
 *    넣든 파서가 거부한다.
 * 2. **실거주만 대출 한도를 계산한다.** 나머지 유형은
 *    `computesLoanLimit: false`이고, 왜 계산하지 않는지 말하는
 *    `loanLimitNote`를 반드시 갖는다. 그 문구가 없으면 화면이 아무 말도
 *    하지 않게 되는데, 그건 "한도가 없다"로 읽힌다.
 * 3. **정의된 지표는 반드시 어느 유형엔가 붙어 있다.** 붙지 않은 지표는
 *    임계값만 파일에 남고 화면에는 나타나지 않는다 — 권리분석 룰셋의
 *    역방향 검증과 같은 이유다.
 * 4. **임계값이 뒤집히지 않는다.** `expertFrom <= stopFrom`,
 *    `stopBelow <= expertBelow`. 뒤집히면 더 위험한 상황이 더 약한
 *    판정을 받는다.
 * 5. **역전세 단계는 작은 하락일수록 무거운 판정을 받는다.** 5% 하락도
 *    못 막는 쪽이 30% 하락을 못 막는 쪽보다 위험하다.
 * 6. **RTI는 stop 임계값을 가질 수 없다.** 그 기준값의 출처를 확인하지
 *    못했다 — 확인되지 않은 숫자로 거래를 멈추라고 말할 수는 없다.
 * 7. **DSCR의 stopBelow는 1보다 작을 수 없다.** 6번과 반대 방향의 같은
 *    이유다 — DSCR이 1 미만이라는 것은 임대료로 원리금을 못 갚는다는
 *    뜻 그 자체라, 참고선이 아니라 산식이 직접 말하는 사실이다.
 * 8. **부대비용 전제는 한 방향으로 단언할 수 없다.** 취득자의 주택 수는
 *    묻지도 계산하지도 않았고, 이미 집이 있으면 부대비용은 오히려
 *    커진다({@link parseAcquisition}).
 * 9. **필요 자기자금 문구는 유형별로 갈린다.** 월세 수익형 문구가
 *    "전세보증금"이라고 말하면 사용자가 방금 적은 값과 다른 것을
 *    가리키는 말이 된다({@link parseOwnFunds}).
 * 10. **`overall.expert`는 반드시 `loanFloorNote`를 갖는다.** 월세
 *     수익형에서 대출 원금을 실제로 뺐으면 결론은 `clear`로 내려가지
 *     않고 최소 `expert`에 머문다(`assess.ts`의
 *     `hasUnverifiedLoanPrincipal`). 이 화면은 임대사업자대출·다주택자
 *     한도를 계산하지 않는다고 스스로 선언해서, 사용자가 적은 대출
 *     원금이 실제로 나오는 금액인지 검증할 방법이 없기 때문이다. 이
 *     문구가 없으면 그 하한이 왜 걸렸는지 화면이 말하지 않게 된다.
 */
export function parsePurchaseRules(raw: unknown): PurchaseRules {
  const r = plainObject(raw, "룰셋");

  requireText(r, "version", "version");
  requireText(r, "effectiveFrom", "effectiveFrom");

  const verdictLabels = plainObject(r.verdictLabels, "verdictLabels");
  for (const verdict of VERDICTS) {
    requireText(verdictLabels, verdict, `verdictLabels.${verdict}`);
  }

  const overall = plainObject(r.overall, "overall");
  for (const key of OVERALLS) {
    const copy = plainObject(overall[key], `overall.${key}`);
    requireText(copy, "label", `overall.${key}.label`);
    requireText(copy, "note", `overall.${key}.note`);
  }
  // 권리분석 룰셋과 같은 이유: 미입력 항목 하나가 이미 걸린 지표를
  // 회색 "아직 다 채우지 않았어요" 뒤로 숨기면 실제보다 덜 위험해 보인다.
  requireText(
    plainObject(overall.incomplete, "overall.incomplete"),
    "pendingExpertNote",
    "overall.incomplete.pendingExpertNote",
  );
  // 월세 수익형에서 대출 원금을 실제로 뺐으면 결론이 clear로 내려가지
  // 않는다(assess.ts의 hasUnverifiedLoanPrincipal) — 이 화면이 임대사업자
  // 대출·다주택자 한도를 계산하지 않는다고 스스로 선언해서, 그 원금이
  // 실제로 나오는지 검증할 방법이 없기 때문이다. 이 문구가 왜 확인이
  // 필요한지 화면에서 말한다.
  requireText(
    plainObject(overall.expert, "overall.expert"),
    "loanFloorNote",
    "overall.expert.loanFloorNote",
  );

  if (
    !Array.isArray(r.disclaimer) ||
    r.disclaimer.length === 0 ||
    !r.disclaimer.every((line) => isText(line))
  ) {
    throw new Error("룰셋 필드 누락 또는 타입 오류: disclaimer (한 줄 이상의 문자열이어야 해요)");
  }

  parseAcquisition(r.acquisition);
  const used = parseTypes(r.types);
  parseMetrics(r.metrics, used);

  return raw as PurchaseRules;
}

/**
 * 부대비용 전제를 검증한다.
 *
 * **여기서 지키는 것은 숫자가 아니라 문구의 방향이다.**
 * `calcAcquisitionCosts`는 취득자의 주택 수를 읽지 않고,
 * `rules/2026-08.json`에는 다주택 취득세 중과 분기가 없다. 그 중과율을
 * 확인하지 못했으므로 숫자를 넣지 않는다 — 대신 화면이 그 한계를
 * **반대 방향으로 말하지 못하게** 막는다.
 *
 * 1. `householdCountNote`가 반드시 있어야 하고, 주택 수를 묻지 않았다는
 *    사실과 부대비용이 **이보다 커질 수 있다**는 방향을 말해야 한다.
 * 2. "부대비용이 이보다 작아질 수 있다"는 말은 **주택 수를 함께 이름
 *    붙이고 커지는 방향도 함께 말할 때만** 쓸 수 있다. 그 말 자체는
 *    이름 붙인 두 전제(면적·생애최초)에 대해서만 참이고, 이름 붙이지
 *    않은 세 번째 전제(주택 수)에 대해서는 정확히 반대이기 때문이다.
 *    앞쪽에서 "전제는 비용이 커지는 쪽으로 잡았다"고 덧붙이는 것만으로는
 *    부족하다 — 실제로 화면에 나가던 옛 문구가 정확히 그 모양이었고,
 *    거기서 독자가 가져가는 결론은 뒤쪽의 "이보다 작아질 수 있어요"다.
 */
function parseAcquisition(raw: unknown): void {
  const a = plainObject(raw, "acquisition");
  if (typeof a.isFirstTimeBuyer !== "boolean") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: acquisition.isFirstTimeBuyer");
  }
  requirePositive(a, "assumedExclusiveAreaSqm", "acquisition.assumedExclusiveAreaSqm");
  requireText(a, "note", "acquisition.note");
  requireText(a, "householdCountNote", "acquisition.householdCountNote");

  const household = a.householdCountNote as string;
  if (!/주택 수/.test(household)) {
    throw new Error("룰셋 값 오류: acquisition.householdCountNote는 주택 수를 묻지 않았다는 사실을 말해야 해요. 취득세는 주택 수에 따라 달라지는데 이 계산에는 그 분기가 없어요.");
  }
  if (!COST_GROWS.test(household)) {
    throw new Error("룰셋 값 오류: acquisition.householdCountNote는 부대비용이 이보다 커질 수 있다는 방향을 말해야 해요. 이미 집이 있으면 취득세가 더 나올 수 있는데, 그 방향을 말하지 않으면 화면이 한계를 반대로 말하게 돼요.");
  }

  for (const key of ["note", "householdCountNote"] as const) {
    const text = a[key] as string;
    if (
      COST_SHRINKS.test(text) &&
      !(COST_GROWS.test(text) && /주택 수/.test(text))
    ) {
      throw new Error(`룰셋 값 오류: acquisition.${key}가 부대비용이 이보다 작아질 수 있다고 말해요. 취득자의 주택 수는 묻지도 계산하지도 않았고, 이미 집이 있으면 부대비용은 오히려 커질 수 있어요 — 작아지는 방향은 주택 수를 함께 이름 붙이고 커지는 방향도 함께 말할 때만 쓸 수 있어요.`);
    }
  }
}

/** 유형별 정의를 검증하고, 어느 지표가 실제로 쓰이는지 모아 돌려준다 */
function parseTypes(raw: unknown): Set<PurchaseMetricId> {
  const types = plainObject(raw, "types");
  const used = new Set<PurchaseMetricId>();

  const residential = plainObject(types["실거주"], "types.실거주");
  requireText(residential, "label", "types.실거주.label");
  requireText(residential, "summary", "types.실거주.summary");
  if (residential.computesLoanLimit !== true) {
    throw new Error("룰셋 값 오류: types.실거주.computesLoanLimit은 true여야 해요. 실거주 경로의 대출 한도 계산은 이미 src/lib/finance가 하고 있어요.");
  }
  if (!Array.isArray(residential.metrics) || residential.metrics.length > 0) {
    throw new Error("룰셋 값 오류: types.실거주.metrics는 빈 배열이어야 해요. 임대수익이 0이라 DSCR·Cap Rate·RTI는 분자가 성립하지 않아요 — 실거주에 투자 지표를 붙이면 없는 수익을 있는 것처럼 계산하게 돼요.");
  }

  for (const [name, fieldIds, needsLoanChoice] of [
    ["갭투자", GAP_FIELD_IDS, false],
    ["월세수익형", RENTAL_FIELD_IDS, true],
  ] as const) {
    const path = `types.${name}`;
    const t = plainObject(types[name], path);
    requireText(t, "label", `${path}.label`);
    requireText(t, "summary", `${path}.summary`);

    // 한도를 계산하지 않는다는 사실과, 왜 계산하지 않는지를 말하는 문구는
    // 짝이다. 문구가 없으면 화면이 아무 말도 하지 않게 되는데 그건
    // "한도가 없다"로 읽힌다.
    if (t.computesLoanLimit !== false) {
      throw new Error(`룰셋 값 오류: ${path}.computesLoanLimit은 false여야 해요. 임대사업자대출·다주택자 한도는 rules/2026-08.json에 없어서, 실거주 기준 한도를 쓰면 빌릴 수 있는 돈을 과대 계상하게 돼요.`);
    }
    requireText(t, "loanLimitNote", `${path}.loanLimitNote`);

    for (const fieldId of fieldIds) {
      const field = plainObject(
        plainObject(t.fields, `${path}.fields`)[fieldId],
        `${path}.fields.${fieldId}`,
      );
      requireText(field, "label", `${path}.fields.${fieldId}.label`);
      requireText(field, "hint", `${path}.fields.${fieldId}.hint`);
    }

    if (needsLoanChoice) {
      const choice = plainObject(t.loanChoice, `${path}.loanChoice`);
      for (const key of ["label", "none", "known", "unknown"] as const) {
        requireText(choice, key, `${path}.loanChoice.${key}`);
      }
    }

    const metrics = t.metrics;
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new Error(`룰셋 값 오류: ${path}.metrics는 한 지표 이상이어야 해요`);
    }
    for (const id of metrics) {
      if (!PURCHASE_METRIC_IDS.includes(id as PurchaseMetricId)) {
        throw new Error(`룰셋 값 오류: ${path}.metrics에 모르는 지표가 있어요 (${String(id)})`);
      }
      used.add(id as PurchaseMetricId);
    }
    // 같은 유형 안에서의 중복만 막는다. 서로 다른 유형이 같은 지표를
    // 쓰는 것은 정상이다 — 필요 자기자금은 갭투자와 월세 수익형이
    // 같은 산식을 쓴다.
    if (new Set(metrics).size !== metrics.length) {
      throw new Error(`룰셋 값 오류: ${path}.metrics에 같은 지표가 두 번 있어요`);
    }
  }

  return used;
}

function parseMetrics(raw: unknown, used: Set<PurchaseMetricId>): void {
  const m = plainObject(raw, "metrics");

  for (const id of PURCHASE_METRIC_IDS) {
    const rule = plainObject(m[id], `metrics.${id}`);
    requireText(rule, "label", `metrics.${id}.label`);

    /*
     * 역방향 검증(권리분석 룰셋의 sourceItemIds 검증과 같은 이유):
     * 임계값과 문구만 파일에 남고 어느 유형에도 붙지 않은 지표는
     * 화면에 나타나지 않는다. 사람이 값을 고쳐도 아무 일도 일어나지
     * 않는 상태가 되므로, 그 어긋남을 여기서 막는다.
     */
    if (!used.has(id)) {
      throw new Error(`룰셋 값 오류: metrics.${id}가 정의돼 있는데 어느 유형의 metrics에도 없어요. 임계값만 남고 화면에는 나타나지 않아요.`);
    }
  }

  const jeonse = plainObject(m.jeonseRatio, "metrics.jeonseRatio");
  requireMessages(jeonse, "metrics.jeonseRatio", [
    "stop",
    "expert",
    "checked",
    "unknown",
  ]);
  const expertFrom = requirePositive(jeonse, "expertFrom", "metrics.jeonseRatio.expertFrom");
  const stopFrom = requirePositive(jeonse, "stopFrom", "metrics.jeonseRatio.stopFrom");
  if (!(expertFrom <= stopFrom)) {
    throw new Error(`룰셋 값 오류: metrics.jeonseRatio.expertFrom은 stopFrom 이하여야 해요 (${expertFrom} / ${stopFrom}). 뒤집히면 더 위험한 상황이 더 약한 판정을 받아요.`);
  }

  parseOwnFunds(plainObject(m.ownFunds, "metrics.ownFunds"));

  parseReverseJeonse(plainObject(m.reverseJeonse, "metrics.reverseJeonse"));

  for (const id of ["capRate", "dscr"] as const) {
    const rule = plainObject(m[id], `metrics.${id}`);
    requireMessages(
      rule,
      `metrics.${id}`,
      id === "dscr"
        ? ["stop", "expert", "checked", "unknown", "noLoan"]
        : ["stop", "expert", "checked", "unknown"],
    );
    const stopBelow = requireFinite(rule, "stopBelow", `metrics.${id}.stopBelow`);
    const expertBelow = requireFinite(rule, "expertBelow", `metrics.${id}.expertBelow`);
    if (!(stopBelow <= expertBelow)) {
      throw new Error(`룰셋 값 오류: metrics.${id}.stopBelow는 expertBelow 이하여야 해요 (${stopBelow} / ${expertBelow}). 뒤집히면 더 위험한 상황이 더 약한 판정을 받아요.`);
    }
    /*
     * DSCR의 stopBelow는 참고선이 아니라 **산식이 직접 말하는 사실**이다:
     * 순영업소득 ÷ 연간 원리금이 1.0보다 작다는 것은 임대료로 원리금을
     * 못 갚는다는 뜻 그 자체다. 그래서 그 사실을 룰셋 편집으로 지울 수
     * 없게 막는다(RTI의 stopBelow 금지 가드와 같은 자리, 반대 방향이다).
     * 1보다 크게 두는 것 — 더 일찍 멈추는 것 — 은 막지 않는다.
     */
    if (id === "dscr" && !(stopBelow >= 1)) {
      throw new Error(`룰셋 값 오류: metrics.dscr.stopBelow는 1 이상이어야 해요 (${stopBelow}). 1보다 작게 두면 임대료로 원리금을 못 갚는 상태가 stop이 아니게 되는데, 그건 참고선이 아니라 산식이 직접 말하는 사실이에요.`);
    }
  }

  const rti = plainObject(m.rti, "metrics.rti");
  requireMessages(rti, "metrics.rti", [
    "belowReference",
    "aboveReference",
    "noLoan",
    "unknown",
  ]);
  requirePositive(rti, "expertBelow", "metrics.rti.expertBelow");
  // RTI 기준값의 출처를 확인하지 못했다. 확인되지 않은 숫자로 거래를
  // 멈추라고 말할 수는 없으므로, stop 임계값을 두는 것 자체를 막는다.
  if (rti.stopBelow !== undefined) {
    throw new Error("룰셋 값 오류: metrics.rti에는 stopBelow를 둘 수 없어요. RTI 기준값의 출처를 확인하지 못했고, 확인되지 않은 숫자로 거래를 멈추라고 말할 수는 없어요.");
  }
}

/**
 * 필요 자기자금 규칙.
 *
 * 산식은 두 유형이 같지만 **문구는 갈라야 한다.** 월세 화면의 필드
 * 라벨은 "보증금"인데 결과가 "전세보증금"이라고 말하면, 사용자가 방금
 * 적은 값과 다른 것을 가리키는 말이 된다. 문구를 다시 하나로 합치면
 * 여기서 거부된다.
 */
function parseOwnFunds(rule: Record<string, unknown>): void {
  requireText(rule, "loanAssumptionNote", "metrics.ownFunds.loanAssumptionNote");
  const messages = plainObject(rule.messages, "metrics.ownFunds.messages");

  const gap = plainObject(messages["갭투자"], "metrics.ownFunds.messages.갭투자");
  for (const key of ["stop", "checked", "unknown"] as const) {
    requireText(gap, key, `metrics.ownFunds.messages.갭투자.${key}`);
  }

  const rental = plainObject(
    messages["월세수익형"],
    "metrics.ownFunds.messages.월세수익형",
  );
  for (const key of ["stop", "checked", "unknown", "loanUnknown"] as const) {
    requireText(rental, key, `metrics.ownFunds.messages.월세수익형.${key}`);
    if (/전세보증금/.test(rental[key] as string)) {
      throw new Error(`룰셋 값 오류: metrics.ownFunds.messages.월세수익형.${key}가 '전세보증금'이라고 말해요. 월세 수익형 화면의 필드 라벨은 '보증금'이라, 사용자가 방금 적은 값과 다른 것을 가리키는 말이 돼요.`);
    }
  }
}

function parseReverseJeonse(rule: Record<string, unknown>): void {
  requireMessages(rule, "metrics.reverseJeonse", [
    "stop",
    "expert",
    "checked",
    "unknown",
  ]);
  requireText(rule, "depositIsNotDebtNote", "metrics.reverseJeonse.depositIsNotDebtNote");

  /*
   * **두 단계 이상이어야 한다.** 예전에는 "한 단계 이상"만 강제했는데,
   * 바로 아래 오류 문구와 룰셋의 `_note`가 말하는 이유("단일 시나리오는
   * '그 숫자만 피하면 된다'로 읽힌다")를 그 불변식이 실제로는 막지
   * 못했다 — 강제하는 것과 적어 둔 이유가 어긋나 있던 자리다.
   */
  const stages = rule.stages;
  if (!Array.isArray(stages) || stages.length < 2) {
    throw new Error("룰셋 값 오류: metrics.reverseJeonse.stages는 두 단계 이상이어야 해요. 단일 시나리오는 '그 숫자만 피하면 된다'로 읽혀요.");
  }

  let previousDrop = 0;
  let sawExpert = false;
  stages.forEach((rawStage, index) => {
    const path = `metrics.reverseJeonse.stages[${index}]`;
    const stage = plainObject(rawStage, path);
    const drop = requireFinite(stage, "drop", `${path}.drop`);
    if (!(drop > 0) || !(drop < 1)) {
      throw new Error(`룰셋 값 오류: ${path}.drop은 0과 1 사이여야 해요 (${drop})`);
    }
    if (!(drop > previousDrop)) {
      throw new Error(`룰셋 값 오류: ${path}.drop은 앞 단계보다 커야 해요 (${previousDrop} → ${drop}). 오름차순이 아니면 아래 판정 순서 검증이 뜻을 잃어요.`);
    }
    previousDrop = drop;

    const verdict = stage.uncoveredVerdict;
    if (verdict !== "stop" && verdict !== "expert") {
      throw new Error(`룰셋 값 오류: ${path}.uncoveredVerdict는 stop·expert 중 하나여야 해요 (${String(verdict)})`);
    }
    // 작은 하락도 못 막는 쪽이 더 위험하다. stop이 앞, expert가 뒤여야
    // 한다 — 뒤집히면 5% 하락을 못 막는 사람이 30% 하락을 못 막는
    // 사람보다 약한 판정을 받는다.
    if (verdict === "expert") sawExpert = true;
    else if (sawExpert) {
      throw new Error(`룰셋 값 오류: ${path}.uncoveredVerdict가 앞 단계보다 무거워요. 하락 폭이 커질수록 판정은 stop → expert 순서로만 약해질 수 있어요.`);
    }
  });
}

function requireMessages(
  container: Record<string, unknown>,
  path: string,
  keys: readonly string[],
): void {
  const messages = plainObject(container.messages, `${path}.messages`);
  for (const key of keys) {
    requireText(messages, key, `${path}.messages.${key}`);
  }
}

function isText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requireText(
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isText(container[key])) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
}

function requireFinite(
  container: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = container[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path} (유한한 숫자여야 해요)`);
  }
  return value;
}

function requirePositive(
  container: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = requireFinite(container, key, path);
  if (!(value > 0)) {
    throw new Error(`룰셋 값 오류: ${path}는 0보다 큰 숫자여야 해요 (${value})`);
  }
  return value;
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`룰셋 필드 누락 또는 타입 오류: ${path}`);
  }
  return value as Record<string, unknown>;
}
