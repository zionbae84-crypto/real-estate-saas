/**
 * 미터를 화면에 쓰는 문자열로 바꾼다. 350 → "350m", 8000 → "8,000m"
 *
 * **km로 바꾸지 않는다.** "1.2km"는 읽기에 편하지만 1,150m와 1,249m를
 * 같은 글자로 만든다 — 이 화면이 내는 숫자는 관측치 하나뿐이라, 그
 * 하나를 뭉개면 남는 것이 없다. 게다가 이 거리는 이미 직선거리라 실제
 * 걷는 길보다 짧은데, 표기까지 뭉개면 사용자가 두 번 어림잡게 된다.
 *
 * 자리 구분 쉼표는 넣는다 — "8000m"와 "800m"를 눈으로 가르기 어렵다.
 *
 * @throws RangeError NaN, Infinity, -Infinity에 대해 던진다.
 */
export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) {
    throw new RangeError(`유효한 숫자가 아닙니다: formatMeters 인자 (${String(meters)})`);
  }
  return `${Math.round(meters).toLocaleString("ko-KR")}m`;
}
