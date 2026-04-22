// tests/node/classify-regression.mjs
// Node 기반 분류 파이프라인 회귀 테스트.
//
// 특징:
// - ../../index.html 에서 H1_EXACT, H1_PREFIX, CLF_GRAY, CLF_BLUE,
//   classifyByKeyword, normalizePastedHtml, applyKeywordRulesToHtml 을
//   소스 추출하여 jsdom 위에서 직접 실행한다 → 테스트 스크립트에 로직을
//   복제하지 않아 drift 방지.
// - fixture(tests/fixtures/hwata-real-manuscript.txt)가 없으면 graceful skip.
//
// 실행: node tests/node/classify-regression.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'hwata-real-manuscript.txt');

/* ─────────────── 소스 추출 ─────────────── */
function extractBlock(source, startRe, endMarker = '\n}\n'){
  /* startRe 매칭 위치부터 endMarker(줄 시작의 `}` + 줄바꿈)까지 포함 추출 */
  const m = source.match(startRe);
  if (!m) throw new Error('추출 실패: ' + startRe);
  const startIdx = m.index;
  const endIdx = source.indexOf(endMarker, startIdx);
  if (endIdx < 0) throw new Error('블록 끝을 찾지 못함: ' + startRe);
  return source.slice(startIdx, endIdx + endMarker.length);
}

function extractConstBlock(source, name){
  /* `const NAME = ...;` 한 선언 블록(여러 줄 허용) */
  const startRe = new RegExp(`^const ${name}\\s*=\\s*`, 'm');
  const m = source.match(startRe);
  if (!m) throw new Error('const 추출 실패: ' + name);
  // 세미콜론까지 (괄호 balance 고려 간단 버전: 다음 `]);` 또는 `';` 패턴 찾기)
  const from = m.index;
  let depth = 0, inStr = false, strCh = '', i = from + m[0].length;
  for (; i < source.length; i++){
    const c = source[i];
    if (inStr){
      if (c === '\\'){ i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === '`'){ inStr = true; strCh = c; continue; }
    if (c === '[' || c === '(' || c === '{') depth++;
    else if (c === ']' || c === ')' || c === '}') depth--;
    else if (c === ';' && depth === 0){ i++; break; }
  }
  return source.slice(from, i);
}

function loadIndexHelpers(){
  const src = fs.readFileSync(INDEX_HTML, 'utf8');
  const pieces = [];
  pieces.push(extractConstBlock(src, 'H1_EXACT'));
  pieces.push(extractConstBlock(src, 'H1_PREFIX'));
  pieces.push(extractConstBlock(src, 'CLF_GRAY'));
  pieces.push(extractConstBlock(src, 'CLF_BLUE'));
  pieces.push(extractBlock(src, /^function classifyByKeyword\(/m));
  pieces.push(extractBlock(src, /^function normalizePastedHtml\(/m));
  pieces.push(extractBlock(src, /^function applyKeywordRulesToHtml\(/m));

  const body = pieces.join('\n\n') + `
    return {
      H1_EXACT, H1_PREFIX, CLF_GRAY, CLF_BLUE,
      classifyByKeyword, normalizePastedHtml, applyKeywordRulesToHtml,
    };
  `;
  // eslint-disable-next-line no-new-func
  const fn = new Function('document', 'Node', 'DocumentFragment', body);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  return fn(dom.window.document, dom.window.Node, dom.window.DocumentFragment);
}

/* ─────────────── 결과 집계 유틸 ─────────────── */
function analyzeFinalHtml(finalHtml, helpers){
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const d = document.createElement('div');
  d.innerHTML = finalHtml;
  const out = {
    h1: [], h2: [], h3: [], fig: [], callout: [],
    p_nonempty: [], p_section_break: [], p_kw_pad: [], p_empty_other: [],
  };
  const tops = Array.from(d.children);
  for (let i = 0; i < tops.length; i++){
    const c = tops[i];
    const tag = c.tagName.toLowerCase();
    const text = (c.textContent || '').trim();
    if (tag === 'h1') { out.h1.push(text); continue; }
    if (tag === 'h2') { out.h2.push(text); continue; }
    if (tag === 'h3') { out.h3.push(text); continue; }
    if (tag !== 'p'){ continue; }
    // 빈 p 분류: data-section-break > data-kw-pad > 기타
    if (!text){
      if (c.hasAttribute('data-section-break')) out.p_section_break.push('§');
      else if (c.hasAttribute('data-kw-pad')) out.p_kw_pad.push('_');
      else out.p_empty_other.push('');
      continue;
    }
    // fig 라벨 자체는 집계에서 제외 ("📷 이미지 첨부")
    if (text.startsWith('📷 이미지 첨부')) continue;
    // callout 판별: <strong> 안에 mark[data-color=CLF_GRAY]
    const calloutMark = c.querySelector('strong > mark[data-color="' + helpers.CLF_GRAY + '"]');
    if (calloutMark){ out.callout.push(text); continue; }
    // fig 본체: <strong> 직계자식 (callout이 아닌 경우)
    if (c.querySelector(':scope > strong')){ out.fig.push(text); continue; }
    out.p_nonempty.push(text);
  }
  return out;
}

/* ─────────────── Cocoa HTML Writer payload 생성 ─────────────── */
function wrapAsCocoaPaste(raw){
  const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const lines = raw.split(/\r?\n/);
  const pLines = lines.map(line => {
    if (!line.trim()) return `<p class="p1"></p>`;
    return `<p class="p1"><span class="s1">${escapeHtml(line)}</span></p>`;
  }).join('\n');
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title></title>
<meta name="Generator" content="Cocoa HTML Writer">
<style type="text/css">p.p1 {margin:0 0 0 0} span.s1 {font-kerning:none}</style>
</head>
<body>
${pLines}
</body>
</html>`;
}

/* ─────────────── PASS/FAIL 리포트 ─────────────── */
const results = [];
function check(label, ok, detail){
  results.push({ label, ok, detail });
  const tag = ok ? '✅' : '❌';
  console.log(`  ${tag} ${label}${detail ? '  — ' + detail : ''}`);
  return ok;
}

/* ─────────────── main ─────────────── */
async function main(){
  console.log('══════════════════════════════════════════════');
  console.log(' classify-regression.mjs');
  console.log('══════════════════════════════════════════════\n');

  if (!fs.existsSync(FIXTURE)){
    console.log('ℹ fixture 파일이 없습니다:');
    console.log('   ' + path.relative(REPO_ROOT, FIXTURE));
    console.log('   tests/node/README.md 참고해서 로컬에 생성하세요.');
    console.log('\n[skip] 회귀 테스트를 건너뜁니다 (exit 0).');
    process.exit(0);
  }

  const helpers = loadIndexHelpers();
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  const lines = raw.split(/\r?\n/);

  console.log('─── 입력 통계 ───');
  console.log('  raw lines:', lines.length);
  console.log('  non-empty:', lines.filter(l => l.trim()).length);

  /* ── [커밋 1] fig 길이 제한 300자 ── */
  console.log('\n─── [커밋 1] fig 길이 제한 완화 ───');
  const figSamples = [
    { t: '그림 9. A: 우측 연수(medulla oblongata)의 앞쪽으로 고신호 강도를 보이는 MRI 확산 강조 영상(diffusion weighted MR image) A: 위쪽. B: 아래쪽. 진단명: 뇌경색. 병변의 위치상 연하 장애(dysphagia) 초래 가능성이 높다. 환자의 과거력에 비추어 가장 가능성이 높은 병인은 심인성 색전증(cardiogenic embolism)이었을 것으로 추정된다.', len: 305 },
    { t: '그림 12. 과다분엽핵중성구(hypersegmented neutrophil)(24세 남자로 소장 수술력이 있다). 과다분엽핵중성구는 6개 이상의 핵분엽중성구가 있거나, 5개 이상의 핵분엽중성구가 3% 이상을 차지할 때를 의미하며 거대적혈모구빈혈(megaloblastic anemia)을 의미한다.', len: 165 },
    { t: '그림 1. 혼동하기 쉬운 영지버섯과 붉은사슴뿔버섯', len: 28 },
  ];
  for (const s of figSamples){
    const cls = helpers.classifyByKeyword(s.t);
    check(`fig(len=${s.t.length}) → "${s.t.slice(0, 30)}…"`, cls === 'fig', `actual=${cls}`);
  }
  // 본문에 "그림 N으로 시작하는 p" 오분류 스캔
  const bodyFigOverclass = lines
    .map(l => l.trim())
    .filter(l => l && /^그림\s*\d/.test(l) && !/^그림\s*\d+\s*[\.\s]/.test(l.slice(0, 15)));
  check('본문 내 "그림 N 로 시작하는 자연 문장" 과잉매칭 없음',
    bodyFigOverclass.length === 0,
    bodyFigOverclass.length ? `후보: ${bodyFigOverclass.slice(0,3).join(' / ')}` : '');

  /* ── [커밋 2] 파서 출력이 공통 규칙으로 통일되는지 ── */
  console.log('\n─── [커밋 2] 파서 공통 규칙 통일 ───');
  const src = fs.readFileSync(INDEX_HTML, 'utf8');
  // parseHwpxXmlToHtml / parseTxt / parsePptxFile / parseIdmlFile 내부에 자체 <h1>/<h2>/<h3>
  // 생성 없어야 함. PDF는 예외적으로 자체 applyKeywordRulesToHtml만 호출.
  const parserBlocks = {
    parseHwpxXmlToHtml: extractBlock(src, /^function parseHwpxXmlToHtml\(/m),
    parseTxt:           extractBlock(src, /^function parseTxt\(/m),
    parsePptxFile:      extractBlock(src, /^async function parsePptxFile\(/m),
    parseIdmlFile:      extractBlock(src, /^async function parseIdmlFile\(/m),
  };
  for (const [name, body] of Object.entries(parserBlocks)){
    const hasHeading = /`<h[123][\s>]/.test(body);
    check(`${name} 에 <h1>/<h2>/<h3> 직접 생성 없음`, !hasHeading,
      hasHeading ? '여전히 heading 태그를 직접 만든다' : '');
  }

  /* ── 통합: Cocoa paste full pipeline ── */
  console.log('\n─── [통합] Cocoa paste → normalize → applyKeywordRulesToHtml ───');
  const cocoa = wrapAsCocoaPaste(raw);
  const norm = helpers.normalizePastedHtml(cocoa);
  const final = helpers.applyKeywordRulesToHtml(norm);
  const tally = analyzeFinalHtml(final, helpers);

  console.log('  H1:', tally.h1.length, '(샘플:', tally.h1.slice(0,4), ')');
  console.log('  H2:', tally.h2.length);
  console.log('  H3:', tally.h3.length);
  console.log('  callout:', tally.callout.length);
  console.log('  fig:', tally.fig.length);
  console.log('  p(본문):', tally.p_nonempty.length);
  console.log('  p(섹션브레이크):', tally.p_section_break.length);
  console.log('  p(kw-pad/fig·callout 패딩):', tally.p_kw_pad.length);
  console.log('  p(기타 빈):', tally.p_empty_other.length);

  /* ── 커밋 1 효과: fig 21개 전수 ── */
  check('fig 총 21개', tally.fig.length === 21, `actual=${tally.fig.length}`);

  /* ── 커밋 2 효과: 장 17 / 절 58 / 소항 19+블릿 4 = callout 23 ── */
  check('H2 (장) 17개', tally.h2.length === 17, `actual=${tally.h2.length}`);
  check('H3 (절) 58개', tally.h3.length === 58, `actual=${tally.h3.length}`);
  check('callout (소항+블릿) 23개', tally.callout.length === 23, `actual=${tally.callout.length}`);

  /* ── H1 (영역): 3 또는 4 (목차 내부 '서문' 오승격 허용 — 별도 이슈) ── */
  check('H1 (영역) 3~4개 (목차 \'서문\' 오승격 허용)',
    tally.h1.length >= 3 && tally.h1.length <= 4,
    `actual=${tally.h1.length}`);

  /* ── 커밋 3 효과: 섹션 경계 힌트 3~5개 ── */
  check('섹션 경계 힌트 3~5개',
    tally.p_section_break.length >= 3 && tally.p_section_break.length <= 5,
    `actual=${tally.p_section_break.length}`);

  /* ── 기타 빈 p 없음 (단발 빈 줄은 기존 거동대로 제거) ── */
  check('단발 빈 p 제거 (기존 거동 유지)',
    tally.p_empty_other.length === 0,
    `기타 빈 p=${tally.p_empty_other.length}`);

  /* ─────────────── 요약 ─────────────── */
  console.log('\n══════════════════ 요약 ══════════════════');
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  if (fail > 0){
    console.log('\n  실패 항목:');
    results.filter(r => !r.ok).forEach(r => console.log('   ❌', r.label, r.detail ? '— ' + r.detail : ''));
  }
  console.log('\n┌──────────────────────┬────────┬────────┬──────┐');
  console.log('│ 분류                 │ 기대   │ 실제   │ 판정 │');
  console.log('├──────────────────────┼────────┼────────┼──────┤');
  const rows = [
    ['H1 (영역)',               '3~4',   tally.h1.length],
    ['H2 (장)',                 17,      tally.h2.length],
    ['H3 (절)',                 58,      tally.h3.length],
    ['callout (소항+블릿)',     23,      tally.callout.length],
    ['fig (그림)',              21,      tally.fig.length],
    ['섹션 경계 힌트',          '3~5',   tally.p_section_break.length],
  ];
  for (const [label, expect, actual] of rows){
    const ok = (typeof expect === 'string')
      ? (expect === '3~4' ? (actual >= 3 && actual <= 4) : (actual >= 3 && actual <= 5))
      : (actual === expect);
    console.log(`│ ${label.padEnd(20)} │ ${String(expect).padEnd(6)} │ ${String(actual).padEnd(6)} │ ${ok ? '✅' : '❌'}   │`);
  }
  console.log('└──────────────────────┴────────┴────────┴──────┘');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
