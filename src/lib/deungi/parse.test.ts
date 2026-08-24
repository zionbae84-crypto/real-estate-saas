import { describe, expect, it } from "vitest";
import rawDeungiRules from "../../../rules/deungi-2026-08.json";
import rawRightsRules from "../../../rules/rights-2026-08.json";
import { assessRights, parseRightsRules } from "../rights";
import {
  COVERED_ITEM_IDS,
  LEFT_TO_USER,
  parseDeungiPdf,
  type DeungiReading,
} from "./parse";
import { parseDeungiRules } from "./rules";
import { buildPdf } from "./synthetic";
import {
  buildDeungiPdf,
  sampleDeungi,
  type SyntheticDeungi,
  type SyntheticEntry,
} from "./synthetic-deungi";

/**
 * 합성 등기부 PDF를 실제로 파싱해 문진의 답까지 확인한다.
 *
 * 여기서 잠그는 것은 하나다. **못 읽은 것이 "없음"으로 새지 않는다.**
 * 말소선을 놓치거나, 본문과 요약이 어긋나거나, 아예 등기부가 아니거나,
 * 어느 경우에도 결과가 "걸리는 게 없는 등기부"로 나가지 않아야 한다.
 */

const rules = parseDeungiRules(rawDeungiRules);
const rightsRules = parseRightsRules(rawRightsRules);

const 말소된_근저당 = 1_800_000_000;
const 살아있는_근저당_합계 = 1_920_000_000 + 400_000_000;

async function read(spec: SyntheticDeungi): Promise<DeungiReading> {
  return parseDeungiPdf(rules, buildDeungiPdf(spec));
}

function problemIds(reading: DeungiReading): string[] {
  return reading.problems.map((problem) => problem.id);
}

/** 갑구에 항목 하나를 더한 등기부. 요약에도 같은 줄을 넣어 대조가 맞게 둔다 */
function withGapguEntry(entry: SyntheticEntry, inSummary = true): SyntheticDeungi {
  const spec = sampleDeungi();
  spec.gapgu = [...spec.gapgu, entry];
  if (spec.summary !== null && inSummary) {
    spec.summary.gapgu = [
      ...spec.summary.gapgu,
      {
        rank: entry.rank,
        purpose: entry.purpose,
        received: entry.received,
        detail: entry.detail[0] ?? "",
        target: "김한결",
      },
    ];
  }
  return spec;
}

describe("등기부 PDF 파서", () => {
  describe("말소선", () => {
    it("말소선이 그어진 근저당은 채권최고액 합계에서 빠진다", async () => {
      const reading = await read(sampleDeungi());

      expect(reading.crossCheck).toBe("agreed");
      expect(reading.totals.mortgage.won).toBe(살아있는_근저당_합계);
      expect(reading.totals.mortgage.count).toBe(2);
      // 말소된 18억이 합계에 들어갔다면 41.2억이 된다.
      expect(reading.totals.mortgage.won).not.toBe(살아있는_근저당_합계 + 말소된_근저당);
    });

    it("말소된 항목도 목록에는 남는다 — 사람이 대조할 수 있어야 한다", async () => {
      const reading = await read(sampleDeungi());

      const struck = reading.entries.filter((entry) => entry.struck);
      expect(struck).toHaveLength(1);
      expect(struck[0]?.amountWon).toBe(말소된_근저당);
      expect(struck[0]?.holder).toBe("상도새마을금고");
      expect(reading.liveEntries.some((entry) => entry.amountWon === 말소된_근저당)).toBe(false);
    });

    it("표 괘선은 말소선으로 읽히지 않는다", async () => {
      // 모든 근저당이 살아 있는 문서. 표 괘선을 말소선으로 읽으면 살아
      // 있는 항목이 사라지고 요약과 어긋난다.
      const spec = sampleDeungi();
      const eulgu = spec.eulgu.map((entry) => ({ ...entry, struck: false }));
      spec.eulgu = eulgu;
      if (spec.summary !== null) {
        spec.summary.eulgu = [
          {
            rank: "1",
            purpose: "근저당권설정",
            received: "2021년5월20일 제12346호",
            detail: "채권최고액 금1,800,000,000원",
            target: "김한결",
          },
          ...spec.summary.eulgu,
        ];
      }

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("agreed");
      expect(reading.entries.every((entry) => !entry.struck)).toBe(true);
      expect(reading.totals.mortgage.won).toBe(살아있는_근저당_합계 + 말소된_근저당);
    });

    it("한 항목의 일부 칸에만 줄이 그어져 있으면 금액을 모름으로 둔다", async () => {
      const spec = sampleDeungi();
      spec.eulgu = spec.eulgu.map((entry) =>
        entry.rank === "1" ? { ...entry, struck: true, strikePartial: true } : entry,
      );

      const reading = await read(spec);
      expect(problemIds(reading)).toContain("partialStrike");
      expect(reading.totals.mortgage.won).toBeNull();
      expect(reading.answers.mortgage?.optionId).toBe("unknown");
      expect(reading.answers.mortgage?.amountWon).toBeNull();
    });
  });

  describe("본문과 요약의 대조", () => {
    it("요약에 있는 근저당이 본문에서 말소로 읽히면 모름으로 간다", async () => {
      // 본문은 그대로 두고 요약에만 말소된 항목을 넣는다 — 우리가 말소선을
      // 잘못 읽었을 때와 같은 모양이다.
      const spec = sampleDeungi();
      if (spec.summary !== null) {
        spec.summary.eulgu = [
          {
            rank: "1",
            purpose: "근저당권설정",
            received: "2021년5월20일 제12346호",
            detail: "채권최고액 금1,800,000,000원",
            target: "김한결",
          },
          ...spec.summary.eulgu,
        ];
      }

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("mismatch");
      expect(problemIds(reading)).toContain("crossCheckMismatch");
      expect(reading.totals.mortgage.won).toBeNull();
      expect(reading.answers.mortgage?.optionId).toBe("unknown");
    });

    it("금액이 서로 다르면 모름으로 간다", async () => {
      const spec = sampleDeungi();
      if (spec.summary !== null) {
        spec.summary.eulgu = spec.summary.eulgu.map((row) =>
          row.rank === "2" ? { ...row, detail: "채권최고액 금900,000,000원" } : row,
        );
      }

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("mismatch");
      expect(reading.totals.mortgage.won).toBeNull();
      expect(reading.answers.mortgage?.optionId).toBe("unknown");
    });

    it("요약이 없으면 맞춰 볼 상대가 없어 모름으로 간다", async () => {
      const spec = sampleDeungi();
      spec.summary = null;

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("unavailable");
      expect(problemIds(reading)).toContain("summaryMissing");
      for (const itemId of COVERED_ITEM_IDS) {
        if (itemId === "landRight") continue;
        expect(reading.answers[itemId]?.optionId).toBe("unknown");
      }
    });
  });

  describe("읽을 수 없는 파일", () => {
    it("빈 PDF는 '깨끗한 등기부'가 되지 않는다", async () => {
      const reading = await parseDeungiPdf(rules, buildPdf([{ texts: [], lines: [] }]));

      expect(problemIds(reading)).toContain("notDeungi");
      expectAllUnknown(reading);
    });

    it("글자가 없는 PDF(이미지만 있는 문서)는 모름이 된다", async () => {
      const reading = await parseDeungiPdf(
        rules,
        buildPdf([{ texts: [], lines: [{ x0: 20, x1: 500, y: 400 }] }]),
      );

      expect(problemIds(reading)).toContain("noText");
      expectAllUnknown(reading);
    });

    it("PDF가 아닌 바이트는 모름이 된다", async () => {
      const reading = await parseDeungiPdf(rules, new TextEncoder().encode("hello"));
      expectAllUnknown(reading);
    });

    it("다른 문서는 모름이 된다", async () => {
      const reading = await parseDeungiPdf(
        rules,
        buildPdf([
          {
            texts: [
              { text: "건축물대장", x: 200, y: 700 },
              { text: "위반건축물 표시 없음", x: 100, y: 660 },
            ],
            lines: [],
          },
        ]),
      );

      expect(problemIds(reading)).toContain("notDeungi");
      expectAllUnknown(reading);
    });

    it("쪽이 돌아가 있으면 읽기를 멈춘다", async () => {
      const spec = sampleDeungi();
      const bytes = buildDeungiPdf(spec);
      // 회전된 쪽을 가진 문서를 따로 만든다.
      const rotated = buildPdf([
        {
          texts: [{ text: "등기사항전부증명서(말소사항 포함)", x: 100, y: 700 }],
          lines: [],
          rotate: 90,
        },
      ]);
      expect(bytes.length).toBeGreaterThan(0);

      const reading = await parseDeungiPdf(rules, rotated);
      expect(problemIds(reading)).toContain("rotatedPage");
      expectAllUnknown(reading);
    });
  });

  describe("갑구의 위험 신호", () => {
    const cases: Array<{ 이름: string; purpose: string; itemId: string }> = [
      { 이름: "압류", purpose: "압류", itemId: "seizure" },
      { 이름: "가압류", purpose: "가압류", itemId: "seizure" },
      { 이름: "가처분", purpose: "가처분", itemId: "seizure" },
      { 이름: "가등기", purpose: "소유권이전청구권가등기", itemId: "seizure" },
      { 이름: "임의경매개시결정", purpose: "임의경매개시결정", itemId: "auction" },
      { 이름: "강제경매개시결정", purpose: "강제경매개시결정", itemId: "auction" },
    ];

    it.each(cases)("$이름을 잡아낸다", async ({ purpose, itemId }) => {
      const reading = await read(
        withGapguEntry({
          rank: "3",
          purpose,
          received: "2025년1월9일 제77001호",
          cause: "2025년1월8일 결정",
          detail: ["권리자 국민건강보험공단"],
        }),
      );

      expect(reading.answers[itemId]?.optionId).toBe("present");
      expect(reading.entries.some((entry) => entry.purpose === purpose)).toBe(true);
    });

    it("말소된 압류는 '있어요'로 세지 않는다", async () => {
      const spec = withGapguEntry(
        {
          rank: "3",
          purpose: "압류",
          received: "2023년11월28일 제86890호",
          cause: "2023년11월27일 압류",
          detail: ["권리자 국민건강보험공단"],
          struck: true,
        },
        false,
      );

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("agreed");
      expect(reading.answers.seizure?.optionId).toBe("none");
    });

    it("신탁등기가 있으면 계약 상대를 우리가 모르므로 모름이 된다", async () => {
      const reading = await read(
        withGapguEntry(
          {
            rank: "3",
            purpose: "신탁",
            received: "2024년6월1일 제30001호",
            cause: "신탁",
            detail: ["신탁원부 제2024-115호"],
          },
          false,
        ),
      );

      expect(reading.answers.trust?.optionId).toBe("unknown");
    });

    it("신탁이 없으면 '없어요'가 된다", async () => {
      const reading = await read(sampleDeungi());
      expect(reading.answers.trust?.optionId).toBe("none");
    });
  });

  describe("을구", () => {
    it("전세권의 전세금을 합계에 넣는다", async () => {
      const spec = sampleDeungi();
      spec.eulgu = [
        ...spec.eulgu,
        {
          rank: "4",
          purpose: "전세권설정",
          received: "2025년3월2일 제10101호",
          cause: "2025년3월1일 설정계약",
          detail: ["전세금 금500,000,000원", "전세권자 박서준"],
        },
      ];
      if (spec.summary !== null) {
        spec.summary.eulgu = [
          ...spec.summary.eulgu,
          {
            rank: "4",
            purpose: "전세권설정",
            received: "2025년3월2일 제10101호",
            detail: "전세금 금500,000,000원",
            target: "김한결",
          },
        ];
      }

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("agreed");
      expect(reading.totals.lease.won).toBe(500_000_000);
      expect(reading.answers.leaseRight?.optionId).toBe("known");
      expect(reading.answers.leaseRight?.amountWon).toBe(500_000_000);
    });

    it("임차권의 보증금을 읽고 월 차임과 헷갈리지 않는다", async () => {
      // 임차권등기 줄에는 보증금과 차임이 함께 적힌다. 이름표를 보지 않고
      // 아무 숫자나 읽으면 보증금 1억이 차임 50만원이 될 수 있다.
      const spec = sampleDeungi();
      spec.eulgu = [
        ...spec.eulgu,
        {
          rank: "4",
          purpose: "주택임차권",
          received: "2025년6월9일 제40404호",
          cause: "2025년6월1일 임차권등기명령",
          detail: [
            "차임 금500,000원",
            "임차보증금 금100,000,000원",
            "임차권자 최유진",
          ],
        },
      ];
      if (spec.summary !== null) {
        spec.summary.eulgu = [
          ...spec.summary.eulgu,
          {
            rank: "4",
            purpose: "주택임차권",
            received: "2025년6월9일 제40404호",
            detail: "임차보증금 금100,000,000원",
            target: "김한결",
          },
        ];
      }

      const reading = await read(spec);
      expect(reading.crossCheck).toBe("agreed");
      expect(reading.totals.lease.won).toBe(100_000_000);
      expect(reading.answers.leaseRight?.amountWon).toBe(100_000_000);
    });

    it("지상권이 있으면 잡아낸다", async () => {
      const spec = sampleDeungi();
      spec.eulgu = [
        ...spec.eulgu,
        {
          rank: "4",
          purpose: "지상권설정",
          received: "2025년4월2일 제20202호",
          cause: "2025년4월1일 설정계약",
          detail: ["지상권자 한국전력공사"],
        },
      ];

      const reading = await read(spec);
      expect(reading.answers.superficies?.optionId).toBe("present");
    });

    it("전세권도 임차권도 없으면 0원이 된다", async () => {
      const reading = await read(sampleDeungi());
      expect(reading.totals.lease.won).toBe(0);
      expect(reading.answers.leaseRight?.optionId).toBe("none");
      expect(reading.answers.superficies?.optionId).toBe("none");
    });

    it("금액을 읽지 못한 근저당이 있으면 합계를 내지 않는다", async () => {
      const spec = sampleDeungi();
      spec.eulgu = spec.eulgu.map((entry) =>
        entry.rank === "2"
          ? { ...entry, detail: ["채권최고액 금(판독불가)", "근저당권자 영북농업협동조합"] }
          : entry,
      );

      const reading = await read(spec);
      expect(problemIds(reading)).toContain("amountUnreadable");
      expect(reading.totals.mortgage.won).toBeNull();
      expect(reading.answers.mortgage?.optionId).toBe("unknown");
    });
  });

  describe("머리말", () => {
    it("열람용과 열람일시와 고유번호를 읽는다", async () => {
      const reading = await read(sampleDeungi());

      expect(reading.header.purpose).toBe("read");
      expect(reading.header.issuedAt).toBe("2026년08월20일 13시36분53초");
      expect(reading.header.issuedAtIso).toBe("2026-08-20T13:36:53");
      expect(reading.header.uniqueNumber).toBe("2849-2021-011575");
      expect(reading.header.withCancelled).toBe(true);
      expect(reading.header.propertyKind).toBe("집합건물");
    });

    it("발급용을 열람용과 가른다", async () => {
      const spec = sampleDeungi();
      spec.stamp = "발 급 용";
      const reading = await read(spec);
      expect(reading.header.purpose).toBe("issued");
    });

    it("도장이 없으면 모름으로 둔다", async () => {
      const spec = sampleDeungi();
      spec.stamp = null;
      const reading = await read(spec);
      expect(reading.header.purpose).toBe("unknown");
    });

    it("'현재 유효사항'으로 뗀 등기부라고 알려 준다", async () => {
      const spec = sampleDeungi();
      spec.title = "등기사항전부증명서(현재 유효사항)";
      const reading = await read(spec);
      expect(reading.header.withCancelled).toBe(false);
      expect(problemIds(reading)).toContain("currentOnly");
    });

    it("주소를 조각내고 원문도 남긴다", async () => {
      const reading = await read(sampleDeungi());
      const address = reading.header.address;

      expect(address?.raw).toBe(
        "경기도 파주시 금촌동 329-158외 2필지 엠에이치타워 제6층 제605호",
      );
      expect(address?.lot).toBe("경기도 파주시 금촌동 329-158외 2필지");
      expect(address?.buildingName).toBe("엠에이치타워");
      expect(address?.ho).toBe("제605호");
    });
  });

  describe("표제부와 소유자", () => {
    it("대지권이 등기돼 있으면 그렇게 읽는다", async () => {
      const reading = await read(sampleDeungi());
      expect(reading.answers.landRight?.optionId).toBe("registered");
    });

    it("대지권 미등기를 잡아낸다", async () => {
      const spec = sampleDeungi();
      spec.pyojebu = ["( 대지권의 표시 )", "1 대지권 미등기"];
      const reading = await read(spec);
      expect(reading.answers.landRight?.optionId).toBe("missing");
    });

    it("소유자가 한 명이면 단독소유로 읽는다", async () => {
      const reading = await read(sampleDeungi());
      expect(reading.owners).toHaveLength(1);
      expect(reading.owners[0]?.name).toBe("김한결");
      expect(reading.answers.coOwnership?.optionId).toBe("single");
    });

    it("소유자가 여럿이면 공유로 읽는다", async () => {
      const spec = sampleDeungi();
      if (spec.summary !== null) {
        spec.summary.owners = [
          {
            name: "김한결",
            registration: "800101-1******",
            share: "2분의1",
            address: "경기도 파주시 금촌로 12",
            rank: "2",
          },
          {
            name: "이보람",
            registration: "820202-2******",
            share: "2분의1",
            address: "경기도 파주시 금촌로 12",
            rank: "2",
          },
        ];
      }

      const reading = await read(spec);
      expect(reading.owners).toHaveLength(2);
      expect(reading.answers.coOwnership?.optionId).toBe("multiple");
    });
  });

  describe("문진 엔진으로 넘길 때", () => {
    it("채권최고액 합계가 기존 권리 합계 계산에 그대로 들어간다", async () => {
      const reading = await read(sampleDeungi());
      const assessment = assessRights(rightsRules, reading.answers, 3_000_000_000);

      expect(assessment.encumbrance.knownTotal).toBe(살아있는_근저당_합계);
      expect(assessment.encumbrance.unknownItemIds).toEqual(["priorDeposit"]);
    });

    it("등기부만으로 답할 수 없는 항목은 빈칸으로 남는다", async () => {
      const reading = await read(sampleDeungi());

      for (const itemId of LEFT_TO_USER) {
        expect(reading.answers[itemId]).toBeUndefined();
      }
      const assessment = assessRights(rightsRules, reading.answers, 3_000_000_000);
      expect(assessment.unansweredItemIds).toEqual([...LEFT_TO_USER]);
    });

    it("어떤 등기부로도 이 파서 혼자서는 clear가 나오지 않는다", async () => {
      const readings = [
        await read(sampleDeungi()),
        await parseDeungiPdf(rules, buildPdf([{ texts: [], lines: [] }])),
      ];

      for (const reading of readings) {
        const assessment = assessRights(rightsRules, reading.answers, 3_000_000_000);
        expect(assessment.overall).not.toBe("clear");
      }
    });

    it("파서가 내는 선택지 id는 모두 문진 룰셋에 실제로 있다", async () => {
      const spec = withGapguEntry({
        rank: "3",
        purpose: "압류",
        received: "2025년1월9일 제77001호",
        cause: "2025년1월8일 압류",
        detail: ["권리자 국민건강보험공단"],
      });
      const readings = [
        await read(sampleDeungi()),
        await read(spec),
        await parseDeungiPdf(rules, buildPdf([{ texts: [], lines: [] }])),
      ];

      for (const reading of readings) {
        for (const [itemId, answer] of Object.entries(reading.answers)) {
          const item = rightsRules.items.find((candidate) => candidate.id === itemId);
          expect(item, `${itemId} 항목이 문진 룰셋에 없어요`).toBeDefined();
          expect(
            item?.options.some((option) => option.id === answer?.optionId),
            `${itemId}의 선택지 ${String(answer?.optionId)}가 문진 룰셋에 없어요`,
          ).toBe(true);
        }
      }
    });
  });
});

/** 파서가 다루는 모든 항목이 "모르겠어요"로 남았는가 */
function expectAllUnknown(reading: DeungiReading): void {
  for (const itemId of COVERED_ITEM_IDS) {
    expect(reading.answers[itemId]?.optionId, `${itemId}가 모름이 아니에요`).toBe("unknown");
    expect(reading.answers[itemId]?.amountWon).toBeNull();
  }
  expect(reading.totals.mortgage.won).toBeNull();
  expect(reading.totals.lease.won).toBeNull();
}
