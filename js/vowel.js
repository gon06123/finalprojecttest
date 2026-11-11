/* 02 모음 — 상단 삼각형 또는 가운데 작대기를 돌리면, 삼각형이 가리키는 방향에 따라
   모음 자리와 음양이 바뀐다. 처음엔 작대기 하나(ㅣ ↔ ㅡ)이고,
   배경을 클릭할 때마다 점이 나타나 작대기 옆으로 날아가 붙는다: 1번 ㅏ, 2번 ㅑ. */
(() => {
  // 각도: 0° = 오른쪽, 시계 방향이 + (CSS rotate 기준)
  // ch: 점 1개, ch2: 점 2개
  const VOWELS = {
    0:   { ch: 'ㅏ', ch2: 'ㅑ', pol: 'yang' },
    90:  { ch: 'ㅜ', ch2: 'ㅠ', pol: 'yin' },
    180: { ch: 'ㅓ', ch2: 'ㅕ', pol: 'yin' },
    270: { ch: 'ㅗ', ch2: 'ㅛ', pol: 'yang' },
  };
  const POL_NAME = { yang: '양(陽)', yin: '음(陰)' };
  const KEYS = { ArrowRight: 0, ArrowDown: 90, ArrowLeft: 180, ArrowUp: 270 };
  const MAX_DOTS = 2;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const body = document.body;
  const dial = $('#dial');
  const glyph = $('#glyph');
  const marks = $$('.mark');
  const polName = $('#pol-name');
  const live = $('#live');
  const labels = $$('.dial-label');

  let angle = 0;        // 삼각형(=작대기) 각도. 연속값이라 359°→0° 로 넘어갈 때 한 바퀴 돌지 않음
  let currentKey = null;
  let dragging = null;  // 'dial' | 'glyph' | null
  let dots = 0;         // 나온 점 수 (날아가는 중 포함)
  let landed = 0;       // 작대기에 붙은 획 수

  const norm = (a) => ((a % 360) + 360) % 360;
  const shortest = (d) => {
    d = norm(d);
    return d > 180 ? d - 360 : d;
  };

  const charOf = (key) => (landed >= 2 ? VOWELS[key].ch2 : VOWELS[key].ch);

  function render() {
    body.style.setProperty('--angle', `${angle}deg`);
    const key = norm(Math.round(angle / 90) * 90);
    if (key !== currentKey) showVowel(key);
  }

  function showVowel(key) {
    const v = VOWELS[key];
    const first = currentKey === null;
    currentKey = key;
    body.dataset.polarity = v.pol;
    polName.textContent = POL_NAME[v.pol];
    labels.forEach((l) => l.classList.toggle('is-active', Number(l.dataset.key) === key));
    if (!first && landed > 0) live.textContent = `${charOf(key)}, ${POL_NAME[v.pol]}`;
  }

  // 다이얼 둘레 표시: 점 2개가 되면 ㅑ ㅛ ㅕ ㅠ
  function updateLabels() {
    labels.forEach((l) => {
      const v = VOWELS[Number(l.dataset.key)];
      l.textContent = landed >= 2 ? v.ch2 : v.ch;
    });
  }

  function aimAt(a) {
    angle += shortest(a - angle);
    render();
  }

  // 손을 떼면 가장 가까운 90° 로 붙음
  function settle() {
    angle = Math.round(angle / 90) * 90;
    render();
  }

  function pointerAngle(e, el) {
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.05) return null; // 중심 근처는 방향이 불안정
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  /* ---- 드래그
     다이얼:  누른 방향을 삼각형이 그대로 가리킴
     작대기:  잡은 곳에서 돌린 만큼만 회전 ---- */
  function bindRotate(el, kind) {
    let last = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* 포인터가 이미 사라진 경우 */ }
      dragging = kind;
      body.classList.add('touched');
      last = pointerAngle(e, el);
      if (kind === 'dial' && last !== null) aimAt(last);
    });

    el.addEventListener('pointermove', (e) => {
      if (dragging !== kind) return;
      const p = pointerAngle(e, el);
      if (p === null) return;
      body.dataset.drag = kind;
      if (kind === 'dial') {
        aimAt(p);
      } else if (last === null) {
        last = p;
      } else {
        angle += shortest(p - last);
        last = p;
        render();
      }
    });

    const end = () => {
      if (dragging !== kind) return;
      dragging = null;
      delete body.dataset.drag;
      settle();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  bindRotate(dial, 'dial');
  bindRotate(glyph, 'glyph');

  /* ---- 배경 클릭 → 점이 나타나 작대기 옆으로 날아가 붙음 (1번 ㅏ, 2번 ㅑ) ---- */

  // i 번째 점이 내려앉을 자리의 지금 화면 좌표.
  // 글자 판 기준: 오른쪽 14cqw, 위아래는 점이 2개면 ∓9cqw.
  // 회전 애니메이션 중에도 맞도록 실제 그려진 각도를 읽는다.
  function dotTarget(i) {
    const r = glyph.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const t = getComputedStyle(glyph).transform;
    const m = t === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(t);
    const theta = Math.atan2(m.b, m.a);
    const unit = glyph.offsetWidth / 100;
    const lx = 14 * unit;
    const ly = (dots >= 2 ? (i === 0 ? -9 : 9) : 0) * unit;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function spawnDot(x, y) {
    if (dots >= MAX_DOTS) return;
    const i = dots++;
    glyph.dataset.count = String(dots); // 두 번째 점이 오면 첫 획이 미리 위로 비켜 줌

    const flyer = document.createElement('div');
    flyer.className = 'flyer';
    flyer.style.setProperty('--size', `${glyph.offsetWidth * 0.1}px`);
    flyer.style.translate = `${x}px ${y}px`;
    body.appendChild(flyer);

    const HOLD = 380;   // 클릭한 자리에서 톡 나타나 잠깐 머무는 시간
    const GLIDE = 850;  // 작대기 옆까지 날아가는 시간
    let start = null;

    function step(now) {
      if (start === null) start = now;
      const t = Math.min(1, Math.max(0, (now - start - HOLD) / GLIDE));
      const k = easeInOut(t);
      const to = dotTarget(i); // 날아가는 동안 회전해도 따라감
      flyer.style.translate = `${x + (to.x - x) * k}px ${y + (to.y - y) * k}px`;
      if (t < 1) requestAnimationFrame(step);
      else land(flyer, i);
    }
    requestAnimationFrame(step);
  }

  // 점이 작대기 옆에 내려앉은 뒤, 붙으면서 짧은 획으로 늘어남
  function land(flyer, i) {
    const m = marks[i];
    m.classList.add('no-anim');
    m.dataset.state = 'dot';
    void m.offsetWidth;
    m.classList.remove('no-anim');
    flyer.remove();
    setTimeout(() => {
      m.dataset.state = 'stroke';
      landed++;
      updateLabels();
      live.textContent = charOf(currentKey);
    }, 160);
  }

  // 드래그가 아닌 '클릭'만 배경 클릭으로 본다 (다이얼 클릭은 제외)
  let downAt = null;
  window.addEventListener('pointerdown', (e) => {
    downAt = e.target.closest('.dial') ? null : { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const dist = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (dist < 6) spawnDot(e.clientX, e.clientY);
  });

  /* ---- 접합부 필터 굵기를 글자 크기에 맞춤 ---- */
  const gooBlur = $('#goo-blur');
  const fitGoo = () => gooBlur.setAttribute('stdDeviation', (glyph.offsetWidth * 0.014).toFixed(2));
  fitGoo();
  window.addEventListener('resize', fitGoo);

  /* ---- 키보드 ---- */
  dial.addEventListener('keydown', (e) => {
    if (!(e.key in KEYS)) return;
    e.preventDefault();
    body.classList.add('touched');
    aimAt(KEYS[e.key]);
  });

  render();
})();
