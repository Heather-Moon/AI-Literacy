const STORAGE_KEY = 'cp_ai_literacy_v1';

const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzpp2q919l2s6lfBip3AKjdALloVk6eXeumL9uGSHdap3IldxQkF987uaLQwL7-vbzhQQ/exec';
const state = {
  screen: 'landing',
  currentQ: 0,
  answers: new Array(11).fill(null),
  score: null,
  level: null,
  axisScores: null,
  user: null,
};

// ── Persistence ──────────────────────────────────────────────────

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Routing ──────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  state.screen = name;
  saveState();
}

// ── Scoring ──────────────────────────────────────────────────────

function calculateResult() {
  const a = state.answers;

  const freqAvg = avg([a[0], a[1], a[2]]);                      // max 2.5
  const promptAvg = avg([a[3], a[4], a[5], a[6], a[7]]);          // max 4.0
  const spreadRaw = avg([a[8], a[9], a[10]]);                      // max 4.0

  // Q5(idx4), Q6(idx5), Q8(idx7) D=4 → +0.2 each to spread (Q4는 개인 검증 습관이라 가산 제외)
  const crossBonus = [4, 5, 7].filter(i => a[i] === 4).length * 0.2;
  const spreadAvg = spreadRaw + crossBonus;

  let level;
  if (freqAvg <= 1.5) {
    level = 1;
  } else if (promptAvg >= 2.5) {
    level = spreadAvg >= 3.25 ? 4 : 3;
  } else {
    level = 2;
  }

  state.level = level;
  state.axisScores = { freq: freqAvg, prompt: promptAvg, spread: spreadAvg };
}

// ── Question screen ───────────────────────────────────────────────

function renderQuestion(idx) {
  const q = QUESTIONS[idx];
  const total = QUESTIONS.length;

  document.getElementById('progress-bar-fill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('progress-text').textContent = `${idx + 1} / ${total}`;

  document.getElementById('question-text').textContent = `Q${idx + 1}. ${q.text}`;

  const container = document.getElementById('options-container');
  container.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn' + (state.answers[idx] === opt.value ? ' selected' : '');
    btn.innerHTML = `<span class="option-label">${opt.label}</span><span class="option-text">${opt.text}</span>`;
    btn.addEventListener('click', () => selectAnswer(idx, opt.value, btn));
    container.appendChild(btn);
  });

  const backBtn = document.getElementById('back-btn');
  backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
  backBtn.onclick = () => { state.currentQ = idx - 1; saveState(); renderQuestion(idx - 1); };
}

function selectAnswer(idx, value, clickedBtn) {
  state.answers[idx] = value;
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  clickedBtn.classList.add('selected');
  saveState();
  setTimeout(() => goNext(idx), 380);
}

function goNext(idx) {
  if (state.answers[idx] === null) return;
  const next = idx + 1;
  if (next >= QUESTIONS.length) {
    calculateResult();
    saveState();
    renderResult();
    showScreen('result');
  } else {
    state.currentQ = next;
    saveState();
    renderQuestion(next);
  }
}

// ── Result screen ─────────────────────────────────────────────────

function renderResult() {
  const lv = LEVELS[state.level];

  const badge = document.getElementById('result-badge');
  badge.style.background = `linear-gradient(135deg, ${lv.color} 0%, ${lv.lightColor} 100%)`;
  document.getElementById('result-badge-num').innerHTML =
    `<span class="badge-icon">${lv.icon}</span>`;

  document.getElementById('result-level-name').textContent = `Lv.${lv.id} ${lv.name}`;
  document.getElementById('result-level-en').textContent = `(${lv.englishName})`;
  document.getElementById('result-tagline').textContent = lv.tagline;
  document.getElementById('result-description').textContent = lv.description;
  const as = state.axisScores || {};
  document.getElementById('result-score').innerHTML =
    `빈도·깊이 <strong>${(as.freq || 0).toFixed(1)}</strong>/2.5 &nbsp;·&nbsp; ` +
    `프롬프트·자동화 <strong>${(as.prompt || 0).toFixed(1)}</strong>/4.0 &nbsp;·&nbsp; ` +
    `확산·주도 <strong>${(as.spread || 0).toFixed(1)}</strong>/4.0`;

  // 4-step progression
  document.getElementById('result-level-progression').innerHTML = [1, 2, 3, 4].flatMap((n, i) => {
    const lvData = LEVELS[n];
    const isCurrent = n === state.level;
    const isPast = n < state.level;
    const stepClass = `level-step${isCurrent ? ' active' : ''}${isPast ? ' passed' : ''}`;
    const step = `
      <div class="${stepClass}" data-level="${n}">
        <div class="level-step-dot">${isCurrent ? lvData.icon : (isPast ? '✓' : lvData.icon)}</div>
        <div class="level-step-label">${lvData.name}</div>
      </div>`;
    return i < 3 ? [step, `<div class="level-step-line${isPast ? ' passed' : ''}"></div>`] : [step];
  }).join('');
}

// ── Sheet submission ──────────────────────────────────────────────

function submitToSheet() {
  // 문항별 선택 답안을 라벨(A~D)·텍스트로 변환
  const answersDetail = state.answers.map((v, i) => {
    const opt = QUESTIONS[i]?.options.find(o => o.value === v);
    return opt
      ? { label: opt.label, text: opt.text, value: v }
      : { label: '', text: '', value: v };
  });

  const payload = {
    name: state.user?.name || '',
    email: state.user?.email || '',
    company: state.user?.company || '',
    job: state.user?.job || '',
    marketing: !!state.user?.marketing,
    level: state.level,
    axisScores: state.axisScores,
    answersDetail,
    userAgent: navigator.userAgent,
  };
  // text/plain + no-cors: 프리플라이트 없이 Apps Script로 전송 (fire-and-forget)
  return fetch(SHEET_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).catch(err => console.error('sheet submit failed:', err));
}

// ── Lead form ─────────────────────────────────────────────────────

function resetLeadForm() {
  const btn = document.querySelector('#lead-form .btn-submit');
  btn.disabled = false;
  btn.textContent = '리포트 확인하기 →';
  document.getElementById('form-error').style.display = 'none';
}

function initLeadForm() {
  document.getElementById('lead-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'none';

    const name = document.getElementById('field-name').value.trim();
    const email = document.getElementById('field-email').value.trim();
    const privacy = document.getElementById('field-privacy').checked;

    if (!name || !email) { showFormError('이름과 이메일을 입력해주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFormError('올바른 이메일 주소를 입력해주세요.'); return; }
    if (!privacy) { showFormError('개인정보 수집·이용 동의는 필수입니다.'); return; }

    state.user = {
      name,
      email,
      company: document.getElementById('field-company').value.trim(),
      job: document.getElementById('field-job').value.trim(),
      marketing: document.getElementById('field-marketing').checked,
    };
    saveState();

    const btn = document.querySelector('#lead-form .btn-submit');
    btn.disabled = true;
    btn.textContent = '리포트 준비 중...';

    // 시트 저장 (실패해도 리포트 표시는 그대로 진행)
    await Promise.all([submitToSheet(), new Promise(r => setTimeout(r, 700))]);

    try {
      renderDetailedResult();
      showScreen('detail');
    } catch (err) {
      console.error('renderDetailedResult error:', err);
      resetLeadForm();
      showFormError('리포트 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  });
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Detailed result ────────────────────────────────────────────────

function renderDetailedResult() {
  const lv = LEVELS[state.level];

  // ① Header
  const badge = document.getElementById('detail-badge');
  badge.style.background = `linear-gradient(135deg, ${lv.color} 0%, ${lv.lightColor} 100%)`;
  document.getElementById('detail-badge-num').innerHTML =
    `<span class="badge-icon">${lv.icon}</span>`;
  document.getElementById('detail-greeting').textContent =
    state.user?.name ? `${state.user.name}님의 AI 리터러시 진단 리포트` : 'AI 리터러시 진단 리포트';
  document.getElementById('detail-level-name').textContent = `Lv.${lv.id} ${lv.name} (${lv.englishName})`;
  document.getElementById('detail-level-tagline').textContent = lv.tagline;

  // ② Level position indicator + narrative
  document.getElementById('detail-level-steps').innerHTML = [1, 2, 3, 4].map(n => {
    const lvData = LEVELS[n];
    const isCurrent = n === state.level;
    const isPast = n < state.level;
    const dotStyle = isCurrent
      ? `background:#fff;border:3px solid ${lv.color};box-shadow:0 0 0 6px ${lv.color}33`
      : isPast ? 'background:#EFF6FF;border:2px solid #93C5FD' : '';
    return `
      <div class="lps-item ${isCurrent ? 'lps-current' : ''} ${isPast ? 'lps-past' : ''}">
        <div class="lps-dot" style="${dotStyle}">
          <span class="lps-dot-icon">${lvData.icon}</span>
          ${isPast ? '<span class="lps-check">✓</span>' : ''}
        </div>
        <div class="lps-num">Lv.${n}</div>
        <div class="lps-label">${lvData.name}</div>
        <div class="lps-en">${lvData.englishName}</div>
        ${n < 4 ? `<div class="lps-line ${isPast ? 'lps-line-past' : ''}"></div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('detail-narrative').innerHTML = generatePersonalizedNarrative();

  // ③ Competency radar chart (SVG triangle)
  // freq max=2.5, prompt/spread max=4.0 (spread includes cross-axis bonus)
  const axSc = state.axisScores || { freq: 0, prompt: 0, spread: 0 };
  const dimScores = [axSc.freq, axSc.prompt, axSc.spread];
  const dimMax = [2.5, 4, 4];
  {
    const cx = 120, cy = 138, R = 92;
    const D = Math.PI / 180;
    const A = [-90, 30, 150];
    const px = (i, r) => (cx + r * Math.cos(A[i] * D)).toFixed(1);
    const py = (i, r) => (cy + r * Math.sin(A[i] * D)).toFixed(1);
    const pts = r => [0, 1, 2].map(i => px(i, r) + ',' + py(i, r)).join(' ');

    const grid = [1, 2, 3, 4].map(l =>
      `<polygon points="${pts(l / 4 * R)}" fill="none" stroke="#E5E7EB" stroke-width="1"/>`
    ).join('');
    const axes = [0, 1, 2].map(i =>
      `<line x1="${cx}" y1="${cy}" x2="${px(i, R)}" y2="${py(i, R)}" stroke="#E5E7EB" stroke-width="1.2"/>`
    ).join('');
    const norm = i => Math.min(dimScores[i] / dimMax[i], 1);
    const spts = [0, 1, 2].map(i => px(i, norm(i) * R) + ',' + py(i, norm(i) * R)).join(' ');
    const dots = [0, 1, 2].map(i =>
      `<circle cx="${px(i, norm(i) * R)}" cy="${py(i, norm(i) * R)}" r="4" fill="${lv.color}" stroke="white" stroke-width="2"/>`
    ).join('');
    const scaleNums = '';

    const tpX = parseFloat(px(0, R)), tpY = parseFloat(py(0, R));
    const brX = parseFloat(px(1, R)), brY = parseFloat(py(1, R));
    const blX = parseFloat(px(2, R)), blY = parseFloat(py(2, R));
    const lc = lv.color, gc = '#4B5563';
    const f = n => n.toFixed(1);

    // 10점 환산
    const score10 = dimScores.map((s, i) => (s / dimMax[i] * 10).toFixed(1));

    const dimLabels = `
      <text x="${f(tpX)}" y="${f(tpY - 18)}" text-anchor="middle" font-size="11" font-weight="700" fill="${gc}" font-family="Pretendard,sans-serif">${COMPETENCY_DIMS[0].label}</text>
      <text x="${f(tpX)}" y="${f(tpY - 4)}" text-anchor="middle" font-size="13" font-weight="800" fill="${lc}" font-family="Pretendard,sans-serif">${score10[0]}</text>
      <text x="${f(brX + 5)}" y="${f(brY + 14)}" text-anchor="start" font-size="10" font-weight="700" fill="${gc}" font-family="Pretendard,sans-serif">프롬프트</text>
      <text x="${f(brX + 5)}" y="${f(brY + 26)}" text-anchor="start" font-size="10" font-weight="700" fill="${gc}" font-family="Pretendard,sans-serif">· 자동화</text>
      <text x="${f(brX + 5)}" y="${f(brY + 41)}" text-anchor="start" font-size="13" font-weight="800" fill="${lc}" font-family="Pretendard,sans-serif">${score10[1]}</text>
      <text x="${f(blX - 5)}" y="${f(blY + 14)}" text-anchor="end" font-size="10" font-weight="700" fill="${gc}" font-family="Pretendard,sans-serif">확산 · 주도</text>
      <text x="${f(blX - 5)}" y="${f(blY + 29)}" text-anchor="end" font-size="13" font-weight="800" fill="${lc}" font-family="Pretendard,sans-serif">${score10[2]}</text>`;

    const radarSvg = `<svg viewBox="-10 -20 285 270" width="100%" xmlns="http://www.w3.org/2000/svg">
      ${grid}${axes}
      <polygon points="${spts}" fill="${lv.color}2E" stroke="${lv.color}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}${scaleNums}${dimLabels}
    </svg>`;

    const scoreCards = COMPETENCY_DIMS.map((dim, i) => {
      const score = dimScores[i];
      const sub = i === 0
        ? (score >= 2.0 ? dim.highLabel : score >= 1.5 ? dim.midLabel : dim.lowLabel)
        : (score >= 3 ? dim.highLabel : score >= 2 ? dim.midLabel : dim.lowLabel);
      return `<div class="radar-score-card">
        <div class="radar-score-badge" style="background:${lv.color}18;color:${lv.color};border:1.5px solid ${lv.color}44">
          <span class="radar-score-val">${score10[i]}</span><span class="radar-score-max">/10</span>
        </div>
        <div class="radar-score-info">
          <div class="radar-score-header">
            <div class="radar-score-name">${dim.icon} ${dim.label}</div>
            <span class="radar-score-sub">${sub}</span>
          </div>
          <div class="radar-score-hint">${dim.hint}</div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('detail-radar').innerHTML = `
      <div class="radar-layout">
        <div class="radar-chart-wrap">${radarSvg}</div>
        <div class="radar-cards">${scoreCards}</div>
      </div>`;
  }

  // ⑥ Next level guide
  document.getElementById('detail-guide').innerHTML =
    lv.nextLevelGuide.map((g, i) => `
      <div class="guide-item">
        <div class="guide-action">
          <span class="guide-step">${i + 1}</span>${g.action}
        </div>
        <div class="guide-detail">${g.detail}</div>
      </div>`).join('');

  // ⑦ Product recommendation (AI Fluent + SkillFit)
  document.getElementById('detail-tracks').innerHTML = `
    <div class="product-cards">
      <div class="product-card product-card--primary">
        <div class="product-card-icon">🎯</div>
        <span class="product-card-tag product-card-tag--eval">AI 역량 평가</span>
        <div class="product-card-name">AI Fluent</div>
        <div class="product-card-desc">개인과 조직의 AI 활용 역량을 정밀하게 진단하는 평가 플랫폼입니다. 객관적인 기준으로 현재 수준을 측정하고, 역량 성장 과정을 체계적으로 추적할 수 있습니다.</div>
        <a href="https://codepresso.io" target="_blank" rel="noopener" class="btn-primary track-cta-btn">자세히 보기 →</a>
      </div>
      <div class="product-card">
        <div class="product-card-icon">🧠</div>
        <span class="product-card-tag product-card-tag--learn">AI 맞춤 학습</span>
        <div class="product-card-name">SkillFit</div>
        <div class="product-card-desc">학습자의 수준과 학습 패턴을 분석해 최적의 강의를 제공하는 AI 맞춤 학습 기능입니다. 나의 AI 리터러시 단계에 맞는 학습 경로를 자동으로 설계합니다.</div>
        <a href="https://codepresso.io" target="_blank" rel="noopener" class="btn-primary track-cta-btn">자세히 보기 →</a>
      </div>
    </div>`;
}

function generatePersonalizedNarrative() {
  const axSc = state.axisScores || { freq: 0, prompt: 0, spread: 0 };
  const a = state.answers;

  // ── Para 0: 레벨 설명 ──
  const p0 = LEVELS[state.level]?.description || '';

  // ── Para 1: 축 조합 고정 코멘트 ──
  const freqTier = axSc.freq >= 2 ? '상' : axSc.freq > 1.5 ? '중' : '하';
  const promptTier = axSc.prompt >= 2.5 ? '상' : axSc.prompt > 2 ? '중' : '하';
  const spreadTier = axSc.spread >= 3.25 ? '상' : axSc.spread > 2 ? '중' : '하';
  const p1 = AXIS_COMMENTS[freqTier]?.[promptTier]?.[spreadTier] || '';

  // 문항별 정규화 점수 (Q1~Q3 max=2.5, Q4~Q11 max=4)
  const normVal = (v, i) => i < 3 ? (v || 0) / 2.5 : (v || 0) / 4;
  const scored = a.map((v, i) => ({ v: v || 0, i, n: normVal(v, i) }));
  const sorted = [...scored].sort((x, y) => {
    if (Math.abs(y.n - x.n) < 0.001) return y.v - x.v; // 동점이면 절대 점수 높은 쪽
    return y.n - x.n;
  });
  const topQ = sorted[0];
  const lowQ = sorted[sorted.length - 1];

  // Para 2 — 강점
  if (topQ && topQ.n >= 0.625) {
    const topOpt = QUESTIONS[topQ.i]?.options.find(o => o.value === topQ.v);
    const note = QUESTION_CONTEXT[topQ.i]?.strengthNote?.[topQ.v];
    if (topOpt && note) {
      p2 = `<strong>"${topOpt.text}"</strong>라고 답하신 부분이 현재 단계의 핵심 강점입니다. ${note}`;
    }
  }

  // Para 3 — 성장 포인트
  if (lowQ && lowQ.n <= 0.375 && lowQ.i !== topQ?.i) {
    const lowOpt = QUESTIONS[lowQ.i]?.options.find(o => o.value === lowQ.v);
    const note = QUESTION_CONTEXT[lowQ.i]?.growthNote?.[lowQ.v];
    if (lowOpt && note) {
      p3 = `반면 <strong>"${lowOpt.text}"</strong>라고 답하신 부분은 앞으로 가장 집중해서 키워야 할 영역입니다. ${note}`;
    }
  }

  // ── Para 4: 축 불균형 관찰 (정규화 격차 ≥ 0.4일 때만) ──
  const normAxis = [
    (axSc.freq - 1) / 1.5,
    (axSc.prompt - 1) / 3,
    (axSc.spread - 1) / 3,
  ];
  const maxN = Math.max(...normAxis);
  const minN = Math.min(...normAxis);
  let p4 = '';
  if (maxN - minN >= 0.4) {
    const strongDim = COMPETENCY_DIMS[normAxis.indexOf(maxN)];
    const weakDim = COMPETENCY_DIMS[normAxis.indexOf(minN)];
    p4 = `전반적으로 <strong>${strongDim.label}</strong> 축은 강한 반면 <strong>${weakDim.label}</strong> 축과의 격차가 있습니다. 이 불균형을 줄이는 것이 다음 단계로 가는 가장 빠른 길입니다.`;
  }

  return [p0, p1, p2, p3, p4]
    .filter(Boolean)
    .map(p => `<p>${p}</p>`)
    .join('');
}

function avg(arr) {
  const valid = arr.filter(v => v !== null && v !== undefined);
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
}

// ── Init ──────────────────────────────────────────────────────────

function init() {
  loadState();

  document.getElementById('start-btn').addEventListener('click', () => {
    // Restore in-progress session
    const hasProgress = state.answers.some(a => a !== null);
    if (hasProgress && state.screen === 'question') {
      showScreen('question');
      renderQuestion(state.currentQ);
      return;
    }
    // Fresh start
    state.currentQ = 0;
    state.answers = new Array(11).fill(null);
    state.score = null;
    state.level = null;
    state.user = null;
    saveState();
    showScreen('question');
    renderQuestion(0);
  });

  document.getElementById('see-report-btn').addEventListener('click', () => showScreen('lead-form'));

  document.getElementById('back-to-result-from-form-btn').addEventListener('click', () => {
    resetLeadForm();
    renderResult();
    showScreen('result');
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    state.currentQ = 0;
    state.answers = new Array(11).fill(null);
    state.score = null;
    state.level = null;
    state.user = null;
    saveState();
    showScreen('landing');
  });

  document.getElementById('back-to-result-btn').addEventListener('click', () => {
    renderResult();
    showScreen('result');
  });

  initLeadForm();

  // Restore previous session to correct screen
  if (state.screen === 'question' && state.answers.some(a => a !== null)) {
    showScreen('question');
    renderQuestion(state.currentQ);
  } else if ((state.screen === 'result' || state.screen === 'lead-form') && state.level) {
    renderResult();
    showScreen(state.screen);
  } else if (state.screen === 'detail' && state.user) {
    renderDetailedResult();
    showScreen('detail');
  } else {
    showScreen('landing');
  }
}

document.addEventListener('DOMContentLoaded', init);