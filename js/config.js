// ============================================================
// js/config.js  — Supabase 연결 설정
// ============================================================
// ⚠️  Step 1: 아래 두 값을 Supabase 대시보드 > Settings > API 에서 복사
const SUPABASE_URL  = 'https://xqqrxmxjvvzxcfxmqfks.supabase.co';
const SUPABASE_ANON = 'sb_publishable_M6XoN8lfV6_KEZ72yQ8OQQ_8tqo_nx2';

// Supabase 클라이언트 초기화
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// 공통 유틸
// ============================================================
const won  = n => n != null ? Number(n).toLocaleString('ko-KR') + '원' : '-';
const pct  = (n, d=1) => n != null ? (Number(n)>=0?'+':'')+Number(n).toFixed(d)+'%' : '-';
const rCls = n => n == null ? '' : Number(n) >= 0 ? 'up' : 'dn';
const avCls = ['av1','av2','av3','av4'];

function toast(msg, ms=2500) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ============================================================
// DB 연결 상태 확인 — 페이지 상단에 배너로 표시
// ============================================================
async function checkDBConnection() {
  const banner = document.getElementById('db-banner');
  if (!banner) return;

  // 플레이스홀더 값이면 바로 안내
  if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    banner.className = 'db-banner error';
    banner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#a32d2d" stroke-width="1.2"/>
        <line x1="7" y1="4" x2="7" y2="7.5" stroke="#a32d2d" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="7" cy="10" r="0.8" fill="#a32d2d"/>
      </svg>
      <span>
        <strong>DB 미연결</strong> — js/config.js에서 SUPABASE_URL과 SUPABASE_ANON을 실제 값으로 교체하세요.
        &nbsp;<a href="https://supabase.com/dashboard" target="_blank" style="color:var(--up);text-decoration:underline;">Supabase 열기 →</a>
      </span>`;
    return;
  }

  // 실제 연결 테스트 (members 테이블 조회)
  banner.className = 'db-banner pending';
  banner.textContent = 'DB 연결 확인 중...';

  try {
    const { error } = await sb.from('members').select('id').limit(1);
    if (error) throw error;
    banner.className = 'db-banner ok';
    banner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#0f6e56" stroke-width="1.2"/>
        <polyline points="4,7 6.2,9.2 10,5" stroke="#0f6e56" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>DB 연결됨 · Supabase 정상</span>`;
    // 연결 성공하면 3초 후 배너 숨김
    setTimeout(() => { banner.style.display = 'none'; }, 3000);
  } catch(e) {
    banner.className = 'db-banner error';
    banner.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#a32d2d" stroke-width="1.2"/>
        <line x1="7" y1="4" x2="7" y2="7.5" stroke="#a32d2d" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="7" cy="10" r="0.8" fill="#a32d2d"/>
      </svg>
      <span><strong>DB 연결 실패</strong> — ${e.message}
      &nbsp;<a href="https://supabase.com/dashboard" target="_blank" style="color:var(--up);text-decoration:underline;">Supabase 확인 →</a></span>`;
  }
}

// ============================================================
// 인증
// ============================================================
async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) showAuthOverlay();
  return session;
}

function showAuthOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-box">
      <div class="auth-title">투자 스터디 로그인</div>
      <div class="form-section">
        <div class="form-group">
          <label>이메일</label>
          <input type="email" id="auth-email" placeholder="example@email.com" />
        </div>
        <div class="form-group">
          <label>비밀번호</label>
          <input type="password" id="auth-pw" placeholder="비밀번호" onkeydown="if(event.key==='Enter')doLogin()" />
        </div>
        <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">로그인</button>
        <div id="auth-err" style="font-size:12px;color:#a32d2d;text-align:center;min-height:16px;"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

async function doLogin() {
  const email = document.getElementById('auth-email')?.value;
  const pw    = document.getElementById('auth-pw')?.value;
  if (!email || !pw) { document.getElementById('auth-err').textContent = '이메일과 비밀번호를 입력하세요.'; return; }

  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    document.getElementById('auth-err').textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
  } else {
    document.getElementById('auth-overlay')?.remove();
    location.reload();
  }
}

async function doLogout() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

// ============================================================
// GitHub Actions 트리거 설정
// GH_PAT: GitHub Personal Access Token (workflow 권한 필요)
// GH_REPO: "GitHub아이디/저장소명" 형식 (예: "kjhofone/fund-study")
// ============================================================
// ⚠️  아래 두 값을 설정하세요
window.GH_PAT  = '';   // GitHub PAT (ghp_로 시작)
window.GH_REPO = 'kjhofone/sss';  // 예: kjhofone/fund-study
