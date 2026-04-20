# Manual Testing Checklist: Auth Session Persistence

This checklist documents manual test scenarios for verifying the auth session persistence feature. Each scenario should be performed by a human tester in a real browser environment.

## Prerequisites

- A valid student account with credentials
- A valid OAuth-linked student account (Google)
- Access to the CampusWay frontend running against a live backend
- Browser DevTools available for inspecting localStorage and network requests
- An active exam available for the test student

---

## Scenario 1: Dashboard Session Persistence on Refresh

**Steps:**
1. Open the student login page (`/login`)
2. Log in with valid student credentials
3. Verify redirect to `/dashboard`
4. Confirm the dashboard content renders correctly
5. Press F5 or Ctrl+R to refresh the page

**Expected Outcome:**
- [ ] After refresh, the student remains on `/dashboard`
- [ ] No redirect to `/login` occurs
- [ ] Dashboard content renders without interruption
- [ ] A brief loading spinner may appear during session bootstrap, then content loads
- [ ] `localStorage` contains `campusway-auth-session-hint` with `portal: "student"`

---

## Scenario 2: Exam Session Persistence on Refresh

**Steps:**
1. Log in as a student
2. Navigate to `/exams` and select an available exam
3. Start the exam (navigate to `/exam/:examId`)
4. Confirm the exam runner loads and displays questions
5. Answer at least one question
6. Press F5 or Ctrl+R to refresh the page

**Expected Outcome:**
- [ ] After refresh, the student remains on the exam page
- [ ] No redirect to `/login` occurs
- [ ] The exam runner reloads and restores progress
- [ ] Previously answered questions retain their selections
- [ ] The exam timer continues from the correct position

---

## Scenario 3: No Re-Login Prompt When Navigating to Exam

**Steps:**
1. Log in as a student
2. Navigate to `/dashboard`
3. Click a link or navigate to `/exams`
4. Select an exam and navigate to `/exam/:examId`

**Expected Outcome:**
- [ ] No login page is shown at any point during navigation
- [ ] The exam runner loads directly without authentication prompts
- [ ] Network tab shows no 401 responses during navigation
- [ ] The access token is present in API request headers

---

## Scenario 4: Direct Navigation to Exam URL (Bookmark)

**Steps:**
1. Log in as a student in one tab
2. Copy the URL of an active exam (e.g., `/exam/abc123`)
3. Open a new browser tab
4. Paste the exam URL directly into the address bar and press Enter

**Expected Outcome:**
- [ ] A loading spinner appears briefly (session bootstrap in progress)
- [ ] The session is restored via the refresh token cookie
- [ ] The exam runner loads successfully without redirecting to login
- [ ] If the session has expired, the student is redirected to `/login?returnTo=/exam/abc123`
- [ ] After re-login with `returnTo`, the student is redirected back to the exam

---

## Scenario 5: Force Logout During Exam

**Steps:**
1. Log in as a student
2. Navigate to an active exam and start answering questions
3. Answer at least 2-3 questions to create progress
4. Simulate a force logout by either:
   - Revoking the session from the admin panel (another browser/tab)
   - Or manually dispatching: `window.dispatchEvent(new CustomEvent('campusway:force-logout', { detail: { reason: 'SESSION_INVALIDATED' } }))`
5. Observe the behavior

**Expected Outcome:**
- [ ] A Force Logout modal appears with the message: "Your session was terminated from another device or by an administrator."
- [ ] The modal is displayed before any redirect occurs
- [ ] `localStorage` contains `cw_exam_force_logout_preserved` with the exam progress data
- [ ] After dismissing the modal, the student is redirected to the login page
- [ ] After re-login and navigating back to the same exam, progress is restored

---

## Scenario 6: Token Expiry During Exam (Proactive Refresh)

**Steps:**
1. Log in as a student
2. Navigate to an active exam
3. Open DevTools → Network tab
4. Wait for the proactive token refresh to fire (approximately 75% of token lifetime, ~11-15 minutes for a 15-20 min token)
5. Continue interacting with the exam during this period

**Expected Outcome:**
- [ ] A `POST /auth/refresh` request is visible in the Network tab before the token expires
- [ ] No 401 responses appear during the exam session
- [ ] The exam continues without interruption
- [ ] The student is never redirected to login during the exam
- [ ] Multiple proactive refreshes occur if the exam lasts longer than one token lifetime

**Alternative verification (shorter wait):**
1. Temporarily configure the backend to issue tokens with a 2-minute TTL
2. Start an exam and observe that a refresh fires at ~90 seconds
3. Confirm no 401 errors and no interruption

---

## Scenario 7: OAuth Login Session Persistence

**Steps:**
1. Navigate to the student login page
2. Click "Sign in with Google" (or other OAuth provider)
3. Complete the OAuth flow
4. Verify redirect to `/dashboard`
5. Confirm `localStorage` contains `campusway-auth-session-hint` with `portal: "student"`
6. Press F5 or Ctrl+R to refresh the page

**Expected Outcome:**
- [ ] After refresh, the student remains authenticated
- [ ] No redirect to `/login` occurs
- [ ] The session is restored via the refresh token cookie (same as password login)
- [ ] `campusway-auth-session-hint` persists with correct portal value
- [ ] Navigating to `/exams` or `/exam/:examId` works without re-login

---

## Additional Edge Cases

### Browser Tab Restore
- [ ] Close the browser entirely, reopen, and navigate to a protected route → session restores if refresh token is still valid

### Multiple Tabs
- [ ] Open the app in multiple tabs → force logout in one tab → other tabs show force logout modal on next API call

### Slow Network
- [ ] Throttle network to Slow 3G → refresh a protected page → loading spinner shows, no premature redirect to login

### localStorage Cleared
- [ ] Clear `campusway-auth-session-hint` from localStorage manually → refresh a protected page → bootstrap still attempts (path-based fallback) → session restores if refresh cookie is valid

---

## Sign-Off

| Scenario | Tester | Date | Pass/Fail | Notes |
|----------|--------|------|-----------|-------|
| 1. Dashboard refresh | | | | |
| 2. Exam refresh | | | | |
| 3. No re-login on exam nav | | | | |
| 4. Direct exam URL | | | | |
| 5. Force logout during exam | | | | |
| 6. Proactive token refresh | | | | |
| 7. OAuth session persistence | | | | |
