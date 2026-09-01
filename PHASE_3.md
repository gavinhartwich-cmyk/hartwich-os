# Phase 3: Email Review → Send → Track

## ✅ What's Built

### Database Layer
- New `email_drafts` table to store pending-review emails
- Warmup tracking columns on `companies` table:
  - `warmupStatus`: not_started → warming_up → ready
  - `warmupStartedAt`: when warm-up began
  - `dailySendCount`: resets daily at midnight Winnipeg time
  - `lastSendResetAt`: tracks when counter was last reset
- New `emailDraftStatusEnum`: pending_review → approved → rejected → sent

### Multi-Account Gmail Integration
- `src/lib/integrations/gmail-multi.ts`
  - Supports 3 independent Gmail accounts
  - Round-robin account rotation
  - Reply detection across all 3 accounts
  - Functions: `sendEmailViaGmail()`, `getUnreadMessages()`, `getGmailMessage()`

### Warm-up Engine
- `src/lib/warmup/schedule.ts`
  - Phase 1 (Days 0-13): 5 emails/day max
  - Phase 2 (Day 14+): 20 emails/day max
  - Daily counter resets at midnight Winnipeg time
  - Validates: `canSendEmail()`, `isWarmupComplete()`

### API Routes
1. **POST `/api/emails/draft-for-review`** - Create draft email
2. **POST `/api/emails/approve-and-send`** - Send email with warm-up checks
3. **POST `/api/emails/reject`** - Reject draft
4. **GET `/api/emails/pending-review`** - List pending emails
5. **POST `/api/emails/sync-replies`** - Sync replies from all 3 accounts

### UI Components
- **Email Review Column** in pipeline board (left side, amber-colored)
- Shows pending emails with subject, preview, approve/reject buttons

## 🔧 Setup Required

### 1. Push Database Schema
```bash
npm run db:push
```

### 2. Set Gmail OAuth Tokens in .env.local
```
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret

GMAIL_ACCESS_TOKEN_1=token-1
GMAIL_REFRESH_TOKEN_1=refresh-1
GMAIL_FROM_ADDRESS_1=hartwichlabs@gmail.com

GMAIL_ACCESS_TOKEN_2=token-2
GMAIL_REFRESH_TOKEN_2=refresh-2
GMAIL_FROM_ADDRESS_2=hartwichlabs1@gmail.com

GMAIL_ACCESS_TOKEN_3=token-3
GMAIL_REFRESH_TOKEN_3=refresh-3
GMAIL_FROM_ADDRESS_3=hartwichlabs2@gmail.com
```

### 3. Fix User ID in Email Review Column
Edit `src/app/(app)/board/email-review-column.tsx` line 52 - replace placeholder with actual user ID from auth.

## 📋 Workflow

1. **Draft** → AI generates email → POST `/api/emails/draft-for-review`
2. **Review** → Email appears in "Email Review" column on pipeline board
3. **Approve** → POST `/api/emails/approve-and-send` → Sends from rotating Gmail account
4. **Reply** → Prospect replies → Auto-captured by sync job → Stage auto-updates

## 🔄 Warm-up Rules

- **Days 0-13**: 5 emails/day max
- **Day 14+**: 20 emails/day max
- Daily counter resets at midnight Winnipeg time
- Start warm-up on first send, auto-complete after 14 days

---

Ready to go! Run schema push and set env vars, then you're live.
