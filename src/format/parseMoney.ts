const EOK = 100_000_000;
const MAN = 10_000;

const WON_PATTERN = /^(\d+(?:\.\d+)?)원$/;
// EOK_PATTERN: accepts 억, 억...만, 억...만...원, or 억...원 (bare 원 without 만)
// Group 1: 억 amount
// Group 2: 만 amount (if 만 marker present)
// Group 3: bare 원 amount (if no 만 marker but digits follow, or second numeric part)
const EOK_PATTERN = /^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)만)?(?:(\d+(?:\.\d+)?))?원?$/;
// MAN_PATTERN: accepts 만 alone or with trailing bare 원 (e.g., "1만" or "1만2345원")
// Group 1: 만 amount
// Group 2: bare 원 amount (optional, present when both 만 and 원 parts exist)
const MAN_PATTERN = /^(\d+(?:\.\d+)?)만(?:(\d+(?:\.\d+)?))?원?$/;
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
    const eokAmount = Number(eok[1]) * EOK;
    const manAmount = eok[2] === undefined ? 0 : Number(eok[2]) * MAN;
    let wonAmount = 0;

    // Disambiguation rule for group 3:
    // If group 3 is defined and the string ends with 원, it's bare 원 (literal units)
    // Otherwise, group 3 is 만원 (backward compatibility for inputs like "3억5000")
    if (eok[3] !== undefined) {
      if (s.endsWith("원")) {
        wonAmount = Number(eok[3]);
      } else {
        wonAmount = Number(eok[3]) * MAN;
      }
    }

    return toWon(eokAmount + manAmount + wonAmount);
  }

  const man = MAN_PATTERN.exec(s);
  if (man) {
    const manAmount = Number(man[1]) * MAN;
    const wonAmount = man[2] === undefined ? 0 : Number(man[2]);
    return toWon(manAmount + wonAmount);
  }

  const bare = BARE_PATTERN.exec(s);
  if (bare) return toWon(Number(bare[1]) * MAN);

  return null;
}

function toWon(value: number): number | null {
  if (!Number.isFinite(value)) return null;

  // Defensive check: value < 0 is currently unreachable since all patterns require \d+,
  // but we keep it for future safety if new patterns are added.
  if (value < 0) return null;

  // Reject values beyond safe integer range to prevent silent precision loss
  if (value > Number.MAX_SAFE_INTEGER) return null;

  return Math.round(value);
}
