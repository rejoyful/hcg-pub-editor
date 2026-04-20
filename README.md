# HCG Pub — 학지사 조판 웹 에디터

학지사·학지사메디컬의 InDesign 조판 작업을 웹에서 자동화하는 단일 파일 에디터입니다.
HWPX/DOCX/HTML/Markdown/IDML 등 다양한 원고를 자동으로 파싱해 Tiptap WYSIWYG으로 편집하고,
Paged.js 기반 정밀 프리뷰, 도곽 머리말/꼬리말, PDF/DOCX/HTML/Typst/HWPX 내보내기까지 지원합니다.

## 라이브 데모

GitHub Pages에 배포되면 `https://<사용자>.github.io/<저장소>/` 에서 바로 사용 가능합니다.

## 주요 기능

- **다중 입력 포맷** — HWPX · DOCX · HTML · Markdown · TXT · IDML · XML
- **드래그앤드롭** 및 **한글 클립보드 직접 붙여넣기** 자동 구조 판별
- **Tiptap 편집기** — 제목·목록·인용·표·이미지, 이미지 자유 이동
- **이미지 텍스트 Wrap** — `float + shape-outside` 기반 자연스러운 개행, 원형 클리핑
- **페이지 분리 시각화** — 에디터 영역에서도 쪽 경계를 오버레이로 표시
- **도곽 머리말/꼬리말** — 사용자 선택 위치 일관 적용, 출판식 좌우 교차 옵션
- **Paged.js 정밀 모드** — `@page`, running headers/footers, `counter(page)` 지원
- **8종 내보내기** — PDF · HTML · DOCX · Markdown · JSON · Typst · HWPX XML · TXT

## 지원 용지

A4, B5(기본), 신국판, A5, 46판 — 1단/2단 다단 조판

## 기술 스택

순수 HTML 단일 파일, CDN ES 모듈만 사용(번들러 불필요)

- Tiptap 2.6.6 (ProseMirror)
- Paged.js 0.4.3
- JSZip · Mammoth · Marked · docx.js (필요 시 lazy-load)

## 로컬 실행

```bash
# 어떤 정적 서버든 OK
python3 -m http.server 8080
# 또는
npx serve .
```

브라우저에서 `http://localhost:8080/` 접속.

## GitHub Pages 배포

이 저장소는 `main` 브랜치가 push되면 자동으로 Pages에 배포됩니다
(`.github/workflows/pages.yml` 워크플로우).

수동 활성화가 필요한 경우:

1. Repo Settings → Pages → Source: **GitHub Actions** 선택
2. 첫 push 후 Actions 탭에서 **Deploy to GitHub Pages** 성공 확인
3. `https://<사용자>.github.io/<저장소>/` 접속

## 파일 구조

```
.
├── index.html        # 메인 에디터 (단일 파일)
├── demo.html         # 초기 데모 버전
├── README.md
├── LICENSE
├── .gitignore
└── .github/workflows/pages.yml
```

## 브라우저 요구사항

- Chrome/Edge 100+, Safari 15.4+, Firefox 100+ (ES 모듈 + top-level await + `shape-outside`)
- 오프라인 환경에선 CDN 모듈이 로드되지 않으므로 사전 캐싱 필요

## 라이선스

MIT — `LICENSE` 참조.
