# tests/fixtures

회귀 테스트용 실제 원고 fixture를 두는 폴더.

**이 폴더의 파일은 저작권 관계로 커밋하지 않는다.** `.gitignore`가
`tests/fixtures/`를 무시하며 이 README만 예외로 허용한다.

## 필요한 fixture

| 파일 | 설명 | 생성 방법 |
|---|---|---|
| `hwata-real-manuscript.txt` | "화타를 꿈꾸며" 원고 전문 (plain text) | 한글/워드 원고에서 저자 소개 ~ 참고문헌까지 plain text로 복사·저장 |

## 회귀 테스트 실행

```bash
cd tests/node && npm install   # 최초 1회
node tests/node/classify-regression.mjs
```

fixture가 없으면 스크립트는 graceful skip하며 안내 메시지만 출력한다.
