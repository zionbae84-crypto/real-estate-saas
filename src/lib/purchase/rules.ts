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
  "annualDebtService",
  "annualInterest",
] as const;

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

function parseAcquisition(raw: unknown): void {
  const a = plainObject(raw, "acquisition");
  if (typeof a.isFirstTimeBuyer !== "boolean") {
    throw new Error("룰셋 필드 누락 또는 타입 오류: acquisition.isFirstTimeBuyer");
  }
  requirePositive(a, "assumedExclusiveAreaSqm", "acquisition.assumedExclusiveAreaSqm");
  requireText(a, "note", "acquisition.note");
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

  requireMessages(plainObject(m.ownFunds, "metrics.ownFunds"), "metrics.ownFunds", [
    "stop",
    "checked",
    "unknown",
  ]);

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

function parseReverseJeonse(rule: Record<string, unknown>): void {
  requireMessages(rule, "metrics.reverseJeonse", [
    "stop",
    "expert",
    "checked",
    "unknown",
  ]);
  requireText(rule, "depositIsNotDebtNote", "metrics.reverseJeonse.depositIsNotDebtNote");

  const stages = rule.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error("룰셋 값 오류: metrics.reverseJeonse.stages는 한 단계 이상이어야 해요. 단일 시나리오는 '그 숫자만 피하면 된다'로 읽혀요.");
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
