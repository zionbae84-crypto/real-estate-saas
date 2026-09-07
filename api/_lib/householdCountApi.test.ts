import { describe, expect, it, vi } from "vitest";
import { fetchHouseholdCount, fetchHouseholdCountsByRegion } from "./householdCountApi";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchHouseholdCount", () => {
  it("찾으면 세대수를 반환한다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ UNIT_CNT: 499 }], matchCount: 1, totalCount: 307834 }),
    ) as unknown as typeof fetch;

    const result = await fetchHouseholdCount("1168010100109020000", "key", fetchImpl);
    expect(result).toBe(499);
  });

  it("소수점이 있어도 반올림한 정수를 낸다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ UNIT_CNT: 182.0 }] }),
    ) as unknown as typeof fetch;

    const result = await fetchHouseholdCount("PNU", "key", fetchImpl);
    expect(result).toBe(182);
  });

  it("못 찾으면(data 빈 배열) null을 반환한다 — 에러가 아니다", async () => {
    const fetchImpl = vi.fn(async () => response({ data: [], matchCount: 0 })) as unknown as typeof fetch;

    const result = await fetchHouseholdCount("PNU", "key", fetchImpl);
    expect(result).toBeNull();
  });

  it("UNIT_CNT가 없거나 형식이 아니면 null이다 — 지어내지 않는다", async () => {
    const fetchImpl = vi.fn(async () => response({ data: [{}] })) as unknown as typeof fetch;

    const result = await fetchHouseholdCount("PNU", "key", fetchImpl);
    expect(result).toBeNull();
  });

  it("요청에 PNU와 서비스키를 담는다", async () => {
    let capturedUrl: string | URL | undefined;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      capturedUrl = url;
      return response({ data: [] });
    }) as unknown as typeof fetch;

    await fetchHouseholdCount("1168010100109020000", "my-key", fetchImpl);

    const url = new URL(String(capturedUrl));
    expect(url.searchParams.get("cond[PNU::EQ]")).toBe("1168010100109020000");
    expect(url.searchParams.get("serviceKey")).toBe("my-key");
  });

  it("HTTP 실패면 던지고, 에러 메시지에서 키를 가린다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ code: -4, msg: "등록되지 않은 인증키 입니다." }, 401),
    ) as unknown as typeof fetch;

    await expect(fetchHouseholdCount("PNU", "my-secret-key", fetchImpl)).rejects.toThrow();
    try {
      await fetchHouseholdCount("PNU", "my-secret-key", fetchImpl);
    } catch (e) {
      expect((e as Error).message).not.toContain("my-secret-key");
    }
  });

  it("네트워크 오류도 던지고, 에러 메시지에서 키를 가린다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error: my-secret-key");
    }) as unknown as typeof fetch;

    try {
      await fetchHouseholdCount("PNU", "my-secret-key", fetchImpl);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("my-secret-key");
    }
  });
});

/*
 * ══════════════════════════════════════════════════════════════════
 * 시군구 일괄 조회
 * ══════════════════════════════════════════════════════════════════
 *
 * 실측(해운대구 26350): matchCount 2,300건을 3페이지에 정확히 다 받았고,
 * 접두어가 26350이 아닌 항목은 0건, 표본 12건을 단건 조회와 대조해
 * 12/12 값이 일치했다. 아래는 그 계약을 코드로 잠근다.
 */
describe("fetchHouseholdCountsByRegion", () => {
  /** perPage(1000)만큼 채운 한 페이지를 만든다 — 페이지가 더 있다는 신호다 */
  function fullPage(startIndex: number, matchCount: number) {
    return {
      matchCount,
      data: Array.from({ length: 1000 }, (_, i) => ({
        PNU: `26350${String(startIndex + i).padStart(14, "0")}`,
        UNIT_CNT: startIndex + i,
      })),
    };
  }

  it("PNU 접두어와 서비스키·perPage를 요청에 담는다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ PNU: "26350" + "0".repeat(14), UNIT_CNT: 5 }], matchCount: 1 }),
    ) as unknown as typeof fetch;

    await fetchHouseholdCountsByRegion("26350", "secret-key", fetchImpl);

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]));
    expect(url.searchParams.get("cond[PNU::LIKE]")).toBe("26350");
    expect(url.searchParams.get("serviceKey")).toBe("secret-key");
    expect(url.searchParams.get("perPage")).toBe("1000");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("matchCount만큼 페이지를 넘겨 전부 모은다", async () => {
    // 2,300건 = 1000 + 1000 + 300 (해운대구 실측과 같은 모양)
    const pages = [
      fullPage(0, 2300),
      fullPage(1000, 2300),
      {
        matchCount: 2300,
        data: Array.from({ length: 300 }, (_, i) => ({
          PNU: `26350${String(2000 + i).padStart(14, "0")}`,
          UNIT_CNT: 2000 + i,
        })),
      },
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => response(pages[call++])) as unknown as typeof fetch;

    const table = await fetchHouseholdCountsByRegion("26350", "k", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(table.size).toBe(2300);
    expect(table.get(`26350${String(2299).padStart(14, "0")}`)).toBe(2299);
  });

  it("마지막 페이지가 정원보다 적으면 거기서 멈춘다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ PNU: "26350" + "0".repeat(14), UNIT_CNT: 9 }], matchCount: 1 }),
    ) as unknown as typeof fetch;

    await fetchHouseholdCountsByRegion("26350", "k", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  /*
   * 실측에서 PNU가 겹치는 레코드가 1건 있었다. 단건 조회는 `perPage=1`로
   * `data[0]`만 읽으므로 "먼저 온 것이 답"이다 — 두 경로가 같은 PNU에
   * 다른 답을 내면 화면이 조회 방식에 따라 다른 세대수를 말하게 된다.
   */
  it("PNU가 겹치면 먼저 온 레코드가 이긴다 — 단건 조회(data[0])와 같은 규칙", async () => {
    const p = "26350" + "0".repeat(14);
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ PNU: p, UNIT_CNT: 100 }, { PNU: p, UNIT_CNT: 200 }], matchCount: 2 }),
    ) as unknown as typeof fetch;

    const table = await fetchHouseholdCountsByRegion("26350", "k", fetchImpl);

    expect(table.get(p)).toBe(100);
  });

  it("먼저 온 레코드의 세대수가 형식에 안 맞으면 그 PNU는 표에 없다 — 뒤 레코드로 덮지 않는다", async () => {
    const p = "26350" + "0".repeat(14);
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ PNU: p, UNIT_CNT: null }, { PNU: p, UNIT_CNT: 200 }], matchCount: 2 }),
    ) as unknown as typeof fetch;

    const table = await fetchHouseholdCountsByRegion("26350", "k", fetchImpl);

    expect(table.has(p)).toBe(false);
  });

  it("소수점은 반올림한다 — 단건 조회와 같다", async () => {
    const p = "26350" + "0".repeat(14);
    const fetchImpl = vi.fn(async () =>
      response({ data: [{ PNU: p, UNIT_CNT: 12.6 }], matchCount: 1 }),
    ) as unknown as typeof fetch;

    expect((await fetchHouseholdCountsByRegion("26350", "k", fetchImpl)).get(p)).toBe(13);
  });

  /*
   * 반쪽짜리 표를 돌려주면 호출부는 그것을 완전한 답으로 믿고 빠진
   * 단지를 "세대수 모름"으로 조용히 넘긴다. 그 침묵을 막는 검사다.
   */
  it("페이지 상한까지 끝나지 않으면 반쪽 표를 주는 대신 던진다", async () => {
    // 언제나 정원을 꽉 채워 돌려준다 — 끝이 안 난다.
    const fetchImpl = vi.fn(async () => response(fullPage(0, 999999))) as unknown as typeof fetch;

    await expect(fetchHouseholdCountsByRegion("26350", "k", fetchImpl)).rejects.toThrow(
      /끝나지 않았습니다/,
    );
  });

  it("HTTP 실패면 던지고, 에러 메시지에서 키를 가린다", async () => {
    const fetchImpl = vi.fn(async () => response({ error: "nope" }, 500)) as unknown as typeof fetch;

    await expect(
      fetchHouseholdCountsByRegion("26350", "secret-key-value", fetchImpl),
    ).rejects.toThrow(/일괄 조회 실패/);
    await expect(
      fetchHouseholdCountsByRegion("26350", "secret-key-value", fetchImpl),
    ).rejects.not.toThrow(/secret-key-value/);
  });

  it("네트워크 오류도 던지고, 에러 메시지에서 키를 가린다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed: secret-key-value");
    }) as unknown as typeof fetch;

    await expect(
      fetchHouseholdCountsByRegion("26350", "secret-key-value", fetchImpl),
    ).rejects.not.toThrow(/secret-key-value/);
  });
});
