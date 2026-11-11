/* 01 자음 — 화면 아래 가운데의 ㄱ 에서 글자만으로 된 나무가 자란다.
   누를 때마다 가지 끝 글자의 가로획 위에 70% 크기의 새 글자(ㅋ 또는 ㄲ)가 돋아난다.
   ㅋ(ㄱ 에 획을 더함)은 한 갈래로 뻗고, ㄲ(ㄱ 을 나란히 씀)은 두 갈래로 갈라진다.
   화면 왼쪽을 누르면 새 글자가 왼쪽으로, 오른쪽을 누르면 오른쪽으로 향하고, 자리가 없으면 그 가지는 멈춘다.
   아래쪽은 ㄲ 으로 갈라지고 위로 갈수록 ㅋ 이 많아지며, 맨 끝 세대는 모두 ㅋ 이다.
   다 자란 뒤 한 번 더 누르면 끝의 ㅋ 들이 낙엽처럼 떨어지고 다시 ㄱ 으로 돌아간다. */
(() => {
  const canvas = document.getElementById('tree');
  const ctx = canvas.getContext('2d');
  const live = document.getElementById('live');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAX_GEN = 6;
  const ROOT = 220;                  // 맨 아래 ㄱ 크기 (설계 단위, 화면 높이 960 기준)
  const RATIO = 0.7;                   // 새 글자는 앞 글자의 70%
  // 세대별로 ㄲ(두 갈래)이 나올 확률. 나머지는 ㅋ(한 갈래) — 마지막 세대는 0 이라 끝 가지는 모두 ㅋ
  const FORK = [0, 0.6, 0.9, 0.85, 0.8, 0.2, 0];
  const GROW = reduce ? 300 : 1100;    // 한 글자가 다 자라기까지(ms)
  const SHRINK = reduce ? 300 : 600;   // 시들어 들어가는 시간(ms)

  // 글자 모양 — 글자 크기 = 1, 원점 = 세로획 아래 가운데, 위쪽이 -y, +u 가 가로획이 뻗는 쪽
  const T = 0.17;        // 획 굵기
  const ARM = 0.86;      // ㄱ·ㅋ 가로획 끝
  const MID = -0.47;     // ㅋ 가운데 획 높이
  const MID_END = 0.74;  // ㅋ 가운데 획 끝
  const KK_ARM1 = 0.36;  // ㄲ 앞 ㄱ 의 가로획 끝
  const KK_V2 = 0.52;    // ㄲ 뒤 ㄱ 의 세로획 자리
  const KK_ARM2 = 0.92;  // ㄲ 뒤 ㄱ 의 가로획 끝
  const reach = (type) => (type === 'ㄲ' ? KK_ARM2 : ARM);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rand = Math.random;

  /* ---------- 캔버스 ---------- */
  let W = 0, H = 0, dpr = 1, base = 1;
  let ink = [14, 14, 14], paper = [255, 255, 255];
  const rgb = (str) => (str.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    base = Math.min(W / 600, H / 960);
    const cs = getComputedStyle(document.body);
    ink = rgb(cs.color);
    paper = rgb(cs.backgroundColor);
  }
  resize();
  window.addEventListener('resize', resize);

  // 새로 돋은 글자일수록 진하고, 오래된 글자는 조금씩 옅어짐
  const color = (k) => `rgb(${ink.map((c, i) => Math.round(lerp(c, paper[i], k))).join(',')})`;

  /* ---------- 나무 ---------- */
  // x, y: 세로획 아래 가운데 (맨 아래 ㄱ 기준 설계 단위), d: 가로획이 뻗는 쪽 (-1 왼쪽 = 보통 ㄱ, +1 오른쪽)
  function makeNode(parent, type, d, x, y, s, start) {
    return {
      parent, gen: parent ? parent.gen + 1 : 0, type, d, x, y, s,
      start, end: Infinity, children: [], shade: 0, dropped: false,
    };
  }

  const root = makeNode(null, 'ㄱ', -1, 0, 0, ROOT, performance.now() + 250);
  let gen = 0;
  let stage = 'grow';   // 'grow' | 'falling'
  let growEnd = 0;
  let touched = false;
  let breathFrom = 0;   // 이 시각부터 맨 아래 ㄱ 이 서서히 숨 쉬기 시작
  let fallTimer = 0;

  // 오각형 첫 화면이 떠 있는 동안에는 나무가 반응하지 않음
  const treeOn = () => document.body.dataset.view !== 'penta';

  const each = (n, fn) => { fn(n); n.children.forEach((c) => each(c, fn)); };

  function life(n, now) {
    const g = clamp01((now - n.start) / GROW);
    return n.end === Infinity ? g : Math.min(g, 1 - clamp01((now - n.end) / SHRINK));
  }

  function box(type, d, x, y, s) {
    const a = (-T / 2) * s;
    const b = reach(type) * s;
    return d > 0
      ? { x0: x + a, x1: x + b, y0: y - s, y1: y }
      : { x0: x - b, x1: x - a, y0: y - s, y1: y };
  }

  // 다른 글자와 겹치지 않는 자리인지 (얹힐 부모 글자는 빼고)
  function free(b, parent, margin) {
    let ok = true;
    each(root, (n) => {
      if (!ok || n === parent) return;
      const o = box(n.type, n.d, n.x, n.y, n.s);
      if (b.x0 - margin < o.x1 && b.x1 + margin > o.x0 && b.y0 - margin < o.y1 && b.y1 + margin > o.y0) ok = false;
    });
    return ok;
  }

  /* ---------- 누를 때마다: 가지 끝 글자의 가로획 위에 새 글자 ---------- */
  function grow(now, bias) {
    const parents = [];
    each(root, (n) => { if (n.gen === gen) parents.push(n); });
    const next = gen + 1;
    const crowd = parents.length;
    let k = 0, kk = 0;

    for (const p of parents) {
      const s = p.s * RATIO;
      const half = (T * RATIO) / 2; // 새 글자 세로획의 반 굵기 (부모 글자 단위)
      // 자식 하나마다 [가로획 위 자리 u, 향하는 쪽 f] 후보를 순서대로 시도
      let slots;
      if (p.type === 'ㄲ') {
        // 두 갈래: 바깥 ㄱ 위엔 바깥쪽으로, 안쪽 ㄱ 위엔 반대쪽으로
        slots = [
          [{ u: KK_ARM2 - half, f: p.d }, { u: KK_ARM2 - half, f: -p.d }],
          [{ u: KK_ARM1 / 2, f: -p.d }, { u: KK_ARM1 / 2, f: p.d }],
        ];
      } else {
        // 한 갈래: 가로획 끝에서, 누른 쪽으로 향하기 쉽게
        const f = rand() < 0.5 + 0.4 * bias ? 1 : -1;
        slots = [[
          { u: ARM - half, f }, { u: ARM - half, f: -f },
          { u: ARM / 2, f }, { u: ARM / 2, f: -f },
        ]];
      }

      for (const options of slots) {
        // 아래쪽은 ㄲ 으로 갈라져 뼈대를 만들고, 위로 갈수록 ㅋ 이 무성해짐. 맨 끝 세대는 모두 ㅋ
        let pFork = FORK[next];
        if (next < MAX_GEN) {
          if (p.type === 'ㅋ') pFork += 0.1;
          if (crowd <= 2 && next >= 2) pFork = Math.max(pFork, 0.95);
          if (crowd >= 12) pFork = Math.min(pFork, 0.3);
        }
        const type = rand() < pFork ? 'ㄲ' : 'ㅋ';

        for (const o of options) {
          const x = p.x + p.d * o.u * p.s;
          const y = p.y - p.s;
          if (!free(box(type, o.f, x, y, s), p, s * 0.1)) continue;
          const start = Math.max(now, p.start + GROW * 0.95) + rand() * 140;
          p.children.push(makeNode(p, type, o.f, x, y, s, start));
          growEnd = Math.max(growEnd, start + GROW);
          if (type === 'ㅋ') k++; else kk++;
          break;
        }
      }
    }

    if (!k && !kk) return false;
    gen = next;
    const parts = [];
    if (k) parts.push(`ㅋ ${k}개`);
    if (kk) parts.push(`ㄲ ${kk}개`);
    live.textContent = `${parts.join(', ')}가 돋아났습니다.`;
    return true;
  }

  /* ---------- 다 자란 뒤: 끝 글자는 낙엽처럼 떨어지고, 나머지는 끝에서부터 시들어 ㄱ 으로 ---------- */
  const leaves = [];

  function fall(now) {
    stage = 'falling';
    // 낙엽은 ㅋ 만. 중간에 멈춘 ㄲ 끝가지는 떨어지지 않고 나머지와 함께 시들어 들어감
    each(root, (n) => {
      if (!n.parent || n.children.length || n.type !== 'ㅋ') return;
      const size = n.s * V.U;
      const cu = (reach(n.type) - T / 2) / 2; // 글자 가운데 (회전 축)
      const ax = V.ox + n.x * V.U;
      const ay = V.oy + n.y * V.U;
      leaves.push({
        type: n.type, d: n.d, size, cu, color: color(n.shade),
        x: ax + n.d * cu * size,
        y: ay - 0.5 * size,
        vx: (rand() - 0.5) * 0.03 * base,
        vt: (0.08 + rand() * 0.07) * base,
        amp: (0.03 + rand() * 0.05) * base,
        fq: 0.0012 + rand() * 0.0014,
        ph: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 0.0012,
        born: now + rand() * 400,
      });
      n.dropped = true;
    });

    const DELAY = 500;
    each(root, (n) => {
      if (n.parent && !n.dropped) n.end = now + DELAY + (gen - n.gen) * 120 + rand() * 80;
    });
    fallTimer = setTimeout(() => {
      root.children = [];
      gen = 0;
      stage = 'grow';
    }, DELAY + gen * 120 + 80 + SHRINK + 60);
    live.textContent = '끝의 ㅋ 들이 낙엽처럼 떨어지고 다시 ㄱ 으로 돌아갑니다.';
  }

  function advance(bias) {
    const now = performance.now();
    if (!treeOn() || stage === 'falling') return;
    touched = true;
    if (gen < MAX_GEN && grow(now, bias)) return;
    if (now < growEnd) return; // 아직 자라는 중
    fall(now);
  }

  window.addEventListener('click', (e) => {
    advance(Math.max(-1, Math.min(1, (e.clientX - W / 2) / (W * 0.3))));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (!treeOn() || e.target.closest?.('button, a, [role="button"]')) return; // 버튼 누르기는 그대로 둠
    e.preventDefault();
    advance(0);
  });

  /* ---------- 글자 그리기 (현재 좌표계: 글자 크기 1, +x 가 가로획 쪽) ---------- */
  // p: 0 → 1 자람. ov: 부모 가로획 속으로 살짝 내려 이음새가 안 보이게
  function drawLetter(type, p, ov) {
    const vT = easeOut(seg(p, 0, 0.42));
    if (vT <= 0) return;
    const aT = easeOut(seg(p, 0.4, 0.7));
    const xT = type === 'ㄲ' ? easeInOut(seg(p, 0.7, 1)) : easeOut(seg(p, 0.7, 1));

    // 세로획: 아래에서 위로 솟음
    ctx.fillRect(-T / 2, -vT, T, vT + ov);
    // 가로획: 꺾이는 곳에서 바깥으로 뻗음
    if (aT > 0) {
      const end = type === 'ㄲ' ? lerp(ARM, KK_ARM1, xT) : ARM;
      ctx.fillRect(-T / 2, -1, (end + T / 2) * aT, T);
    }
    // ㅋ: 세로획에서 가운데 획이 하나 더 돋아남 (가획)
    if (type === 'ㅋ' && xT > 0) ctx.fillRect(0, MID - T / 2, MID_END * xT, T);
    // ㄲ: 다 그려진 ㄱ 에서 하나가 옆으로 갈라져 나옴 (병서)
    if (type === 'ㄲ' && xT > 0) {
      const vx = lerp(0, KK_V2, xT);
      ctx.fillRect(vx - T / 2, -1, T, 1 + ov);
      const end = lerp(ARM, KK_ARM2, xT);
      ctx.fillRect(vx - T / 2, -1, end - vx + T / 2, T);
    }
  }

  /* ---------- 화면 맞추기: 나무가 커지면 부드럽게 물러나고 가운데로 ---------- */
  const rootCenter = () => { const b = box(root.type, root.d, 0, 0, ROOT); return (b.x0 + b.x1) / 2; };
  const groundY = () => H - Math.max(40, H * 0.08);
  let zoom = 1;
  let panX = rootCenter();
  let V = { U: base, ox: W / 2 - panX * base, oy: groundY() };

  function view(dt) {
    let x0 = Infinity, x1 = -Infinity, top = 0;
    each(root, (n) => {
      const b = box(n.type, n.d, n.x, n.y, n.s);
      if (b.x0 < x0) x0 = b.x0;
      if (b.x1 > x1) x1 = b.x1;
      if (b.y0 < top) top = b.y0;
    });
    const oy = groundY();
    const target = Math.max(0.25, Math.min(1, (oy - 32) / (-top * base), (W - 48) / ((x1 - x0) * base)));
    const k = reduce ? 1 : 1 - Math.exp(-dt / 350); // 프레임 간격이 들쭉날쭉해도 같은 빠르기로 따라감
    zoom += (target - zoom) * k;
    panX += ((x0 + x1) / 2 - panX) * k;
    const U = base * zoom;
    V = { U, ox: W / 2 - panX * U, oy };
  }

  function drawNode(n, now) {
    if (n.dropped) return;
    const p = life(n, now);
    if (p <= 0) return;
    let size = n.s * V.U;
    if (!n.parent && !touched && !reduce) {
      size *= 1 + 0.02 * clamp01((now - breathFrom) / 1000) * Math.sin(now * 0.004); // 누르기 전엔 숨 쉬듯
    }
    ctx.save();
    ctx.translate(V.ox + n.x * V.U, V.oy + n.y * V.U);
    ctx.scale(n.d * size, size);
    ctx.fillStyle = color(n.shade);
    drawLetter(n.type, p, n.parent ? 0.06 : 0);
    ctx.restore();
  }

  // 떨어진 뒤 흐른 시간만으로 자리를 계산 (프레임이 끊겨도 같은 궤적)
  const LEAF_TAU = 500; // 이 시간쯤 지나면 거의 최고 속도
  function drawLeaves(now) {
    for (let i = leaves.length - 1; i >= 0; i--) {
      const q = leaves[i];
      const age = Math.max(0, now - q.born);
      const x = q.x + q.vx * age + (q.amp / q.fq) * (Math.cos(q.ph) - Math.cos(age * q.fq + q.ph));
      const y = q.y + q.vt * (age - LEAF_TAU * (1 - Math.exp(-age / LEAF_TAU)));
      const rot = (Math.sin(age * q.fq + q.ph) - Math.sin(q.ph)) * 0.45 + age * q.spin;
      const fade = 1 - clamp01((y - (V.oy - 30)) / 70);
      if (fade <= 0) { leaves.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(q.d * q.size, q.size);
      ctx.translate(-q.cu, 0.5);
      ctx.fillStyle = q.color;
      drawLetter(q.type, 1, 0);
      ctx.restore();
    }
  }

  /* ---------- 오각형 첫 화면(js/penta.js)과 주고받는 것 ---------- */
  window.hangulTree = {
    // 지금 그려진 맨 아래 ㄱ: 세로획 아래 가운데 (x, y), 글자 크기 s(px), 옅어진 정도 shade
    rootGlyph: () => ({ x: V.ox, y: V.oy, s: ROOT * V.U, shade: root.shade }),
    color,
    // 나무를 ㄱ 하나로 되돌리고 화면도 처음 자리로 (그리는 애니메이션 없이 바로)
    reset() {
      clearTimeout(fallTimer);
      root.children = [];
      root.end = Infinity;
      root.start = Math.min(root.start, performance.now() - GROW);
      root.shade = 0;
      gen = 0;
      stage = 'grow';
      growEnd = 0;
      leaves.length = 0;
      touched = false;
      breathFrom = performance.now() + 900; // 날아온 ㄱ 이 내려앉은 뒤부터 숨 쉬기
      zoom = 1;
      panX = rootCenter();
      V = { U: base, ox: W / 2 - panX * base, oy: groundY() };
      live.textContent = '';
    },
  };

  /* ---------- 매 프레임 ---------- */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.max(0, now - lastT);
    lastT = now;
    view(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 끝 가지부터 그려서, 부모 가로획이 이음새를 덮게
    const all = [];
    const ks = 1 - Math.exp(-dt / 500);
    each(root, (n) => {
      const target = Math.min(0.6, (gen - n.gen) * 0.1);
      n.shade += (target - n.shade) * ks;
      all.push(n);
    });
    all.sort((a, b) => b.gen - a.gen).forEach((n) => drawNode(n, now));
    drawLeaves(now);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
