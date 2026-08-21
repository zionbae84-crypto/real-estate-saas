const EOK = 100_000_000;
const MAN = 10_000;

const WON_PATTERN = /^(\d+(?:\.\d+)?)원$/;
const EOK_PATTERN = /^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)만?)?$/;
const MAN_PATTERN = /^(\d+(?:\.\d+)?)만$/;
const BARE_PATTERN = /^(\d+(?:\.\d+)?)$/;

/**
 * 한국식 금액 문자열을 원 단위 정수로 바꾼다.
 * 단위가 없는 숫자는 **만원**으로 읽는다(한국 부동산 입력 관행).
 *
 * 파싱할 수 없으면 `NaN`이 아니라 `null`을 반환한다. 호출자는 이를
 * "미입력"으로 취급해야 하며, 엔진에는 절대 `NaN`이 흘러가지 않는다.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (s === "") return null;

  const won = WON_PATTERN.exec(s);
  if (won) return toWon(Number(won[1]));

  const eok = EOK_PATTERN.exec(s);
  if (eok) {
    const man = eok[2] === undefined ? 0 : Number(eok[2]);
    return toWon(Number(eok[1]) * EOK + man * MAN);
  }

  const man = MAN_PATTERN.exec(s);
  if (man) return toWon(Number(man[1]) * MAN);

  const bare = BARE_PATTERN.exec(s);
  if (bare) return toWon(Number(bare[1]) * MAN);

  return null;
}

function toWon(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
