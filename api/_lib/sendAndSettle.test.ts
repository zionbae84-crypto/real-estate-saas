import { describe, expect, it, vi } from "vitest";
import { sendAndSettle } from "./sendAndSettle";

/**
 * 이 한 줄짜리 함수가 따로 있는 이유는 **순서** 때문이다 — 응답이 먼저
 * 나가고 기다림이 그 뒤에 와야 한다. 뒤바뀌면 뒤에서 갱신한다는 말이
 * 무의미해지고 사용자가 국토부 조회를 그대로 기다린다(실측 7.2초).
 */
function fakeRes() {
  const json = vi.fn();
  return { json, status: vi.fn(() => ({ json })) };
}

describe("sendAndSettle", () => {
  it("뒤처리가 있어도 응답을 **먼저** 보낸다", async () => {
    const res = fakeRes();
    let sentBeforeSettle = false;
    const pending = Promise.resolve().then(() => {
      sentBeforeSettle = res.json.mock.calls.length > 0;
    });

    await sendAndSettle(res, { status: 200, body: { ok: true }, pending });

    expect(sentBeforeSettle).toBe(true);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("뒤처리가 끝날 때까지 돌아오지 않는다 — 여기서 끝내면 갱신이 죽는다", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => {
      release = r;
    });
    let returned = false;
    const call = sendAndSettle(fakeRes(), { status: 200, body: {}, pending }).then(() => {
      returned = true;
    });

    // 뒤처리를 **풀지 않은 채** 마이크로태스크를 넉넉히 흘려보낸다.
    // 기다리지 않는 구현이라면 이 사이에 이미 돌아와 있다. (예전 이
    // 검사는 곧바로 풀어 버려, 안 기다려도 통과했다 — 공허했다.)
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(returned).toBe(false);

    release();
    await call;
    expect(returned).toBe(true);
  });

  it("뒤처리가 없으면 응답만 보내고 끝난다", async () => {
    const res = fakeRes();
    await sendAndSettle(res, { status: 400, body: { error: "형식이 잘못됨" } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "형식이 잘못됨" });
  });
});
