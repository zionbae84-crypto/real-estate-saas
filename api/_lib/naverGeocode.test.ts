import { describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "./naverGeocode";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("geocodeAddress", () => {
  it("찾으면 좌표를 반환한다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        status: "OK",
        meta: { totalCount: 1 },
        addresses: [{ x: "127.105399", y: "37.3595704" }],
      }),
    ) as unknown as typeof fetch;

    const result = await geocodeAddress("서울특별시 강남구 역삼동 719-3", "id", "secret", fetchImpl);
    expect(result).toEqual({ lat: 37.3595704, lon: 127.105399 });
  });

  it("못 찾으면(addresses 빈 배열) null을 반환한다", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ status: "OK", meta: { totalCount: 0 }, addresses: [] }),
    ) as unknown as typeof fetch;

    const result = await geocodeAddress("존재하지 않는 주소", "id", "secret", fetchImpl);
    expect(result).toBeNull();
  });

  it("요청 헤더에 클라이언트 ID·시크릿을 담는다", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return response({ status: "OK", meta: { totalCount: 0 }, addresses: [] });
    }) as unknown as typeof fetch;

    await geocodeAddress("주소", "my-id", "my-secret", fetchImpl);

    const headers = new Headers(capturedHeaders);
    expect(headers.get("x-ncp-apigw-api-key-id")).toBe("my-id");
    expect(headers.get("x-ncp-apigw-api-key")).toBe("my-secret");
  });

  it("HTTP 실패면 던지고, 에러 메시지에서 시크릿을 가린다", async () => {
    const fetchImpl = vi.fn(async () => response("Authentication Failed: my-secret", 401)) as unknown as typeof fetch;

    await expect(geocodeAddress("주소", "my-id", "my-secret", fetchImpl)).rejects.toThrow();
    try {
      await geocodeAddress("주소", "my-id", "my-secret", fetchImpl);
    } catch (e) {
      expect((e as Error).message).not.toContain("my-secret");
    }
  });
});
