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

  it("cdealType 필드 자체가 없으면(=값이 undefined) 정상 거래로 보지 않고 failures로 센다", () => {
    // JSON에는 undefined가 없어 "필드 없음"과 "값이 undefined"는 파싱 후 동일하게
    // item.cdealType === undefined 로 관측된다 — 두 케이스를 하나로 검증한다.
    const missingField = SAMPLE.replace('"cdealType":" ",', "");
    const { trades, failures, cancelled } = parseResponse(missingField);
    expect(failures).toBe(1);
    expect(cancelled).toBe(0);
    expect(trades.length).toBe(19);
  });

  it("cdealType이 null이면 정상 거래로 보지 않고 failures로 센다", () => {
    const nullType = SAMPLE.replace('"cdealType":" "', '"cdealType":null');
    const { trades, failures, cancelled } = parseResponse(nullType);
    expect(failures).toBe(1);
    expect(cancelled).toBe(0);
    expect(trades.length).toBe(19);
  });

  it("cdealType이 문자열이 아닌 숫자면 정상 거래로 보지 않고 failures로 센다", () => {
    const numericType = SAMPLE.replace('"cdealType":" "', '"cdealType":0');
    const { trades, failures, cancelled } = parseResponse(numericType);
    expect(failures).toBe(1);
    expect(cancelled).toBe(0);
    expect(trades.length).toBe(19);
  });

  it("파싱 불가한 본문(JSON이 아님)에는 예외를 던지지 않고 오류로 표시한다 — 거래 0건으로 착각하지 않는다", () => {
    // C1: 게이트웨이 XML처럼 JSON으로 읽을 수 없는 본문. 예전에는 이 경우가
    // "거래 없음"과 구분되지 않아 빈 봉투가 그대로 캐시됐다.
    expect(() => parseResponse("전혀 응답이 아님")).not.toThrow();
    const result = parseResponse("전혀 응답이 아님");
    expect(result.trades).toEqual([]);
    expect(result.failures).toBe(0);
    expect(result.cancelled).toBe(0);
    expect(typeof result.error).toBe("string");
  });

  it("게이트웨이 XML 봉투(HTTP 200이지만 JSON이 아님)를 오류로 표시한다", () => {
    const gatewayXml =
      '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>' +
      "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>" +
      "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const result = parseResponse(gatewayXml);
    expect(result.trades).toEqual([]);
    expect(typeof result.error).toBe("string");
  });

  it("resultCode가 성공(00/000)이 아닌 JSON 응답을 오류로 표시하고 거래를 만들지 않는다", () => {
    const serviceError = JSON.stringify({
      response: {
        header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" },
        body: { items: "", numOfRows: 10, pageNo: 1, totalCount: 0 },
      },
    });
    const result = parseResponse(serviceError);
    expect(result.trades).toEqual([]);
    expect(result.failures).toBe(0);
    expect(typeof result.error).toBe("string");
    expect(result.error).toContain("22");
  });

  it("resultCode가 00이면 성공으로 본다(공공데이터포털 공통 성공 코드)", () => {
    const ok = JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
        body: { items: "" },
      },
    });
    const result = parseResponse(ok);
    expect(result.error).toBeNull();
    expect(result.trades).toEqual([]);
  });

  it("resultCode가 000이고 진짜 거래 0건이면 오류가 아니라 정상 빈 결과다", () => {
    const realEmpty = JSON.stringify({
      response: {
        header: { resultCode: "000", resultMsg: "OK" },
        body: { items: "", numOfRows: 10, pageNo: 1, totalCount: 0 },
      },
    });
    const result = parseResponse(realEmpty);
    expect(result.error).toBeNull();
    expect(result.trades).toEqual([]);
    expect(result.failures).toBe(0);
  });

  it("정상 응답(SAMPLE)은 error가 null이다", () => {
    const result = parseResponse(SAMPLE);
    expect(result.error).toBeNull();
  });

  it("오류 메시지에 원본 응답 본문 전체를 통째로 담지 않는다(길이 제한)", () => {
    const hugeMsg = "x".repeat(5000);
    const serviceError = JSON.stringify({
      response: {
        header: { resultCode: "99", resultMsg: hugeMsg },
        body: {},
      },
    });
    const result = parseResponse(serviceError);
    expect(typeof result.error).toBe("string");
    expect((result.error ?? "").length).toBeLessThan(1000);
  });
});
