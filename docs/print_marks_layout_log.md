# 인쇄 마크 & 레이아웃 작업 기록

> hcg-pub-editor (TipTap 2.6.6 + ProseMirror, 단일 `index.html` SPA)
> 신국판 152×225 mm · bleed 3 mm · slug 9 mm · 시트 176×249 mm (499×706 pt)
> 기록 시점: 2026-04-26

---

## 1. 작업 개요

PR #29 → #30 → #31 → #33으로 이어진 4단계 반복 수정 사이클에서 다음을 해결:

1. **중철제본 cover-first recto 패턴** — 표지 다음 첫 페이지를 우측(recto)에 정렬
2. **InDesign 표준 마크 오프셋(2 mm)** — 재단선 코너에 십자 빈공간 확보
3. **사이드바 용어 정리** — 인쇄/제본 용어를 인쇄소 실무 기준으로 통일
4. **도련마크 v3 좌표계 재작성** — `background-position`을 절대 길이 기반으로 통일
5. **맞춤표(레지스트레이션) 슬러그 중앙 배치** — CMYK 정합 표준 위치
6. **슬러그 영역 확장(9 → 12 mm)** — 6 mm 맞춤표가 잘리지 않도록
7. **펼침 페이지 사이 세네카(spine) 영역 비우기** — 좌우 페이지가 독립 시트처럼 보이도록
8. **마주보기 모드 안쪽 마크 숨김** — `clip-path` 기반(요소 박스 보존)

---

## 2. 핵심 CSS 변수

```css
/* index.html ~lines 48-74 */
--page-bleed:        3mm;     /* 도련(블리드) */
--page-mark-len:     5mm;     /* 도련마크 선분 길이 */
--page-mark-thick:   0.25mm;  /* 도련마크 두께 */
--page-mark-offset:  2mm;     /* InDesign Marks Offset (≈6pt) */
--page-mark-margin:  9mm;     /* bleed 3mm + slug 6mm — InDesign 표준 */
--reg-mark-size:     3mm;     /* 맞춤표(레지스트레이션) 직경 — InDesign 표준 */
--color-bar-h:       3.2mm;   /* 컬러바 높이 */
```

> 2026-04-27 갱신 — 학지사 기존 출판물(화타 483×690 pt) 및 InDesign 표준 시방
> 정합을 위해 `--page-mark-margin`을 12 mm → **9 mm** (slug 9 → 6),
> `--reg-mark-size`를 6 mm → **3 mm** 로 환원.
> 신국판(152×225) sheet = **170×243 mm = 483×690 pt**.
> 슬러그 6 mm 안에 3 mm 맞춤표 + 1.5 mm × 2 여백으로 자리 — 안전 마진 동일.

> 이전(2026-04-26) 12 mm/6 mm 결정: 6 mm 맞춤표가 6 mm 슬러그에 꽉 차 가장자리
> 절단 사고가 났던 이슈 대응이었으나, 근본 원인은 맞춤표 크기 자체였음.
> 맞춤표를 InDesign 표준값(3 mm)으로 환원하면 6 mm 슬러그로 충분.

---

## 3. 도련마크 좌표계 (v3, InDesign extension 방식)

### 3.1 핵심 원리

- 마크는 **재단선(trim line)의 연장선상**에 위치
- 코너에서 `--page-mark-offset` 만큼 떨어져 있어 코너에 **십자 빈공간**이 생김
- `background-position`은 **퍼센트가 아닌 절대 길이(calc)** 로 통일
  - 퍼센트는 `(container − image) × pct`로 계산되어 좌표가 어긋남

### 3.2 8개 선분 좌표

```css
/* index.html ~lines 755-844 */
.page::before{
  background-position:
    /* TL horizontal */
    calc(var(--page-mark-margin) - var(--page-mark-offset) - var(--page-mark-len))
    calc(var(--page-mark-margin) - var(--page-mark-thick) / 2),
    /* TL vertical */
    calc(var(--page-mark-margin) - var(--page-mark-thick) / 2)
    calc(var(--page-mark-margin) - var(--page-mark-offset) - var(--page-mark-len)),
    /* TR horizontal */
    calc(var(--page-mark-margin) + var(--page-w) + var(--page-mark-offset))
    calc(var(--page-mark-margin) - var(--page-mark-thick) / 2),
    /* TR vertical */
    calc(var(--page-mark-margin) + var(--page-w) - var(--page-mark-thick) / 2)
    calc(var(--page-mark-margin) - var(--page-mark-offset) - var(--page-mark-len)),
    /* BL/BR도 동일 패턴 */ ;
}
```

---

## 4. 맞춤표(Registration Mark) — 슬러그 중앙

```css
/* index.html ~lines 919-960 */
.page-marks .reg.top {
  top:  calc((var(--page-mark-margin) - var(--page-bleed)) / 2);
  left: 50%;
  transform: translate(-50%, -50%);
}
.page-marks .reg.bottom {
  bottom: calc((var(--page-mark-margin) - var(--page-bleed)) / 2);
  left:   50%;
  transform: translate(-50%, 50%);
}
.page-marks .reg.left {
  left: calc((var(--page-mark-margin) - var(--page-bleed)) / 2);
  top:  50%;
  transform: translate(-50%, -50%);
}
.page-marks .reg.right {
  right: calc((var(--page-mark-margin) - var(--page-bleed)) / 2);
  top:   50%;
  transform: translate(50%, -50%);
}
```

> 슬러그 중앙 = `(mark-margin − bleed) / 2 = (12 − 3) / 2 = 4.5 mm` 지점
> 이전 `top: 0` 배치는 시트 가장자리에서 마크 절반이 잘려 **두 개로 보이는** 문제 발생

---

## 5. 펼침(spread) 사이 세네카 비우기

### 5.1 문제

마주보기 모드에서 좌우 페이지가 한 시트처럼 보임 → 펼침 가운데가 흰 종이로 채워져 있어 부자연스러움.

### 5.2 해결

- `.spread`: 배경/그림자 제거(transparent)
- `.page`: 각자 `box-shadow` 부여 → **각 페이지가 독립된 떠있는 시트**

```css
/* index.html ~lines 698-705 */
.spread {
  display: grid;
  grid-template-columns: var(--page-w) var(--page-w);
  background: transparent;          /* was #fff */
  /* box-shadow 제거 */
  position: relative;
}
.spread::before, .spread::after { content: none; }  /* 거터/센터라인 비활성 */

/* index.html ~lines 742-752 */
.page {
  width:  var(--page-w);
  height: var(--page-h);
  background: #fff;
  box-shadow: var(--page-shadow);   /* NEW — 페이지가 독립 시트 */
  position: relative;
  overflow: visible;
}
```

### 5.3 표지 페이지 보정

```css
.spread.cover { background: transparent; box-shadow: none; }
.spread.cover .page-blank {
  width:  var(--page-w);
  height: var(--page-h);
  background: transparent;
  box-shadow: none;            /* .page의 새 그림자 명시적 무효화 */
  visibility: hidden;
}
```

---

## 6. 마주보기(facing-pages) 안쪽 마크 숨김 — `clip-path`

### 6.1 실패한 시도

```css
/* ❌ 외측 TR/BR 마크가 사라지는 버그 */
body.facing-pages .page-left::before  { right: 0; }
body.facing-pages .page-right::before { left:  0; }
```

**원인**: `right:0`/`left:0`이 의사요소 박스 폭을 줄이면, `background-position`의 calc 좌표(`mark-margin + page-w + offset`)가 **축소된 박스 밖**으로 밀려나 렌더되지 않음.

### 6.2 성공한 해결

```css
/* index.html ~lines 932-947 */
body.facing-pages .page-left::before {
  /* inset 우측에 mark-margin + thick/2 — 재단선 수직 잔재까지 함께 클립 */
  clip-path: inset(0 calc(var(--page-mark-margin) + var(--page-mark-thick) / 2) 0 0);
}
body.facing-pages .page-right::before {
  clip-path: inset(0 0 0 calc(var(--page-mark-margin) + var(--page-mark-thick) / 2));
}
body.facing-pages .page-left  .page-marks .reg.right { display: none; }
body.facing-pages .page-right .page-marks .reg.left  { display: none; }
```

> `clip-path`는 **요소 박스를 그대로 둔 채 시각적 영역만 잘라냄** → `background-position` 좌표계 보존 → 외측 4모서리 마크 정상 출력.

### 6.3 PDF 내보내기 오버라이드

```css
/* index.html ~lines 6770-6780 — buildPrintHtml */
body.facing-pages .print-root .page-left::before,
body.facing-pages .print-root .page-right::before { clip-path: none !important; }
body.facing-pages .print-root .page-left  .page-marks .reg.right { display: block !important; }
body.facing-pages .print-root .page-right .page-marks .reg.left  { display: block !important; }
```

> 인쇄용 PDF에서는 모든 시트가 **독립 페이지**로 출력되어야 하므로 4모서리 풀 마크셋 복원.

---

## 7. 펼침 사이 수직 갭

```css
/* index.html ~lines 686-695 */
.book {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 인접 펼침의 슬러그 영역이 겹치지 않도록 */
  gap: calc(var(--page-mark-margin) * 2 + 8mm);
  padding: 14px 0 40px;
  min-width: max-content;
}
```

> 이전 `gap: 28px (= 7.4mm)` < `2 × 12 mm` → 위아래 슬러그 영역 겹침 발생.

---

## 8. PR 이력

| PR | 브랜치 | 상태 | 핵심 |
|----|--------|------|------|
| #28 | feat/print-mark-margin-standard | merged | 인쇄소 표준 PDF 마크 영역 도입 |
| #29 | fix/print-marks-recto-first-and-stable-stage | merged | cover-first recto + InDesign offset + 사이드바 용어 |
| #30 | fix/crop-marks-v3-empty-spine | merged | 도련마크 v3 좌표계 + 세네카 비우기 1차 |
| #31 | (별도 브랜치) | merged | 맞춤표 슬러그 중앙 + 슬러그 마진 12 mm 확장 |
| #33 | fix/spine-no-paper-and-clip-path-marks | open | clip-path 마크 + spread transparent |

---

## 9. 트러블슈팅 메모

### 9.1 background-position 절대값 vs %
- `%` 사용 시 `(container − image) × pct`로 계산됨 → 컨테이너 크기에 따라 좌표 어긋남
- **모든 마크 좌표는 calc + mm 절대값으로 통일**

### 9.2 reg mark가 두 개로 보이는 현상
- `top: 0; transform: translate(-50%, -50%)` → 중심이 시트 가장자리 → 절반만 보이며 잘린 절반이 별도 마크처럼 보임
- 슬러그 중앙으로 이동 시 해결

### 9.3 clip-path vs 박스 축소
- **박스 축소**(`right/left:0`)는 background-position의 좌표계를 깨뜨림
- **clip-path**는 박스를 보존하므로 같은 좌표계 위에서 시각만 잘라냄
- 마크/배경이 calc 좌표 기반일 때는 항상 clip-path 우선

### 9.4 InDesign Marks Offset
- 기본값 ≈ 6 pt = 약 2.117 mm
- 본 프로젝트 `--page-mark-offset: 2mm` 채택 (mm 단위 깔끔)

---

## 10. 검증 체크리스트

- [ ] 에디터 프리뷰 좌측 페이지 4모서리 도련마크
- [ ] 에디터 프리뷰 우측 페이지 4모서리 도련마크 (외측 TR/BR 포함)
- [ ] 마주보기 모드 안쪽(스파인 측) 도련마크/맞춤표 숨김
- [ ] 펼침 사이 가운데 영역에 용지 없음 (무대 배경 그대로)
- [ ] 표지(첫 페이지) 우측 단독 정렬, 좌측은 `visibility: hidden`
- [ ] 맞춤표 4방향 모두 슬러그 중앙에 위치, 잘리지 않음
- [ ] 인쇄 PDF 미리보기에서 모든 시트가 4모서리 풀 마크셋 출력
- [ ] 사이드바 용어: 시트 176×249 mm (499×706 pt) 표기

---

## 11. 참고 사항

- 단위 환산: `1 pt = 0.3528 mm` / `1 mm ≈ 2.835 pt`
- 신국판 시트 = trim 152×225 + bleed 3 mm × 2 + slug 9 mm × 2 = **176×249 mm**
- pt 환산: 176 mm × 2.835 ≈ **499 pt**, 249 mm × 2.835 ≈ **706 pt**
- 중철제본(saddle-stitch): 첫 페이지 = recto, 안쪽 가장자리는 절단되지 않음 → 안쪽 마크 생략
