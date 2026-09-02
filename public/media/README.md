# public/media/ — 배포 전 재인코딩 필요

Vite가 `public/`을 그대로 서빙하므로 이 디렉터리의 파일은 빌드 후 `/media/…`
경로로 그대로 나간다 — 여기 있는 크기가 곧 사용자가 실제로 내려받는 크기다.

## cheongdam-hero.mp4

- **현재 20MB**, 1920×1080, 28.7초. `no-network.test.ts`가 막는 것은 네트워크
  호출이지 파일 크기가 아니라서 이 상태로도 테스트는 통과하지만, 리포지터리
  클론마다 영구히 남는 무게이자 화면 1(영상 히어로) 로드 시간에 그대로
  얹힌다.
- **배포 전 2~4MB로 재인코딩해야 한다.** 이 워크트리 환경엔 `ffmpeg`가 없어
  이번 작업(task-2)에서는 줄이지 못했다 — 원본을 손대지 않고 그대로 뒀다.
- 재인코딩 시 참고: 1080p 무음 배경 루프 영상은 보통 H.264, CRF 28~32,
  `-an`(오디오 트랙 제거 — 어차피 `muted` 재생), `-movflags +faststart`로
  2~4MB대까지 줄일 수 있다. 예:
  ```
  ffmpeg -i cheongdam-hero.mp4 -an -c:v libx264 -crf 30 -preset slow \
    -movflags +faststart -vf "scale=1920:-2" cheongdam-hero.min.mp4
  ```
  결과 파일 크기를 확인하고 화질이 스크림(어두운 그라디언트) 아래서 충분히
  버티는지 눈으로 확인한 뒤 원본을 교체한다.

## cheongdam-han-river-hero.png

- 2MB. `<video poster>`로 쓰는 정지 이미지 — 첫 프레임 전 빈 화면을
  막는다. 자동재생이 막히면 이 이미지가 그대로 화면에 남으므로 영상 재
  인코딩과 별개로 화질을 유지해야 하지만, PNG를 WebP/AVIF로 바꾸거나
  재압축하면 마찬가지로 용량을 줄일 여지가 있다.
