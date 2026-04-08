// ============================================================
// js/config.js  — Supabase 연결 설정
// ============================================================
// ⚠️  아래 두 값을 Supabase 대시보드 > Settings > API 에서 복사하세요
const SUPABASE_URL    = 'https://xqqrxmxjvvzxcfxmqfks.supabase.co';
const SUPABASE_ANON   = 'sb_publishable_M6XoN8lfV6_KEZ72yQ8OQQ_8tqo_nx2';

// Supabase 클라이언트 초기화 (CDN 버전 사용)
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// js/config.js 하단 — 공통 유틸
// ============================================================

/** 원화 포맷 */
const won = n => n != null ? Number(n).toLocaleString('ko-KR') + '원' : '-';

/** 수익률 포맷 */
const pct = (n, digits=1) => n != null
  ? (n >= 0 ? '+' : '') + Number(n).toFixed(digits) + '%'
  : '-';

/** 수익률 CSS 클래스 */
const rCls = n => n == null ? '' : n >= 0 ? 'up' : 'dn';

/** 아바타 클래스 (이름 순서 기반) */
const avCls = ['av1','av2','av3','av4'];

/** 토스트 메시지 */
function toast(msg, ms=2500) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

/** 현재 로그인 세션 반환 */
async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** 페이지 보호 — 로그인 안 됐으면 로그인 화면 표시 */
async function requireAuth() {
  const session = await getSession();
  if (!session) showAuthOverlay();
  return session;
}

/** 로그인 오버레이 표시 */
function showAuthOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
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
          <input type="password" id="auth-pw" placeholder="비밀번호" />
        </div>
        <button class="btn btn-primary" onclick="doLogin()">로그인</button>
        <div id="auth-err" style="font-size:12px;color:#a32d2d;text-align:center;"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function doLogin() {
  const email = document.getElementById('auth-email').value;
  const pw    = document.getElementById('auth-pw').value;
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    document.getElementById('auth-err').textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
  } else {
    document.querySelector('.auth-overlay')?.remove();
    location.reload();
  }
}
