const EOK = 100_000_000;
const MAN = 10_000;

/**
 * 원 단위 정수를 한국식 표기 문자열로 바꾼다.
 * 640_000_000 → "6억 4,000만원"
 */
export function formatWon(won: number): string {
  if (won === 0) return "0원";

  const sign = won < 0 ? "-" : "";
  const abs = Math.abs(Math.round(won));

  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const rest = abs % MAN;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0) parts.push(rest.toLocaleString("ko-KR"));

  return `${sign}${parts.join(" ")}원`;
}
