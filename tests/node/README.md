# tests/node

Node 기반 회귀 테스트. 브라우저 없이 `index.html` 내부의 순수 함수(`classifyByKeyword`,
`normalizePastedHtml`, `applyKeywordRulesToHtml` 등)를 jsdom 위에서 직접 돌려 분류
파이프라인의 regression을 감시한다.

## 목적

- 실제 책 원고 수준의 입력에 대해 paste/업로드 경로의 분류 결과가
  기대 분포와 일치하는지 확인.
- `fix/paste-classify-phase3`에서 도입한 3가지 변경(fig 300자 / 파서 공통화 /
  섹션 경계 보존)의 회귀 방지.

## 필요한 fixture 파일

아래 파일은 **저작권 관계로 레포에 커밋하지 않는다**(`.gitignore`에 등록됨).
회귀 테스트를 직접 돌리려면 로컬에 파일을 생성해야 한다.

| 경로 | 설명 | 생성 방법 |
|---|---|---|
| `tests/fixtures/hwata-real-manuscript.txt` | "화타를 꿈꾸며" 원고 전문 (플레인 텍스트) | 한글/워드 원고에서 "저자 소개 ~ 참고문헌"까지 plain text로 복사해 저장 |

fixture 파일이 없으면 테스트 스크립트는 **graceful skip**하며
"fixture 파일이 없습니다. tests/node/README.md 참고해서 로컬에 생성하세요" 를 출력한다.

## 실행

```bash
# 의존성 (최초 1회)
cd tests/node && npm install

# 회귀 테스트 실행
node tests/node/classify-regression.mjs
```

## 기대 결과 요약 (fixture 존재 시)

| 분류 | 기대 개수 | 의미 |
|---|---|---|
| H1 | 3~4 | 저자 소개 / 목차 / 참고문헌 (+ 알려진 이슈: 목차 안 '서문' 오승격 1개) |
| H2 | 17 | 장 제목 (`1. 서문` ~ `17. 결론(에필로그)`) |
| H3 | 58 | 절 제목 (`A.` ~ `H.`) |
| callout | 23 | 로마 소항 (`i.` ~ `iv.`) 19 + 블릿(`■`) 4 |
| fig | 21 | 그림 1 ~ 그림 21 (긴 캡션 포함) |
| `data-section-break` p | 3~5 | 저자 소개/목차/참고문헌 사이 및 참고문헌/1. 서문 사이 섹션 경계 힌트 |

스크립트 출력의 `[summary]` 표와 이 기대값을 비교해 모두 PASS면 ✅.
