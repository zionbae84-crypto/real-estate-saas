import type { RightsAnswer, RightsAnswers } from "../rights";
import { crossCheck } from "./crosscheck";
import { compact, toAllRows } from "./layout";
import {
  groupRights,
  hasSummary,
  readEntries,
  readHeader,
  readOwners,
  readSummaryRows,
  sectionRows,
  sectionText,
  type DeungiRight,
  type SectionedRow,
} from "./read";
import { readPdfGeometry } from "./pdf";
import { problemOf, type DeungiRules } from "./rules";
import type {
  DeungiCrossCheck,
  DeungiEntry,
  DeungiHeader,
  DeungiOwner,
  DeungiPageGeometry,
  DeungiProblem,
  DeungiProblemId,
  DeungiSummaryRow,
  DeungiTotal,
} from "./types";

/**
 * 읽어낸 등기부 하나.
 *
 * `answers`만 내고 끝내지 않는 이유: **사람이 대조할 수 있어야 한다.**
 * 근저당이 몇 건인지, 채권최고액 합계가 얼마인지, 압류·가압류가 무엇인지
 * 화면이 그대로 보여 줄 수 있어야 우리가 잘못 읽었을 때 티가 난다.
 */
export interface DeungiReading {
  header: DeungiHeader;
  /** 본문에서 읽은 항목 전부(말소된 것도 들어 있다) */
  entries: DeungiEntry[];
  /** 말소선이 없는 항목만 */
  liveEntries: DeungiEntry[];
  owners: DeungiOwner[];
  summaryRows: DeungiSummaryRow[];
  totals: { mortgage: DeungiTotal; lease: DeungiTotal };
  crossCheck: DeungiCrossCheck;
  problems: DeungiProblem[];
  /** 문진 엔진에 그대로 넣는 답 */
  answers: RightsAnswers;
  /** 등기부만으로는 답할 수 없어 사용자에게 남겨 둔 문진 항목 */
  leftToUser: string[];
}

/**
 * 등기부만으로는 절대 답할 수 없는 문진 항목.
 *
 * 답을 만들지 않고 **빈칸으로 남긴다.** 빈칸은 문진 엔진에서 "아직 다
 * 답하지 않았어요"가 되고, 그건 통과가 아니다. 여기 있는 항목 때문에
 * 이 파서 혼자서는 어떤 등기부로도 `clear`를 만들 수 없다 — 그게 맞다.
 */
// 순서는 문진 룰셋의 항목 순서와 같게 둔다. 화면이 남은 항목을 그 차례로 묻는다.
export const LEFT_TO_USER: readonly string[] = [
  // 분양계약서·입주자모집공고를 봐야 갈린다.
  "landLease",
  // 계약서의 매도인과 견줘야 한다. 등기부에는 계약서가 없다.
  "ownerMatch",
  // 건축물대장을 봐야 한다.
  "illegalBuilding",
  "mainUse",
  // 전입세대확인서를 봐야 한다.
  "priorDeposit",
];

/**
 * 이 파서가 답을 만드는 문진 항목과, 그 항목의 "모르겠어요" 선택지 id.
 *
 * 못 읽었을 때 이 id로 답한다. 문진 엔진이 이 선택지를 "전문가 확인이 꼭
 * 필요해요"로 보내므로, 우리가 못 읽었다는 사실이 결과까지 그대로 이어진다.
 */
const UNKNOWN_OPTION: Readonly<Record<string, string>> = {
  landRight: "unknown",
  coOwnership: "unknown",
  trust: "unknown",
  seizure: "unknown",
  auction: "unknown",
  mortgage: "unknown",
  leaseRight: "unknown",
  superficies: "unknown",
};

export const COVERED_ITEM_IDS: readonly string[] = Object.keys(UNKNOWN_OPTION);

/** 금액을 반드시 읽어 내야 하는 갈래. 못 읽으면 합계를 내지 않는다 */
const AMOUNT_KINDS: readonly DeungiEntry["kind"][] = ["근저당권", "전세권", "임차권"];

function answer(optionId: string, amountWon: number | null = null): RightsAnswer {
  return { optionId, amountWon };
}

function unknownAnswers(): Record<string, RightsAnswer> {
  const all: Record<string, RightsAnswer> = {};
  for (const [itemId, optionId] of Object.entries(UNKNOWN_OPTION)) {
    all[itemId] = answer(optionId);
  }
  return all;
}

/** 아무것도 읽지 못했을 때의 결과. **빈 등기부가 아니라 모르는 등기부다** */
function nothingRead(rules: DeungiRules, ids: readonly DeungiProblemId[]): DeungiReading {
  return {
    header: {
      propertyKind: null,
      withCancelled: null,
      purpose: "unknown",
      issuedAt: null,
      issuedAtIso: null,
      uniqueNumber: null,
      address: null,
    },
    entries: [],
    liveEntries: [],
    owners: [],
    summaryRows: [],
    totals: { mortgage: { won: null, count: null }, lease: { won: null, count: null } },
    crossCheck: "unavailable",
    problems: ids.map((id) => problemOf(rules, id)),
    answers: unknownAnswers(),
    leftToUser: [...LEFT_TO_USER],
  };
}

/**
 * 좌표까지 뽑아낸 PDF를 읽어 문진의 답으로 바꾼다.
 *
 * 이 함수가 지키는 것은 하나다. **어떤 실패도 "걸리는 게 없는 등기부"로
 * 나가지 않는다.** 등기부가 아니거나, 글자가 없거나, 쪽이 돌아가 있거나,
 * 요약을 못 찾았거나, 본문과 요약이 어긋나면 전부 모름이 된다.
 */
export function readDeungi(
  rules: DeungiRules,
  pages: readonly DeungiPageGeometry[],
): DeungiReading {
  const rows = toAllRows(pages);
  const allText = compact(rows.map((row) => row.text).join("\n"));

  if (rows.length === 0 || allText.length === 0) {
    return nothingRead(rules, ["noText", "notDeungi"]);
  }
  if (pages.some((page) => page.rotated)) {
    return nothingRead(rules, ["rotatedPage"]);
  }
  if (!allText.includes("등기사항전부증명서")) {
    return nothingRead(rules, ["notDeungi"]);
  }

  const sectioned = sectionRows(rows);
  const header = readHeader(rows);
  const entries = readEntries(sectioned);
  const liveEntries = entries.filter((entry) => !entry.struck);
  const owners = readOwners(sectioned);
  const summaryRows = readSummaryRows(sectioned);

  const problems: DeungiProblemId[] = [];
  if (header.propertyKind !== "집합건물") problems.push("notCollective");
  if (header.withCancelled === false) problems.push("currentOnly");

  const summaryFound = hasSummary(sectioned);
  if (!summaryFound) problems.push("summaryMissing");

  const outcome = summaryFound
    ? crossCheck(liveEntries, summaryRows)
    : { agreed: false, differences: [] };
  const status: DeungiCrossCheck = !summaryFound
    ? "unavailable"
    : outcome.agreed
      ? "agreed"
      : "mismatch";
  if (status === "mismatch") problems.push("crossCheckMismatch");

  if (entries.some((entry) => entry.strikeAmbiguous)) problems.push("partialStrike");

  // 금액은 권리 단위로 본다. 부기등기 줄 하나에 금액이 없다는 것은 "못
  // 읽었다"가 아니다 — 그 줄은 금액을 적는 줄이 아니다.
  const liveRights = groupRights(liveEntries);
  const summaryRights = groupRights(summaryRows);
  const amountMissing = liveRights.some(
    (right) => AMOUNT_KINDS.includes(right.kind) && right.amountWon === null,
  );
  if (amountMissing) problems.push("amountUnreadable");

  const blocked =
    header.propertyKind !== "집합건물" ||
    status !== "agreed" ||
    entries.some((entry) => entry.strikeAmbiguous);

  const mortgage = totalOf(liveRights, summaryRights, ["근저당권"], blocked || amountMissing);
  const lease = totalOf(liveRights, summaryRights, ["전세권", "임차권"], blocked || amountMissing);

  const answers = decideAnswers({
    sectioned,
    header,
    liveEntries,
    summaryRows,
    owners,
    trusted: !blocked,
    mortgage,
    lease,
  });

  return {
    header,
    entries,
    liveEntries,
    owners,
    summaryRows,
    totals: { mortgage, lease },
    crossCheck: status,
    problems: problems.map((id) => problemOf(rules, id)),
    answers,
    leftToUser: [...LEFT_TO_USER],
  };
}

/**
 * 한 갈래의 금액 합계.
 *
 * 믿을 수 없는 상태(`blocked`)면 **금액이 아니라 모름을 낸다.** 확인한
 * 금액만 더해 놓고 모르는 값을 0원으로 두면 위험이 통째로 사라진다.
 */
function totalOf(
  liveRights: readonly DeungiRight[],
  summaryRights: readonly DeungiRight[],
  kinds: readonly DeungiEntry["kind"][],
  blocked: boolean,
): DeungiTotal {
  const mine = liveRights.filter((right) => kinds.includes(right.kind));
  const theirs = summaryRights.filter((right) => kinds.includes(right.kind));

  if (mine.length === 0 && theirs.length === 0 && !blocked) {
    return { won: 0, count: 0 };
  }
  // 요약에는 있는데 본문에서 살아 있는 항목을 못 찾았으면 합계를 낼 수
  // 없다. 대조가 이미 걸러 내지만, 여기서도 0원으로 내려가지 않게 막는다.
  if (blocked || mine.length === 0 || mine.some((right) => right.amountWon === null)) {
    return { won: null, count: null };
  }
  const won = mine.reduce((sum, right) => sum + (right.amountWon ?? 0), 0);
  return { won, count: mine.length };
}

interface DecideInput {
  sectioned: readonly SectionedRow[];
  header: DeungiHeader;
  liveEntries: readonly DeungiEntry[];
  summaryRows: readonly DeungiSummaryRow[];
  owners: readonly DeungiOwner[];
  trusted: boolean;
  mortgage: DeungiTotal;
  lease: DeungiTotal;
}

/**
 * 읽은 사실을 문진의 답으로 옮긴다.
 *
 * 규칙은 두 방향으로 다르다.
 *
 * - **위험 신호(압류·가압류·가처분·가등기·경매개시결정)는 한쪽에서만
 *   보여도 "있어요"다.** 본문과 요약이 어긋나 다른 항목이 전부 모름이
 *   되더라도 이것만은 그대로 내보낸다. 위험을 늦게 말하는 것보다 이르게
 *   말하는 쪽으로 틀린다.
 * - **"없어요"는 두 경로가 서로 맞았을 때만 낸다.** 없다고 말하는 것은
 *   통과를 뜻하고, 통과는 우리가 확신할 때만 해야 한다.
 */
function decideAnswers(input: DecideInput): RightsAnswers {
  const { sectioned, header, liveEntries, summaryRows, owners, trusted } = input;
  const answers = unknownAnswers();

  // 표제부의 대지권. 요약에 없는 항목이라 본문만 본다 — 대신 집합건물
  // 등기부일 때만, 그리고 "대지권의 표시"와 "대지권비율"이 둘 다
  // 보일 때만 등기된 것으로 읽는다.
  const pyojebu = sectionText(sectioned, "표제부");
  if (header.propertyKind === "집합건물") {
    if (pyojebu.includes("대지권미등기")) {
      answers.landRight = answer("missing");
    } else if (pyojebu.includes("대지권의표시") && pyojebu.includes("대지권비율")) {
      answers.landRight = answer("registered");
    }
  }

  const liveOf = (kinds: readonly DeungiEntry["kind"][]): boolean =>
    liveEntries.some((entry) => kinds.includes(entry.kind)) ||
    summaryRows.some((row) => kinds.includes(row.kind));

  if (liveOf(["압류", "가압류", "가처분", "가등기"])) {
    answers.seizure = answer("present");
  } else if (trusted) {
    answers.seizure = answer("none");
  }

  if (liveOf(["경매개시결정"])) {
    answers.auction = answer("present");
  } else if (trusted) {
    answers.auction = answer("none");
  }

  // 신탁과 지상권은 요약의 어느 표에 실리는지가 갈려서 대조로 지킬 수
  // 없다. 그래서 **말소된 줄까지 포함해 한 번이라도 나오면 모름**으로
  // 둔다. 신탁은 계약 상대가 수탁자인지 위탁자인지에 따라 등급이
  // 갈리는데 그건 계약서를 봐야 알 수 있어서, 있으면 어차피 모름이다.
  const gapgu = sectionText(sectioned, "갑구");
  if (gapgu.includes("신탁")) {
    answers.trust = answer("unknown");
  } else if (trusted) {
    answers.trust = answer("none");
  }

  const eulgu = sectionText(sectioned, "을구");
  if (liveEntries.some((entry) => entry.kind === "지상권")) {
    answers.superficies = answer("present");
  } else if (eulgu.includes("지상권")) {
    answers.superficies = answer("unknown");
  } else if (trusted) {
    answers.superficies = answer("none");
  }

  if (trusted) {
    const coOwned =
      owners.length > 1 ||
      liveEntries.some((entry) => entry.kind === "소유권" && compact(entry.text).includes("공유자"));
    if (coOwned) answers.coOwnership = answer("multiple");
    else if (owners.length === 1) answers.coOwnership = answer("single");
  }

  answers.mortgage = amountAnswer(input.mortgage);
  answers.leaseRight = amountAnswer(input.lease);

  return answers;
}

/** 금액 합계를 문진의 답으로. 모름은 절대 0원이 되지 않는다 */
function amountAnswer(total: DeungiTotal): RightsAnswer {
  if (total.won === null) return answer("unknown");
  if (total.won === 0 && total.count === 0) return answer("none", 0);
  return answer("known", total.won);
}

/**
 * PDF 바이트 하나를 문진의 답까지 읽어 낸다.
 *
 * 화면이 부를 자리다. 실패해도 던지지 않는다 — 실패는 **모름**이라는
 * 결과로 나온다.
 */
export async function parseDeungiPdf(
  rules: DeungiRules,
  bytes: Uint8Array,
): Promise<DeungiReading> {
  return readDeungi(rules, await readPdfGeometry(bytes));
}
