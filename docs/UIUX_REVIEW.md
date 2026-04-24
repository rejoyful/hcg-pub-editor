# HCG typesetting editor — UI/UX & 디자인 시스템 리뷰

작성일: 2026-04-24
대상 커밋: `feat/uiux-perf-pass` (PR #16 + 본 PR)
대상 파일: `index.html` (단일 파일, ~8,500 lines)

---

## 0. 한 줄 요약

> 기능은 충실하지만 **디자인 토큰이 색·반경에만 머물러 있고, 간격·타이포그래피·고도(elevation) 스케일이 없어** 화면이 아래로 스크롤될수록 잡음이 늘어난다.
> 우선 **간격 토큰 + 타입 스케일 + 모달 헤더 패턴 3종을 도입**하면, 코드 변경 없이도 시각적 일관성이 한 단계 올라간다.

---

## 1. 사용자 측면 — 즉시 체감되는 마찰

| # | 위치 | 마찰 | 무엇이 문제인가 |
|---|------|------|------------------|
| 1 | 상단 `doc-title` 입력 | **편집 가능하다는 신호 부족** | `border:transparent` 라 hover 전엔 텍스트인지 입력칸인지 구분 안 됨. 연필 아이콘 또는 항상 보이는 1px dashed underline 필요. |
| 2 | 사이드바 입력 컨트롤 | **라벨이 컨트롤보다 큼** (12.5px vs 12px) | 정보 위계 역전. 라벨은 11px·secondary color, 컨트롤은 13px 가 일반적. |
| 3 | 사이드바 segmented buttons | **hover 피드백 없음** | active 상태만 있고 hover 가 없어 죽은 듯 보임. |
| 4 | 모달들 (AI / CMYK / Proof / Med / Color) | **닫기(X) 버튼 통일 부재** | 모두 푸터 "닫기·취소" 로만 닫힘. ESC 핸들러도 없음. 모바일·키보드 사용자에 매우 불친절. |
| 5 | 자동분류 버튼 | **눌렀을 때 변화 시각화 부족** | 4~6초 작업인데 진행 표시 없이 toast 만 뜸. AI 모달처럼 진행 패널 필요. |
| 6 | 빈 상태 (archive, new doc, proof) | **"비어있음" 안내가 텍스트 한 줄** | 일러스트/CTA 없음. 첫 사용자 onboarding 누락. |
| 7 | 영문 justify 갭 | **개행이 안 되어 어절 공백 폭주** | (이번 PR 에서 수정) — `overflow-wrap:anywhere` + `hyphens:auto` 로 해결. |
| 8 | CMYK 적용 후 프리뷰 | **즉시 반영 안 됨** | (이번 PR 에서 수정) — `setColor` 직후 `scheduleReflow()` 명시. |
| 9 | 키보드 단축키 | **목록·표시 부재** | Ctrl+S 한 군데 title 속성만 존재. `?` 키로 단축키 안내 모달 필요. |
| 10 | 스크롤 동기화 | **종종 락 풀림 지연** | 1.2 초 사용자 스크롤 락은 합리적이나 시각적 표시 (락 중 아이콘) 없음. |

---

## 2. 디자인 시스템 측면 — 토큰 레이어 진단

### 2-A. 현재 토큰화된 것 (`:root`, `index.html` L14–69)

```css
색      --bg --panel --ink --mute --meta --line --soft
        --accent --accent-soft --warn --warn-soft --ok
그림자  --shadow --page-shadow
반경    --radius (단일)
타이포  --body-family --ui-family --body-size --body-leading
        --body-tracking --body-para-gap --body-indent --body-weight
지면    --page-w/h, --page-mt/mr/mb/ml, --page-inner/outer,
        --page-bleed, --page-mark-len/thick/color,
        --reg-mark-size, --color-bar-h/swatch, --columns
```

### 2-B. 토큰화 안 된 것 (가장 큰 부채)

| 영역 | 현 상황 | 권장 |
|------|---------|------|
| **간격(spacing) 스케일** | 모든 `gap/padding/margin` 이 raw `4px/6px/8px/10px/12px/14px/16px/18px/20px/24px/40px` | `--sp-1: 4px` … `--sp-7: 32px` (배수 4) |
| **타이포 스케일** | 157개 `font-size` 선언 — `10px/10.5/11/11.5/12/12.5/13/14/15/18/22/...` 무질서 | `--fs-2xs:10.5 / --fs-xs:11 / --fs-sm:12 / --fs-md:13 / --fs-lg:15 / --fs-xl:18 / --fs-2xl:22` |
| **반경 스케일** | `--radius:6px` 단일 + raw `3px/4px/8px/10px` 산재 | `--r-sm:3 / --r-md:6 / --r-lg:10` 3단 |
| **고도(elevation)** | 인라인 `box-shadow` 5종 다른 값 | `--elev-1/2/3/4` 4단 |
| **컬러 — 따뜻한 강조** | "양피지" 톤 (#F5EFE4, #D4C09A, #5A4A2A) AI/툴바 영역에서 **여러 군데 라이팅 다름** | `--accent-warm`, `--accent-warm-soft`, `--accent-warm-ink` |
| **proof 룰 배지 6색** | L1858~ 인라인 `#EFECE3 #554E3A` 등 | `--badge-{rule}-bg/fg` 또는 단일 함수형 |
| **미디어 쿼리 breakpoint** | 사용 안 함 | `--bp-sm/md/lg` (현 데스크톱 전용이지만 랩탑 13" 대응 필요) |

### 2-C. 일관성 부재 사례 — Top 5

1. **모달 카드 폭**: `420px / 480px / 520px / 1080px` 4종, 그 중 3종이 인라인 `style=` 로 박혀 있음 → `.card.sm/.md/.lg/.xl` 클래스로 정리.
2. **버튼 변종**: `.btn` `.btn.primary` `.btn.accent` `.btn.ghost`(미정의) `.btn-upload` `.btn-preset` + 인라인 `font-size:11.5px` 7곳 → `.btn.sm` 정의로 인라인 제거.
3. **아이콘 가중치**: Phosphor regular 95회 / bold 4회. bold 스타일시트 (~40 KB) 거의 사용 안함 → 제거하거나 1차 액션 전용으로 일관 적용.
4. **포커스 링**: `:focus-visible` 전역 정의는 있으나 `.modal` 내부 close 영역 없음. 키보드 트랩(focus trap) 부재.
5. **컬러 직값 누출**: `.ProseMirror mark[data-color="#EEEEEE"]` 등 hex 가 셀렉터·data 양쪽에 박혀 있어 변경 시 2곳 수정 필요.

### 2-D. 컴포넌트 카탈로그 (현존)

| 카테고리 | 컴포넌트 | 상태 |
|----------|----------|------|
| 액션 | `.btn`, `.btn.primary`, `.btn.accent` | 정의됨 |
| 액션 | `.btn.ghost`, `.btn.sm` | **미정의** (사용은 됨) |
| 입력 | `.side input/select`, `.doc-title` | 정의됨, 라벨/값 hierarchy 역전 |
| 컨테이너 | `.modal > .card`, `.menu`, `.panel` | 정의됨, 카드 폭 분산 |
| 컨테이너 | `.toast`, `.loader`, `.ai-progress` | 정의됨 |
| 표시 | `.badge`, `.chip`, `.kbd` | **부재** (proof 영역에서 인라인으로 흉내) |
| 표시 | `.empty-state`, `.skeleton` | **부재** |
| 인쇄 | `.page`, `.page-content`, `.page-head/foot`, crop/reg/color marks | 정의됨, 토큰화 잘 됨 |

---

## 3. 우선순위 개선 로드맵

### 🔥 즉시 (이번 PR 에 일부 포함)
- [x] 영문 justify 어절 공백 폭주 → `overflow-wrap:anywhere + hyphens:auto`
- [x] CMYK 적용 후 프리뷰 즉시 반영 → `scheduleReflow()` 명시
- [x] 인쇄 시 인라인 color 보존 → `!important` 제거 + `print-color-adjust:exact`
- [x] 타이핑 버벅임 → `updateStatus` 220ms 디바운스 + `splitTextBlockVariable` 이진 탐색

### ⚡ 단기 (다음 PR — 작은 노력, 큰 시각 정돈)
- [ ] **간격 토큰 도입** (`--sp-1`…`--sp-7`) + 사이드바·모달 일괄 치환 (1~2시간)
- [ ] **타입 스케일** (`--fs-*`) + `font-size:11.5px` 인라인 7개 일소 (1시간)
- [ ] **모달 헤더 컴포넌트** (`.modal .head` + close X 버튼) 5개 모달 적용 (1시간)
- [ ] **ESC 키 닫기 + focus trap** 전역 핸들러 (30분)
- [ ] `.btn.ghost` `.btn.sm` 정식 정의 (10분)
- [ ] `.card.sm/.md/.lg/.xl` 4단 + 인라인 width 제거 (30분)

### 🌱 중기 (별도 PR — UX 품질 도약)
- [ ] **빈 상태 컴포넌트** (`.empty-state`) — archive / proof / new doc 3곳 적용
- [ ] **단축키 안내 모달** (`?` 키로 호출, AI=Ctrl+J, 자동분류=Ctrl+Shift+A 등 정의·표시)
- [ ] **사이드바 라벨/컨트롤 위계 정상화** (label 11px, control 13px)
- [ ] **세그먼티드 버튼 hover 상태**
- [ ] **doc-title 편집 가능 신호** (1px dashed underline 또는 연필 아이콘)
- [ ] **proof 룰 배지 토큰화** + `.badge-{level}` 컴포넌트화

### 🌿 장기 (디자인 시스템 분리)
- [ ] `index.html` → `styles/` 분리 (단일 파일 원칙은 유지하되 빌드 단계에서 인라이닝)
- [ ] **토큰 JSON** 으로 외부화 → Style Dictionary 등으로 다중 출력 (CSS / JS / Figma)
- [ ] **다크 모드** (현재 `:root` 만 사용 — `[data-theme="dark"]` 추가)
- [ ] **국제화** (현 한국어 하드코딩 — i18n key 기반 분리)
- [ ] **반응형 사이드바** (랩탑 13" 미만에서 자동 collapse)

---

## 4. 권장 토큰 패치 (즉시 적용 가능 형태)

```css
:root{
  /* === Spacing scale === */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-7: 32px;

  /* === Type scale === */
  --fs-2xs: 10.5px;   /* meta, badge */
  --fs-xs:  11px;     /* status bar, helper text */
  --fs-sm:  12px;     /* sidebar input, secondary button */
  --fs-md:  13px;     /* button, default body UI */
  --fs-lg:  15px;     /* brand, card title */
  --fs-xl:  18px;     /* modal title */
  --fs-2xl: 22px;     /* page-content h1 (preview only) */

  /* === Radius scale === */
  --r-sm: 3px;
  --r-md: 6px;        /* alias of legacy --radius */
  --r-lg: 10px;

  /* === Elevation scale === */
  --elev-1: 0 1px 3px rgba(0,0,0,.06);
  --elev-2: 0 4px 14px rgba(0,0,0,.10);
  --elev-3: 0 12px 32px rgba(0,0,0,.18);
  --elev-4: 0 20px 60px rgba(0,0,0,.30);   /* fullscreen modal */

  /* === Warm accent (AI/title-design 계열) === */
  --accent-warm:      #8B6E3E;
  --accent-warm-soft: #F5EFE4;
  --accent-warm-ink:  #5A4A2A;
}
```

이 한 블록 추가 + 기존 `--radius` 를 `--r-md` 알리아스로 두는 마이그레이션만으로
이후 모든 컴포넌트가 일관된 스케일을 참조할 수 있다.

---

## 5. 마치며

> 이 에디터의 **본질 가치는 페이지 조판 정확도**다. 그 영역(`@page`, crop marks, registration marks, facing pages, paper presets)은 이미 토큰화도 잘 되어 있고 의도가 분명하다.
> 반면 **에디터 chrome (사이드바·모달·툴바·status bar)** 은 기능을 추가하면서 자연스럽게 늘어난 산물이라 토큰 / 컴포넌트 정의가 따라오지 못했다.
> 위 단기 패치 6건만 적용해도 — 코드량은 거의 늘지 않으면서 — 화면 전체의 격이 한 단계 올라간다.
