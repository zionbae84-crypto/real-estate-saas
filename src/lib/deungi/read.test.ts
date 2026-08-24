import { describe, expect, it } from "vitest";
import type { DeungiRow } from "./layout";
import { classifyPurpose, mainRankOf, parseWon, readAddress, readHeader } from "./read";
import type { DeungiTextPiece } from "./types";

function row(text: string): DeungiRow {
  const pieces: DeungiTextPiece[] = [
    { text, x: 30, endX: 30 + text.length * 9, baselineY: 700, height: 9 },
  ];
  return { pageNumber: 1, y: 700, text, struckCount: 0, pieceCount: 1, pieces };
}

describe("금액 읽기", () => {
  it("등기부의 금액 표기를 원 단위 정수로 읽는다", () => {
    expect(parseWon("금1,800,000,000원")).toBe(1_800_000_000);
    expect(parseWon("채권최고액 금 400,000,000 원")).toBe(400_000_000);
  });

  it("금액이 아니면 null이다 — 0원이 아니다", () => {
    expect(parseWon("채권최고액 금(판독불가)")).toBeNull();
    expect(parseWon("")).toBeNull();
    expect(parseWon("제86890호")).toBeNull();
  });
});

describe("등기목적 갈래", () => {
  const cases: Array<[string, string]> = [
    ["근저당권설정", "근저당권"],
    // 말소기록은 근저당권이 아니다. 금액 없는 근저당이 하나 더 생기면
    // 합계를 낼 수 없게 되고, 그 문서는 통째로 모름이 된다.
    ["근저당권설정등기말소", "기타"],
    ["1번근저당권말소", "기타"],
    ["소유권이전청구권가등기", "가등기"],
    ["가압류", "가압류"],
    ["압류", "압류"],
    ["가처분", "가처분"],
    ["임의경매개시결정", "경매개시결정"],
    ["강제경매개시결정", "경매개시결정"],
    ["신탁", "신탁"],
    ["전세권설정", "전세권"],
    ["주택임차권", "임차권"],
    ["지상권설정", "지상권"],
    ["소유권이전", "소유권"],
    ["", "기타"],
  ];

  it.each(cases)("%s → %s", (purpose, kind) => {
    expect(classifyPurpose(purpose)).toBe(kind);
  });
});

describe("순위번호", () => {
  it("부기등기는 주 번호에 묶인다", () => {
    expect(mainRankOf("3-1")).toBe("3");
    expect(mainRankOf("12")).toBe("12");
  });
});

describe("주소 읽기", () => {
  it("소재지번·건물명·호를 조각내고 원문도 남긴다", () => {
    const address = readAddress([
      row("[집합건물] 경기도 파주시 금촌동 329-158외 2필지 엠에이치타워 제6층 제605호"),
    ]);

    expect(address?.raw).toBe("경기도 파주시 금촌동 329-158외 2필지 엠에이치타워 제6층 제605호");
    expect(address?.lot).toBe("경기도 파주시 금촌동 329-158외 2필지");
    expect(address?.buildingName).toBe("엠에이치타워");
    expect(address?.ho).toBe("제605호");
  });

  it("동이 있는 아파트도 읽는다", () => {
    const address = readAddress([
      row("[집합건물] 서울특별시 노원구 상계동 100 상계주공아파트 제101동 제5층 제502호"),
    ]);

    expect(address?.lot).toBe("서울특별시 노원구 상계동 100");
    expect(address?.buildingName).toBe("상계주공아파트");
    expect(address?.dong).toBe("제101동");
    expect(address?.ho).toBe("제502호");
  });

  it("부동산 표시 줄이 없으면 null이다", () => {
    expect(readAddress([row("등기사항전부증명서(말소사항 포함)")])).toBeNull();
  });
});

describe("머리말 읽기", () => {
  it("아무것도 못 읽으면 전부 모름으로 남는다", () => {
    const header = readHeader([row("아무 문서")]);

    expect(header.purpose).toBe("unknown");
    expect(header.issuedAt).toBeNull();
    expect(header.issuedAtIso).toBeNull();
    expect(header.uniqueNumber).toBeNull();
    expect(header.propertyKind).toBeNull();
    expect(header.withCancelled).toBeNull();
    expect(header.address).toBeNull();
  });
});
