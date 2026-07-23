const STORAGE_KEY = 'cp_ai_literacy_v1';

const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzpp2q919l2s6lfBip3AKjdALloVk6eXeumL9uGSHdap3IldxQkF987uaLQwL7-vbzhQQ/exec';
const state = {
  screen: 'landing',
  currentQ: 0,
  answers: new Array(11).fill(null),
  score: null,
  level: null,
  axisScores: null,
  job: null,
  role: null,
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
    return;
  }

  // Guard against corrupted/out-of-range progress data
  const total = QUESTIONS.length;
  if (!Array.isArray(state.answers) || state.answers.length !== total) {
    state.answers = new Array(total).fill(null);
  }
  if (!Number.isInteger(state.currentQ) || state.currentQ < 0 || state.currentQ >= total) {
    state.currentQ = 0;
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
  // 세 문항의 D는 팀 표준화·공유·확산 성격을 띠므로 확산·주도 축에 가산 (실질 max 4.6)
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
  backBtn.onclick = () => {
    const prev = Math.max(0, idx - 1);
    state.currentQ = prev;
    saveState();
    renderQuestion(prev);
  };
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

// ── Profile screen (직무·역할, 결과 정확도 향상용) ───────────────────

function showProfileScreen() {
  document.getElementById('field-job').value = state.job || '';
  document.getElementById('field-role').value = state.role || '';
  document.getElementById('profile-form-error').style.display = 'none';
  showScreen('profile');
}

function initProfileForm() {
  document.getElementById('profile-form').addEventListener('submit', e => {
    e.preventDefault();
    const job = document.getElementById('field-job').value;
    const role = document.getElementById('field-role').value;
    const errorEl = document.getElementById('profile-form-error');

    if (!job || !role) {
      errorEl.textContent = '직무와 역할을 모두 선택해 주세요.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    state.job = job;
    state.role = role;
    saveState();
    showScreen('question');
    renderQuestion(state.currentQ);
  });
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
  document.getElementById('result-description').innerHTML =
    lv.description.split('\n').map(line => `<p>${line}</p>`).join('');
  const as = state.axisScores || {};
  document.getElementById('result-score').innerHTML =
    `빈도·깊이 <strong>${(as.freq || 0).toFixed(1)}</strong>/2.5 &nbsp;·&nbsp; ` +
    `프롬프트·자동화 <strong>${(as.prompt || 0).toFixed(1)}</strong>/4.0 &nbsp;·&nbsp; ` +
    `확산·주도 <strong>${(as.spread || 0).toFixed(1)}</strong>/4.6`;

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

// ── Share ─────────────────────────────────────────────────────────

function getShareUrl() {
  // 공유 링크는 항상 테스트 시작 화면(랜딩)으로 열리도록 쿼리·해시를 제외한 기본 URL만 사용
  return `${location.origin}${location.pathname}`;
}

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function shareApp() {
  const url = getShareUrl();

  // file://로 로컬에서 열었을 때 Web Share/클립보드 API를 호출하면 크로미움 렌더러가
  // RESULT_CODE_KILLED_BAD_MESSAGE로 강제 종료되는 문제가 있어 호출 자체를 건너뛴다.
  // 이 경우 URL도 로컬 파일 경로라 실제 공유에는 의미가 없으므로 안내만 띄운다.
  if (location.protocol === 'file:') {
    window.prompt('배포된 주소에서 공유해야 정상 동작합니다. (현재는 로컬 파일 미리보기)', url);
    return;
  }

  const shareData = {
    title: '당신은 AI를 쓰는 사람인가요, 다루는 사람인가요?',
    text: '11문항, 약 3분이면 나의 AI 활용 수준을 확인할 수 있어요.',
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 사용자가 공유를 취소한 경우
      // 그 외 실패(미지원 환경 등)는 아래 클립보드 복사로 폴백
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사되었습니다!');
  } catch (err) {
    window.prompt('아래 링크를 복사해 공유하세요', url);
  }
}

// ── Sheet submission ──────────────────────────────────────────────

function submitToSheet() {
  // 문항별 선택한 보기 라벨(A~D)만 저장 (답변 원문 텍스트는 저장하지 않음)
  const answersDetail = state.answers.map((v, i) => {
    const opt = QUESTIONS[i]?.options.find(o => o.value === v);
    return { label: opt?.label || '', value: v };
  });

  const payload = {
    name: state.user?.name || '',
    email: state.user?.email || '',
    company: state.user?.company || '',
    job: state.user?.job || '',
    role: state.user?.role || '',
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
      job: state.job || '',
      role: state.role || '',
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
  // freq max=2.5, prompt max=4.0, spread max=4.6 (cross-axis bonus 최대 0.6 포함)
  const axSc = state.axisScores || { freq: 0, prompt: 0, spread: 0 };
  const dimScores = [axSc.freq, axSc.prompt, axSc.spread];
  const dimMax = [2.5, 4, 4.6];
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
  // Lv1-2(탐색자·실행자)는 기초를 다지는 학습(SkillFit)을, Lv3-4(설계자·선도자)는 더 정교한 진단(AI Fluent)을 우선 추천
  const isFoundationTier = state.level <= 2;

  const fluentCard = {
    icon: '🎯',
    tagClass: 'eval',
    tag: 'AI 역량 평가',
    name: 'AI Fluent',
    desc: isFoundationTier
      ? '개인과 조직의 AI 활용 역량을 진단하는 평가 플랫폼입니다. 지금 수준을 기준점으로 남겨두면, 앞으로의 성장을 객관적으로 추적할 수 있습니다.'
      : '개인과 조직의 AI 활용 역량을 정밀하게 진단하는 평가 플랫폼입니다. 축별 세부 지표와 팀·조직 단위 비교까지, 더 세분화된 진단으로 다음 단계를 정확히 설계해보세요.',
  };
  const skillfitCard = {
    icon: '🧠',
    tagClass: 'learn',
    tag: 'AI 맞춤 학습',
    name: 'SkillFit',
    desc: isFoundationTier
      ? '학습자의 수준과 패턴을 분석해 최적의 강의를 제공하는 AI 맞춤 학습 기능입니다. 지금 단계에 맞는 커리큘럼으로 AI 활용의 기초 체력을 먼저 다져보세요.'
      : '학습자의 수준과 학습 패턴을 분석해 최적의 강의를 제공하는 AI 맞춤 학습 기능입니다. 이미 다져온 역량을 팀 전체로 확산시키는 데 활용할 수 있습니다.',
  };

  const primary = isFoundationTier ? skillfitCard : fluentCard;
  const secondary = isFoundationTier ? fluentCard : skillfitCard;
  const renderProductCard = (p, isPrimary) => `
      <div class="product-card${isPrimary ? ' product-card--primary' : ''}">
        <div class="product-card-icon">${p.icon}</div>
        <span class="product-card-tag product-card-tag--${p.tagClass}">${p.tag}</span>
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-desc">${p.desc}</div>
        <a href="https://codepresso.io" target="_blank" rel="noopener" class="btn-primary track-cta-btn">자세히 보기 →</a>
      </div>`;

  document.getElementById('detail-tracks').innerHTML = `
    <div class="product-cards">
      ${renderProductCard(primary, true)}
      ${renderProductCard(secondary, false)}
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
  const sortDesc = arr => [...arr].sort((x, y) => {
    if (Math.abs(y.n - x.n) < 0.001) return y.v - x.v; // 동점이면 절대 점수 높은 쪽
    return y.n - x.n;
  });

  // 레벨을 실제로 가르는 축(Q4~11: 프롬프트·자동화, 확산·주도)을 강점/성장포인트의
  // 우선 후보로 사용한다. Q4~11에서 기준을 충족하는 후보를 못 찾을 때만 Q1~3을 보조로 사용한다.
  const levelAxis = sortDesc(scored.filter(s => s.i >= 3));
  const freqAxis = sortDesc(scored.filter(s => s.i < 3));

  const topQ = levelAxis[0].n >= 0.625 ? levelAxis[0] : freqAxis[0];
  const lowQ = levelAxis[levelAxis.length - 1].n <= 0.375
    ? levelAxis[levelAxis.length - 1]
    : freqAxis[freqAxis.length - 1];

  // Para 2 — 강점
  let p2 = '';
  if (topQ && topQ.n >= 0.625) {
    const topOpt = QUESTIONS[topQ.i]?.options.find(o => o.value === topQ.v);
    const note = QUESTION_CONTEXT[topQ.i]?.strengthNote?.[topQ.v];
    if (topOpt && note) {
      p2 = note;
    }
  }

  // Para 3 — 성장 포인트
  // 빈도축(Q1~3, 최대 2.5)은 최저 옵션도 정규화 점수가 0.4라 다른 문항과 같은
  // 0.375 컷오프를 쓰면 항상 걸러진다. 강점 컷오프(0.625)와 동일한 기준선으로
  // 하위 2개 옵션(정규화 0.4·0.6)을 포착하도록 빈도축만 컷오프를 올려준다.
  const growthCutoff = lowQ && lowQ.i < 3 ? 0.625 : 0.375;
  let p3 = '';
  if (lowQ && lowQ.n <= growthCutoff && lowQ.i !== topQ?.i) {
    const lowOpt = QUESTIONS[lowQ.i]?.options.find(o => o.value === lowQ.v);
    const note = QUESTION_CONTEXT[lowQ.i]?.growthNote?.[lowQ.v];
    if (lowOpt && note) {
      p3 = note;
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
    // Restore in-progress session (완료되지 않은 응답이 남아있으면 이어서 진행)
    const hasProgress = state.answers.some(a => a !== null) && state.level === null;
    if (hasProgress) {
      showScreen('question');
      renderQuestion(state.currentQ);
      return;
    }
    // Fresh start — 직무·역할부터 먼저 수집
    state.currentQ = 0;
    state.answers = new Array(11).fill(null);
    state.score = null;
    state.level = null;
    state.job = null;
    state.role = null;
    state.user = null;
    saveState();
    showProfileScreen();
  });

  document.getElementById('exit-quiz-btn').addEventListener('click', () => {
    const ok = window.confirm('진단을 종료하고 처음 화면으로 돌아갈까요?\n지금까지 답변한 내용은 저장되어 다음에 이어서 진행할 수 있어요.');
    if (!ok) return;
    showScreen('landing');
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
    state.job = null;
    state.role = null;
    state.user = null;
    saveState();
    showScreen('landing');
  });

  document.getElementById('back-to-result-btn').addEventListener('click', () => {
    renderResult();
    showScreen('result');
  });

  document.getElementById('share-btn-result').addEventListener('click', shareApp);
  document.getElementById('share-btn-detail').addEventListener('click', shareApp);

  initLeadForm();
  initProfileForm();

  // Restore previous session to correct screen
  if (state.screen === 'question' && state.answers.some(a => a !== null)) {
    showScreen('question');
    renderQuestion(state.currentQ);
  } else if (state.screen === 'profile') {
    showProfileScreen();
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