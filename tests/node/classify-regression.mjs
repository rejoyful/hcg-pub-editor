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
  pieces.push(extractConstBlock(src, 'TOC_ENTRY_TEXTS'));
  pieces.push(extractConstBlock(src, 'BLOCK_CONTAINERS_FOR_TEXT'));
  pieces.push(extractBlock(src, /^function classifyByKeyword\(/m));
  pieces.push(extractBlock(src, /^function extractPlainText\(/m));
  pieces.push(extractBlock(src, /^function mergeMark\(/m));
  pieces.push(extractBlock(src, /^function markAllInline\(/m));
  pieces.push(extractBlock(src, /^function isEmptyPara\(/m));
  pieces.push(extractBlock(src, /^function splitParagraphOnHardBreak\(/m));
  pieces.push(extractBlock(src, /^function applyKeywordRules\(/m));
  pieces.push(extractBlock(src, /^function normalizePastedHtml\(/m));
  pieces.push(extractBlock(src, /^function applyKeywordRulesToHtml\(/m));

  const body = pieces.join('\n\n') + `
    return {
      H1_EXACT, H1_PREFIX, CLF_GRAY, CLF_BLUE,
      classifyByKeyword, normalizePastedHtml, applyKeywordRulesToHtml,
      applyKeywordRules,
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
    h1: [], h2: [], h3: [], fig: [], callout: [], ref_head: [],
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
    // fig 본체: <strong> 직계자식, 바로 앞 형제가 📷 라벨 p 인 경우
    if (c.querySelector(':scope > strong')){
      const prev = c.previousElementSibling;
      const isFigBody = prev && prev.tagName === 'P' && (prev.textContent || '').startsWith('📷 이미지 첨부');
      if (isFigBody) { out.fig.push(text); continue; }
      // 그 외 <strong>-wrap p 는 ref-head (참고문헌 스타일)
      out.ref_head.push(text);
      continue;
    }
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

  /* ── [커밋 3] 작은따옴표(‘…’) 자동 볼드 ── */
  console.log('\n─── [커밋 3] 작은따옴표 ‘…’ 자동 볼드 ───');
  const quoteCases = [
    {
      label: '단일 따옴표 구간',
      html: '<p>저자가 ‘환자가 스승이다’라고 말했다.</p>',
      contains: '<strong>‘환자가 스승이다’</strong>',
    },
    {
      label: '같은 단락 내 여러 번',
      html: '<p>‘죄를 지은 사람을 미워하지 말고 죄를 미워하라’ 와 ‘괜찮다’ 둘 다.</p>',
      matches: 2,
    },
    {
      label: '이미 <strong> 안쪽이면 중복 감싸지 않음',
      html: '<p><strong>바깥 ‘안쪽’ 굵게</strong></p>',
      notContains: '<strong>‘',
    },
    {
      label: '헤딩 안 따옴표도 볼드 적용(시맨틱 유지)',
      html: '<h3>‘환자가 스승이다’</h3>',
      contains: '<strong>‘환자가 스승이다’</strong>',
    },
    {
      label: 'ASCII 아포스트로피는 건드리지 않음',
      html: "<p>don't touch this apostrophe</p>",
      notContains: '<strong>',
    },
  ];
  for (const c of quoteCases){
    const out = helpers.applyKeywordRulesToHtml(c.html);
    if (c.contains !== undefined){
      check(`${c.label}`, out.includes(c.contains), `out=${out}`);
    } else if (c.notContains !== undefined){
      check(`${c.label}`, !out.includes(c.notContains), `out=${out}`);
    } else if (c.matches !== undefined){
      const n = (out.match(/<strong>‘[^<]*’<\/strong>/g) || []).length;
      check(`${c.label}: ${c.matches}개`, n === c.matches, `out=${out}`);
    }
  }

  /* ── [이슈 1] &nbsp; / whitespace-only <p> 도 "빈 단락"으로 제거 ── */
  console.log('\n─── [이슈 1] &nbsp; / whitespace-only 빈 p 제거 ───');
  const nbspCases = [
    { label: 'NBSP only',         html: '<p>A</p><p>&nbsp;</p><p>B</p>',                 expect: 2 },
    { label: 'multiple NBSP',     html: '<p>A</p><p>\u00A0\u00A0\u00A0</p><p>B</p>',    expect: 2 },
    { label: 'NBSP + space',      html: '<p>A</p><p>\u00A0 \u00A0</p><p>B</p>',         expect: 2 },
    { label: 'NBSP inside span',  html: '<p>A</p><p><span>&nbsp;</span></p><p>B</p>',   expect: 2 },
    { label: 'NBSP in p with br', html: '<p>A</p><p>&nbsp;<br></p><p>B</p>',            expect: 3 /* br 포함이면 보존 */ },
    { label: 'non-breaking text', html: '<p>A</p><p>\u00A0가\u00A0</p><p>B</p>',        expect: 3 /* 실제 글자 포함 */ },
  ];
  for (const c of nbspCases){
    const out = helpers.normalizePastedHtml(c.html);
    const dom = new JSDOM('<!doctype html><html><body><div>' + out + '</div></body></html>');
    const n = dom.window.document.querySelectorAll('p').length;
    check(`${c.label}: <p>${c.expect}개`, n === c.expect, `actual=${n}, html=${out}`);
  }

  /* ── [이슈 2] JSON 단계 멱등성 — HTML 단계가 이미 붙인 fig 라벨/callout 패딩이
       JSON 단계에서 중복되지 않아야 함. 화타 실측에서 "목차 이후 이유 없는 빈 줄"
       의 원인으로 지목된 버그. ── */
  console.log('\n─── [이슈 2] applyKeywordRules JSON 단계 멱등성 ───');
  const text = (s) => ({ type:'text', text:s });
  const P = (inline) => ({ type:'paragraph', content: inline });
  const emptyP = () => ({ type:'paragraph', content: [] });
  const bold = { type:'bold' };
  const highlightGray = { type:'highlight', attrs:{ color: helpers.CLF_GRAY }};
  const italic = { type:'italic' };
  const highlightBlue = { type:'highlight', attrs:{ color: helpers.CLF_BLUE }};
  const figLabelInline = { type:'text', text:'📷 이미지 첨부', marks:[italic, highlightBlue] };

  /* (a) fig 중복 라벨 방지 — HTML 단계가 만든 [emptyP, figLabel, body-bold] 가
         JSON 단계에서 재처리될 때 label 이 두 번 찍히면 안 된다. */
  {
    const figBodyText = '그림 9. 혼동하기 쉬운 영지버섯과 붉은사슴뿔버섯';
    const docIn = { type:'doc', content: [
      emptyP(),
      P([ figLabelInline ]),
      P([{ type:'text', text: figBodyText, marks:[bold] }]),
    ]};
    const docOut = helpers.applyKeywordRules(docIn);
    const labelCount = docOut.content.filter(n =>
      n.type === 'paragraph' && Array.isArray(n.content) &&
      n.content.some(c => c && c.type === 'text' && String(c.text || '').startsWith('📷 이미지 첨부'))
    ).length;
    check('fig 라벨이 중복되지 않음 (HTML→JSON 순차 처리 시 1회)',
      labelCount === 1, `라벨 개수=${labelCount}, out=${JSON.stringify(docOut.content.map(n => n.type))}`);
  }

  /* (b) callout 하단 패딩 중복 방지 — HTML 단계가 이미 trailing emptyP 를 붙여뒀다면
         JSON 단계에서 또 하나를 붙이면 안 된다. */
  {
    const docIn = { type:'doc', content: [
      emptyP(), emptyP(),
      P([{ type:'text', text:'· 블릿 소항', marks:[bold, highlightGray] }]),
      emptyP(),
      P([ text('다음 본문 단락') ]),
    ]};
    const docOut = helpers.applyKeywordRules(docIn);
    /* callout 이후 연속 빈 단락 개수가 딱 1이어야 한다 */
    const idx = docOut.content.findIndex(n =>
      n.type === 'paragraph' && Array.isArray(n.content) &&
      n.content.some(c => c && c.type === 'text' && String(c.text || '').startsWith('· 블릿'))
    );
    let trailingEmpties = 0;
    for (let k = idx + 1; k < docOut.content.length; k++){
      const nn = docOut.content[k];
      const isEmpty = nn && nn.type === 'paragraph' && (!Array.isArray(nn.content) || nn.content.length === 0);
      if (isEmpty) trailingEmpties++;
      else break;
    }
    check('callout 하단 빈 단락이 중복되지 않음 (1개 유지)',
      trailingEmpties === 1, `trailingEmpties=${trailingEmpties}`);
  }

  /* (c) callout 상단 패딩 중복 방지 — HTML 단계가 이미 [emptyP, emptyP, callout] 를 만들었으면
         JSON 단계에서 추가 빈 단락을 넣지 않는다. */
  {
    const docIn = { type:'doc', content: [
      P([ text('앞 본문') ]),
      emptyP(), emptyP(),
      P([{ type:'text', text:'· 블릿 소항', marks:[bold, highlightGray] }]),
      emptyP(),
    ]};
    const docOut = helpers.applyKeywordRules(docIn);
    /* callout 위치 찾기 */
    const idx = docOut.content.findIndex(n =>
      n.type === 'paragraph' && Array.isArray(n.content) &&
      n.content.some(c => c && c.type === 'text' && String(c.text || '').startsWith('· 블릿'))
    );
    /* callout 앞 연속 빈 단락 개수 */
    let leadingEmpties = 0;
    for (let k = idx - 1; k >= 0; k--){
      const nn = docOut.content[k];
      const isEmpty = nn && nn.type === 'paragraph' && (!Array.isArray(nn.content) || nn.content.length === 0);
      if (isEmpty) leadingEmpties++;
      else break;
    }
    check('callout 상단 빈 단락이 중복되지 않음 (정확히 2개)',
      leadingEmpties === 2, `leadingEmpties=${leadingEmpties}`);
  }

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
  /* normalize 전후 <p> 개수 비교 — normalizePastedHtml 의 빈 p 제거가
     실제로 몇 단락을 걷어내는지 진단. */
  const domBefore = new JSDOM('<!doctype html><html><body><div>' + cocoa + '</div></body></html>');
  const pCountBefore = domBefore.window.document.querySelectorAll('p').length;
  const norm = helpers.normalizePastedHtml(cocoa);
  const domAfter = new JSDOM('<!doctype html><html><body><div>' + norm + '</div></body></html>');
  const pCountAfter = domAfter.window.document.querySelectorAll('p').length;
  console.log(`  <p> before normalize: ${pCountBefore}`);
  console.log(`  <p> after  normalize: ${pCountAfter}  (제거된 빈 p: ${pCountBefore - pCountAfter})`);
  const final = helpers.applyKeywordRulesToHtml(norm);
  const tally = analyzeFinalHtml(final, helpers);

  console.log('  H1:', tally.h1.length, '(샘플:', tally.h1.slice(0,4), ')');
  console.log('  H2:', tally.h2.length);
  console.log('  H3:', tally.h3.length);
  console.log('  callout:', tally.callout.length);
  console.log('  fig:', tally.fig.length);
  console.log('  ref-head:', tally.ref_head.length, '(샘플:', tally.ref_head, ')');
  console.log('  p(본문):', tally.p_nonempty.length);
  console.log('  p(섹션브레이크):', tally.p_section_break.length);
  console.log('  p(kw-pad/fig·callout 패딩):', tally.p_kw_pad.length);
  console.log('  p(기타 빈):', tally.p_empty_other.length);

  /* ── 커밋 1 효과: fig 21개 중 20개 (그림 9: 305자로 300자 상한 초과) ── */
  check('fig 20개 (그림 9는 305자 상한 초과로 본문 p 유지)',
    tally.fig.length === 20, `actual=${tally.fig.length}`);

  /* ── 커밋 2 효과: 장 17 / 절 58 / 소항 19+블릿 4 = callout 23 ── */
  check('H2 (장) 17개', tally.h2.length === 17, `actual=${tally.h2.length}`);
  /* H3 카운트 체크는 '이슈 4' 에서 59로 재검증 (저자 이름 +1). 원본 '절 58 개' 체크는 제거. */
  check('callout (소항+블릿) 23개', tally.callout.length === 23, `actual=${tally.callout.length}`);

  /* ── [이슈 4] 저자 이름 H3 승격: "저자 소개" 영역 첫 이름 단락이 H3 ── */
  check('H3 에 "윤성수(尹星洙)" 포함 (저자 이름 승격)',
    tally.h3.includes('윤성수(尹星洙)'),
    `샘플=${JSON.stringify(tally.h3.slice(0,3))}`);
  /* 저자 이름 승격은 1건만 (H3 58 → 59) */
  check('H3 (절 + 저자 이름) 59개', tally.h3.length === 59, `actual=${tally.h3.length}`);

  /* ── [이슈 2/3] 참고문헌 → ref-head 2건 (line 45 '참고문헌', line 851 '<참고문헌>') ── */
  check('ref-head 2개 (참고문헌 / <참고문헌>)',
    tally.ref_head.length === 2,
    `actual=${tally.ref_head.length}, samples=${JSON.stringify(tally.ref_head)}`);
  /* 참고문헌은 H1 에서 빠져야 함 */
  check('H1 에 "참고문헌" 없음',
    !tally.h1.includes('참고문헌'),
    `H1 목록=${JSON.stringify(tally.h1)}`);

  /* ── H1 (영역): 2 또는 3 (참고문헌 제거로 감소, 목차 내부 '서문' 오승격 허용) ── */
  check('H1 (영역) 2~3개 (참고문헌 제외, 목차 \'서문\' 오승격 허용)',
    tally.h1.length >= 2 && tally.h1.length <= 3,
    `actual=${tally.h1.length}, samples=${JSON.stringify(tally.h1)}`);

  /* ── 섹션 경계 힌트 assertion 은 PR #4 에서 제거됨 (PubParagraph revert).
   *    tally.p_section_break 는 진단용으로만 남겨둔다 (data-section-break
   *    속성이 normalizePastedHtml 단계에서 더 이상 붙지 않으므로 항상 0). */

  /* ── 기타 빈 p 없음 (단발 빈 줄은 기존 거동대로 제거) ── */
  check('단발 빈 p 제거 (기존 거동 유지)',
    tally.p_empty_other.length === 0,
    `기타 빈 p=${tally.p_empty_other.length}`);

  /* ── [idempotency] 목차 선행 번호 제거: 이미 번호가 박힌 bulletList/orderedList
     가 목차 영역에 들어오면, CSS `ul.toc-list > li::before` 의 counter 와
     중복되어 "1. 1. 서론" 처럼 이중 렌더된다. 이 번호를 제거해 CSS 만
     번호의 단일 출처가 되도록 보장한다. ── */
  console.log('\n─── [idempotency] 목차 선행 번호 제거 ───');
  {
    /* 시나리오 B — 이미 bulletList 로 구조화된 입력 (재업로드·export 라운드트립 후) */
    const docB = {
      type:'doc',
      content:[
        { type:'heading', attrs:{ level:1 }, content:[{type:'text', text:'목차'}] },
        { type:'bulletList', content:[
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'1. 서론'}] }] },
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'2) 본론'}] }] },
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'① 결론'}] }] },
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'I. 부록'}] }] },
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'제1장 도입'}] }] /* 보존 */ },
        ]},
      ],
    };
    const outB = helpers.applyKeywordRules(docB);
    const listB = outB.content.find(n => n && n.type === 'bulletList');
    check('Scenario B: 기존 bulletList 보존', !!listB);
    if (listB){
      const textsB = listB.content.map(li =>
        (li?.content?.[0]?.content || [])
          .filter(c => c?.type === 'text').map(c => c.text).join('')
      );
      check('Scenario B: "1. 서론" → "서론"',
        textsB[0] === '서론', `actual="${textsB[0]}"`);
      check('Scenario B: "2) 본론" → "본론"',
        textsB[1] === '본론', `actual="${textsB[1]}"`);
      check('Scenario B: "① 결론" → "결론"',
        textsB[2] === '결론', `actual="${textsB[2]}"`);
      check('Scenario B: "I. 부록" → "부록"',
        textsB[3] === '부록', `actual="${textsB[3]}"`);
      check('Scenario B: "제1장 도입" 은 장 접두라 보존',
        textsB[4] === '제1장 도입', `actual="${textsB[4]}"`);
    }

    /* 시나리오 C — 멱등성: 번호가 이미 제거된 입력에 다시 적용해도 동일 */
    const docC = JSON.parse(JSON.stringify(outB));
    const outC = helpers.applyKeywordRules(docC);
    const listC = outC.content.find(n => n && n.type === 'bulletList');
    if (listC){
      const textsC = listC.content.map(li =>
        (li?.content?.[0]?.content || [])
          .filter(c => c?.type === 'text').map(c => c.text).join('')
      );
      check('Scenario C: 재적용 후에도 "서론"이 "서론" (멱등)',
        textsC[0] === '서론', `actual="${textsC[0]}"`);
      check('Scenario C: 재적용 후에도 "제1장 도입" 이 보존',
        textsC[4] === '제1장 도입', `actual="${textsC[4]}"`);
    }

    /* 시나리오 D — orderedList 도 동일하게 처리 */
    const docD = {
      type:'doc',
      content:[
        { type:'heading', attrs:{ level:1 }, content:[{type:'text', text:'목차'}] },
        { type:'orderedList', content:[
          { type:'listItem', content:[{ type:'paragraph', content:[{type:'text', text:'1. 서론'}] }] },
        ]},
      ],
    };
    const outD = helpers.applyKeywordRules(docD);
    const listD = outD.content.find(n => n && n.type === 'orderedList');
    if (listD){
      const textD = (listD.content[0]?.content?.[0]?.content || [])
        .filter(c => c?.type === 'text').map(c => c.text).join('');
      check('Scenario D: orderedList 도 번호 제거',
        textD === '서론', `actual="${textD}"`);
    }
  }

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
    ['H1 (영역)',               '2~3',   tally.h1.length,  (a) => a >= 2 && a <= 3],
    ['H2 (장)',                 17,      tally.h2.length,  (a) => a === 17],
    ['H3 (절+저자이름)',        59,      tally.h3.length,  (a) => a === 59],
    ['callout (소항+블릿)',     23,      tally.callout.length, (a) => a === 23],
    ['fig (그림, 그림9 제외)',   20,      tally.fig.length, (a) => a === 20],
    ['ref-head (참고문헌)',      2,       tally.ref_head.length, (a) => a === 2],
  ];
  for (const [label, expect, actual, pred] of rows){
    const ok = pred(actual);
    console.log(`│ ${label.padEnd(20)} │ ${String(expect).padEnd(6)} │ ${String(actual).padEnd(6)} │ ${ok ? '✅' : '❌'}   │`);
  }
  console.log('└──────────────────────┴────────┴────────┴──────┘');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
