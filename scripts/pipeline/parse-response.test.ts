import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseResponse } from "./parse-response";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(HERE, "fixtures/sample-response.json"), "utf8");

describe("parseResponse", () => {
  it("실제 응답에서 거래를 읽어낸다", () => {
    const { trades, failures, cancelled } = parseResponse(SAMPLE);
    expect(trades.length).toBe(20);
    expect(failures).toBe(0);
    expect(cancelled).toBe(0);
  });

  it("첫 레코드의 필드를 실제 값대로 매핑한다", () => {
    const { trades } = parseResponse(SAMPLE);
    const first = trades[0];
    expect(first).toBeDefined();
    expect(first).toEqual({
      regionCode: "11680",
      legalDongName: "수서동",
      complexName: "까치마을",
      builtYear: 1993,
      exclusiveAreaSqm: 34.44,
      floor: 6,
      price: 1_450_000_000,
      contractDate: "2026-06-20",
    });
  });

  it("금액을 만원 단위 콤마 문자열에서 원 단위 정수로 바꾼다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(Number.isInteger(t.price)).toBe(true);
      // 아파트 거래가 1억 미만이거나 1조 이상이면 단위 변환이 틀린 것이다
      expect(t.price).toBeGreaterThan(100_000_000);
      expect(t.price).toBeLessThan(1_000_000_000_000);
    }
  });

  it("시군구 코드를 문자열로 만든다 — API는 숫자로 준다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(typeof t.regionCode).toBe("string");
      expect(t.regionCode).toBe("11680");
    }
  });

  it("계약일을 YYYY-MM-DD로 만든다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(t.contractDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("면적과 건축년도가 숫자다", () => {
    const { trades } = parseResponse(SAMPLE);
    for (const t of trades) {
      expect(Number.isFinite(t.exclusiveAreaSqm)).toBe(true);
      expect(t.exclusiveAreaSqm).toBeGreaterThan(0);
      expect(Number.isInteger(t.builtYear)).toBe(true);
      expect(t.builtYear).toBeGreaterThan(1900);
    }
  });

  it("items가 빈 문자열이면(해당 월 거래 없음) 빈 배열이고 실패 0이다", () => {
    const empty = '{"response":{"body":{"items":""}}}';
    const { trades, failures, cancelled } = parseResponse(empty);
    expect(trades).toEqual([]);
    expect(failures).toBe(0);
    expect(cancelled).toBe(0);
  });

  it("item이 배열이 아니라 단일 객체여도(거래 1건) 처리한다", () => {
    const single = JSON.stringify({
      response: {
        body: {
          items: {
            item: JSON.parse(SAMPLE).response.body.items.item[0],
          },
        },
      },
    });
    const { trades, failures } = parseResponse(single);
    expect(trades.length).toBe(1);
    expect(failures).toBe(0);
  });

  it("망가진 레코드는 버리되 세어서 알린다", () => {
    const broken = SAMPLE.replace(/"buildYear":1993/, '"buildYear":"연도아님"');
    const { trades, failures } = parseResponse(broken);
    expect(failures).toBe(1);
    expect(trades.length).toBe(19);
  });

  it("cdealType이 공백이 아닌 해제 거래는 cancelled로 세고 trades에서 뺀다 — failures와 섞지 않는다", () => {
    const withCancelled = SAMPLE.replace(
      /"cdealType":" "/,
      '"cdealType":"O"',
    );
    const { trades, failures, cancelled } = parseResponse(withCancelled);
    expect(cancelled).toBe(1);
    expect(failures).toBe(0);
    expect(trades.length).toBe(19);
  });

  it("파싱 불가한 본문에도 예외를 던지지 않고 빈 결과를 돌려준다", () => {
    expect(() => parseResponse("전혀 응답이 아님")).not.toThrow();
    const result = parseResponse("전혀 응답이 아님");
    expect(result).toEqual({ trades: [], failures: 0, cancelled: 0 });
  });
});
