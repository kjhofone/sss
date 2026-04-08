# 투자 스터디 펀드 관리 시스템

## 📁 파일 구조
```
fund-study/
├── index.html          ← 대시보드 (메인)
├── picks.html          ← 탑픽 제출 + 히스토리
├── trade.html          ← 매수/매도 입력
├── members.html        ← 참여자 현황 + 승률
├── settle.html         ← 결산 입력 (수익률 자동계산)
├── css/style.css       ← 공통 스타일
├── js/config.js        ← Supabase 연결 + 유틸
├── js/db.js            ← DB 쿼리 함수
└── supabase_schema.sql ← DB 테이블 설계 (최초 1회 실행)
```

---

## 🚀 세팅 순서

### STEP 1. Supabase 프로젝트 생성
1. https://supabase.com 접속 → 회원가입 → New Project
2. 프로젝트 이름: `fund-study` (원하는 이름)
3. 데이터베이스 비밀번호 설정 후 Create Project
4. 생성 완료까지 약 1분 대기

### STEP 2. DB 테이블 생성
1. Supabase 대시보드 → 좌측 **SQL Editor**
2. `supabase_schema.sql` 전체 내용 붙여넣기
3. **Run** 클릭 → 테이블 4개 + 뷰 + 트리거 자동 생성

### STEP 3. API 키 복사
1. Supabase → Settings → API
2. **Project URL** 복사
3. **anon public** 키 복사
4. `js/config.js` 열어서 아래 두 줄 수정:
   ```js
   const SUPABASE_URL  = 'https://xxxxx.supabase.co';   // ← 여기
   const SUPABASE_ANON = 'eyJhbGciOiJ...';              // ← 여기
   ```

### STEP 4. 사용자 계정 생성
1. Supabase → Authentication → Users → **Invite user**
2. 참여자 이메일 입력 → 초대 메일 발송
3. 각자 비밀번호 설정 후 로그인 가능

### STEP 5. GitHub 업로드
1. https://github.com → New repository → `fund-study` (Public)
2. 파일 전체 업로드 (또는 git push)
3. Settings → Pages → Branch: main → Save
4. 약 2분 후 `https://[아이디].github.io/fund-study` 접속 가능

---

## 📊 기능 요약

| 페이지 | 기능 |
|---|---|
| 대시보드 | 총 자산, 평균 수익률, 탑픽 제출 현황, 알림 |
| 탑픽 관리 | 제출 폼, 월별 탭 조회, 전체 히스토리 필터 |
| 매수/매도 | 체결 입력, 예상 수익률 자동 계산 |
| 참여자 현황 | 카드별 승률, 누적 수익, 종목 히스토리 |
| 결산 관리 | 순손익 자동계산, 추가납입 알림, 기준금액 자동 업데이트 |

## 🔧 수식 자동 계산 항목 (Supabase 서버에서 처리)
- `settlements.net_profit` = gross_profit - tax_fee
- `settlements.return_rate` = net_profit / base_amount × 100
- `settlements.new_base_amount` = 손실 시 100만원 복구, 수익 시 복리 누적
- `members.base_amount` = 결산 후 자동 업데이트 (트리거)
