/**
 * 테스트용 합성 등기부 PDF 생성기.
 *
 * **실제 사용자의 등기부는 저장소에 들어오지 않는다.** 등기부에는 실명·
 * 주소·주민등록번호가 들어 있어서 픽스처로 쓸 수 없다. 그래서 같은
 * 구조를 가진 PDF를 코드로 만든다 — 가짜 이름, 가짜 주소, 가짜 금액이다.
 *
 * 이 생성기가 반드시 재현해야 하는 것 두 가지:
 *
 * 1. **말소선.** 벡터 수평선을 글자 위에 그어야 파서의 핵심 경로가
 *    실제로 시험된다.
 * 2. **뒤섞인 칸.** 실제 PDF에서 표의 칸은 순서대로 나오지 않는다.
 *    그래서 글자 조각을 일부러 섞어 넣는다 — 좌표로 되살리지 못하면
 *    테스트가 깨진다.
 *
 * 폰트는 글리프 없이 ToUnicode CMap만 가진 Type0 폰트다. 글자를 그릴
 * 일은 없고 뽑아내기만 하므로 이것으로 충분하다.
 */

export interface SyntheticText {
  text: string;
  x: number;
  /** 글자의 기준선 y */
  y: number;
  size?: number;
}

export interface SyntheticLine {
  x0: number;
  x1: number;
  y: number;
}

export interface SyntheticPage {
  texts: SyntheticText[];
  lines: SyntheticLine[];
  /** 쪽 회전각(도). 회전된 쪽을 만드는 테스트에서만 쓴다 */
  rotate?: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const DEFAULT_SIZE = 9;

function hexOf(text: string): string {
  return [...text]
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

/** 글자 폭. 이 폰트는 모든 글자가 글자 크기와 같은 폭을 갖는다(DW 1000) */
export function syntheticWidth(text: string, size = DEFAULT_SIZE): number {
  return text.length * size;
}

function toUnicodeCMap(chars: readonly string[]): string {
  const entries = chars.map((ch) => {
    const code = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `<${code}> <${code}>`;
  });
  const blocks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const slice = entries.slice(i, i + 100);
    blocks.push(`${slice.length} beginbfchar\n${slice.join("\n")}\nendbfchar`);
  }
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CMapName /Deungi def",
    "/CMapType 2 def",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    ...blocks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

/** 합성 PDF 바이트를 만든다 */
export function buildPdf(pages: readonly SyntheticPage[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const chars = new Set<string>();
  for (const page of pages) {
    for (const item of page.texts) for (const ch of item.text) chars.add(ch);
  }
  const cmap = toUnicodeCMap([...chars]);

  const toUnicodeId = add(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`);
  const descriptorId = add(
    "<< /Type /FontDescriptor /FontName /Deungi /Flags 4 /FontBBox [0 -200 1000 900] " +
      "/ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
  );
  const descendantId = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Deungi /CIDSystemInfo " +
      "<< /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor " +
      `${descriptorId} 0 R /DW 1000 /CIDToGIDMap /Identity >>`,
  );
  const fontId = add(
    "<< /Type /Font /Subtype /Type0 /BaseFont /Deungi /Encoding /Identity-H " +
      `/DescendantFonts [${descendantId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`,
  );

  const pagesId = add("");
  const pageIds: number[] = [];

  for (const page of pages) {
    const parts: string[] = [];
    for (const item of page.texts) {
      const size = item.size ?? DEFAULT_SIZE;
      parts.push(`BT /F1 ${size} Tf 1 0 0 1 ${item.x} ${item.y} Tm <${hexOf(item.text)}> Tj ET`);
    }
    for (const line of page.lines) {
      parts.push(`0.5 w ${line.x0} ${line.y} m ${line.x1} ${line.y} l S`);
    }
    const content = parts.join("\n");
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 ${fontId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  out += `startxref\n${xrefAt}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}
