import { describe, expect, it, vi } from "vitest";
import { fetchHouseholdCount } from "./householdCountApi";

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
