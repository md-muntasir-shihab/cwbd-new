# Phase 3: Contact & Help Center - Quick Reference & Execution Guide

---

## Quick Start Guide

### Pages Under Test
1. **Contact Page** - `/contact`
2. **Help Center Page** - `/help-center`

### Prerequisites
- ✅ Frontend running on `http://localhost:5175`
- ✅ Backend API accessible and running
- ⏳ Contact settings configured in backend
- ⏳ Help Center articles created in backend

---

## Page Checklist - Contact Page

### ✅ Form Fields
- [x] Full Name (text input)
- [x] Phone (text input)
- [x] Email (email input)
- [x] Subject (text input)
- [x] Message (textarea)
- [x] Consent (checkbox)
- [x] Submit button

### ✅ Validation Rules
- [x] Name: Required, non-empty
- [x] Phone: Required, non-empty
- [x] Email: Required + valid format
- [x] Subject: Required, non-empty
- [x] Message: Required, min 20 characters
- [x] Consent: Must be checked

### ✅ Features
- [x] Real-time error clearing
- [x] Field-specific error messages
- [x] Pre-fill via URL parameters
- [x] Topic auto-fill (password-reset)
- [x] Quick action cards (WhatsApp, Messenger, Phone, Email)
- [x] Social media links
- [x] Mock mode support
- [x] Toast notifications
- [x] Loading states
- [x] Success ticket display

### ✅ Design
- [x] Responsive (desktop & mobile)
- [x] Dark mode support
- [x] Light mode support
- [x] Keyboard accessible
- [x] Touch-friendly on mobile
- [x] Proper color contrast
- [x] Semantic HTML

### ✅ Accessibility
- [x] Keyboard navigation
- [x] Focus management
- [x] Label associations
- [x] Screen reader friendly
- [x] Error messages descriptive
- [x] ARIA labels present

---

## Page Checklist - Help Center Page

### ✅ Features
- [x] Article listing
- [x] Category grouping
- [x] Real-time search
- [x] Minimum 2-char search
- [x] Dynamic result count
- [x] Loading indicator
- [x] Error handling
- [x] Empty states
- [x] Article links (slug-based)

### ✅ UI Components
- [x] Header with icon
- [x] Search input
- [x] Article cards
- [x] Category sections
- [x] Description preview
- [x] Hover effects
- [x] Link styling

### ✅ Responsive
- [x] Desktop: 2-column grid
- [x] Mobile: 1-column grid
- [x] Full-width elements
- [x] Proper spacing
- [x] Touch-friendly

### ✅ Theme Support
- [x] Dark mode
- [x] Light mode
- [x] Color contrast
- [x] Professional appearance

### ✅ Accessibility
- [x] Search label (sr-only)
- [x] Keyboard navigation
- [x] Link text descriptive
- [x] No keyboard traps
- [x] Semantic HTML

---

## Testing Matrix Quick Reference

### Contact Page Testing

**Desktop (1280x900)**
```
Dark Mode:
- [ ] Form displays correctly
- [ ] All fields visible
- [ ] Quick cards visible
- [ ] Social links visible
- [ ] Colors correct
- [ ] No overflow

Light Mode:
- [ ] Form displays correctly
- [ ] All fields visible
- [ ] White backgrounds
- [ ] Dark text readable
- [ ] Colors correct
- [ ] No overflow
```

**Mobile (375x667)**
```
Dark Mode:
- [ ] Form stacks vertically
- [ ] Full-width fields
- [ ] Submit button visible
- [ ] Cards stack
- [ ] No horizontal overflow
- [ ] Touch-friendly sizes

Light Mode:
- [ ] Form stacks vertically
- [ ] Full-width fields
- [ ] Submit button visible
- [ ] Light backgrounds
- [ ] Dark text readable
- [ ] No overflow
```

### Help Center Testing

**Desktop (1280x900)**
```
Dark Mode:
- [ ] Header visible
- [ ] Search bar visible
- [ ] 2-column article grid
- [ ] All articles visible
- [ ] Colors correct
- [ ] No overflow

Light Mode:
- [ ] Header visible
- [ ] Search bar visible
- [ ] 2-column article grid
- [ ] White backgrounds
- [ ] Dark text readable
- [ ] No overflow
```

**Mobile (375x667)**
```
Dark Mode:
- [ ] Header visible
- [ ] Search bar full-width
- [ ] 1-column article grid
- [ ] Articles stack vertically
- [ ] No horizontal overflow
- [ ] Touch-friendly cards

Light Mode:
- [ ] Header visible
- [ ] Search bar full-width
- [ ] 1-column article grid
- [ ] Light backgrounds
- [ ] Dark text readable
- [ ] No overflow
```

---

## Form Validation Test Cases

### Test Case 1: Empty Submit
```
Action: Click submit with empty form
Expected: All errors show
✅ "Full name is required."
✅ "Phone is required."
✅ "Email is required."
✅ "Subject is required."
✅ "Message is required."
✅ "Consent is required."
```

### Test Case 2: Invalid Email
```
Action: Enter "notanemail" in email field, submit
Expected: Error "Enter a valid email address."
✅ Email field shows error
✅ Submit prevented
```

### Test Case 3: Short Message
```
Action: Enter 10 characters in message field, submit
Expected: Error "Message must be at least 20 characters."
✅ Message field shows error
✅ Submit prevented
```

### Test Case 4: Missing Consent
```
Action: Leave consent unchecked, submit
Expected: Error "Consent is required."
✅ Checkbox shows error
✅ Submit prevented
```

### Test Case 5: Valid Submit
```
Action: Fill all fields correctly, submit
Expected: Success message with ticket ID
✅ Toast notification appears
✅ Ticket ID displayed
✅ Form resets or shows success state
```

---

## Search Testing - Help Center

### Test Case 1: Minimum Characters
```
Action: Type 1 character in search
Expected: No search triggered
Status: ✅ Search requires 2+ chars
```

### Test Case 2: Valid Search
```
Action: Type 2+ characters in search
Expected: Results update in real-time
Status: ✅ Dynamic result count shows
```

### Test Case 3: No Results
```
Action: Search for non-existent term
Expected: "No help articles found."
Status: ✅ Empty state displays
```

### Test Case 4: Clear Search
```
Action: Clear search input
Expected: All articles show again
Status: ✅ Results reset to default
```

---

## Keyboard Navigation Testing

### Contact Form
```
Tab Flow:
1. [ ] Name field
2. [ ] Phone field
3. [ ] Email field
4. [ ] Subject field
5. [ ] Message field
6. [ ] Consent checkbox
7. [ ] Submit button

Focus Visibility: ✅ Outline visible on all elements
Reverse Tab: ✅ Shift+Tab works backward
Checkbox: ✅ Space toggles consent
Submit: ✅ Enter submits form
```

### Help Center
```
Tab Flow:
1. [ ] Search input
2. [ ] Article 1
3. [ ] Article 2
... (all articles)

Focus Visibility: ✅ Outline visible on all
Link Activation: ✅ Enter activates links
No Traps: ✅ Can tab out of all elements
```

---

## Theme Toggle Testing

### Dark Mode
```
Colors:
- [ ] Background: Very dark (slate-900)
- [ ] Text: White/light
- [ ] Borders: Dark gray (slate-700)
- [ ] Inputs: Very dark (slate-800)
- [ ] Accent: Blue/indigo

Readability:
- [ ] All text readable
- [ ] Sufficient contrast (WCAG AA)
- [ ] No harsh white areas
- [ ] Professional appearance
```

### Light Mode
```
Colors:
- [ ] Background: White/very light
- [ ] Text: Dark/black
- [ ] Borders: Light gray
- [ ] Inputs: White
- [ ] Accent: Blue/indigo

Readability:
- [ ] All text readable
- [ ] Sufficient contrast (WCAG AA)
- [ ] Clean appearance
- [ ] Professional look
```

---

## Responsive Design Testing

### Breakpoints to Test
```
Desktop:    1920, 1440, 1280, 1024
Tablet:     768, 512
Mobile:     430, 390, 375, 360
```

### Contact Page - Responsive Checks
```
Desktop (1280+):
- [ ] All elements fit
- [ ] No horizontal scroll
- [ ] Optimal layout
- [ ] Professional appearance

Tablet (512-768):
- [ ] Elements adjust properly
- [ ] Touch targets adequate
- [ ] No overflow
- [ ] Readable text

Mobile (375-430):
- [ ] Single column layout
- [ ] Full-width elements
- [ ] Touch targets minimum 44px
- [ ] No horizontal scroll
```

### Help Center - Responsive Checks
```
Desktop (1280+):
- [ ] 2-column article grid
- [ ] Full-width search
- [ ] All articles visible
- [ ] No scroll

Tablet (512-768):
- [ ] 2-column or 1-column grid
- [ ] Full-width search
- [ ] Articles fit properly
- [ ] Touch-friendly

Mobile (375-430):
- [ ] 1-column article grid
- [ ] Full-width search
- [ ] Articles stack
- [ ] Touch targets adequate
```

---

## Accessibility Quick Check

### WCAG AA Compliance
```
✅ Color Contrast
   - Text: 4.5:1 minimum
   - Large text: 3:1 minimum
   - Links: Distinguishable

✅ Keyboard Navigation
   - All interactive elements tab-able
   - Tab order logical
   - Focus visible
   - No keyboard traps

✅ Screen Reader
   - Labels associated with inputs
   - Form structure semantic
   - Error messages clear
   - ARIA labels present

✅ Motion
   - No auto-playing content
   - Animations smooth
   - Can be disabled via prefers-reduced-motion
```

---

## Performance Baseline

```
Page Load:      < 3 seconds
First Paint:    < 1 second
Form Submit:    < 2 seconds
Search Update:  < 1 second

No:
- [ ] Jank or stuttering
- [ ] Layout shifts
- [ ] Slow animations
- [ ] Frozen UI
```

---

## Browser Support

Test on:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

---

## Known Issues & Workarounds

### Issue: Pages redirect to Student Portal
**Cause:** Backend API not responding or auth middleware
**Workaround:** 
1. Ensure backend is running
2. Check CORS configuration
3. Enable mock mode: `VITE_USE_MOCK_API=true`

### Issue: Forms not submitting
**Cause:** API endpoint unavailable
**Workaround:**
1. Verify backend `/api/v1/contact/messages` endpoint
2. Check CORS headers
3. Verify request payload format

### Issue: Help articles not showing
**Cause:** API not returning data
**Workaround:**
1. Ensure articles exist in backend
2. Check `/api/v1/help-center/public` endpoint
3. Verify response format

---

## Testing Checklist - Complete

### Pre-Testing
- [ ] Frontend running on localhost:5175
- [ ] Backend running
- [ ] Contact settings configured
- [ ] Help articles created
- [ ] Mock mode ready (fallback)
- [ ] Test browsers available
- [ ] Test devices available

### Contact Page Testing
- [ ] Desktop Dark Mode - PASS/FAIL
- [ ] Desktop Light Mode - PASS/FAIL
- [ ] Mobile Dark Mode - PASS/FAIL
- [ ] Mobile Light Mode - PASS/FAIL
- [ ] Form validation - PASS/FAIL
- [ ] Keyboard navigation - PASS/FAIL
- [ ] Accessibility - PASS/FAIL
- [ ] Responsiveness - PASS/FAIL
- [ ] Theme toggle - PASS/FAIL

### Help Center Testing
- [ ] Desktop Dark Mode - PASS/FAIL
- [ ] Desktop Light Mode - PASS/FAIL
- [ ] Mobile Dark Mode - PASS/FAIL
- [ ] Mobile Light Mode - PASS/FAIL
- [ ] Search functionality - PASS/FAIL
- [ ] Category display - PASS/FAIL
- [ ] Article links - PASS/FAIL
- [ ] Keyboard navigation - PASS/FAIL
- [ ] Accessibility - PASS/FAIL
- [ ] Responsiveness - PASS/FAIL

### Cross-Browser Testing
- [ ] Chrome - PASS/FAIL
- [ ] Firefox - PASS/FAIL
- [ ] Safari - PASS/FAIL
- [ ] Edge - PASS/FAIL
- [ ] Mobile Chrome - PASS/FAIL
- [ ] Mobile Safari - PASS/FAIL

### Final Sign-Off
- [ ] All tests completed
- [ ] Issues documented
- [ ] Screenshots captured
- [ ] Report generated
- [ ] Ready for deployment: YES/NO

---

## Quick Commands

### Enable Mock Mode (Development)
```bash
VITE_USE_MOCK_API=true npm run dev
```

### Run Frontend
```bash
cd frontend
npm install
npm run dev
```

### Run Backend
```bash
cd backend
npm install
npm run dev
```

### Test Contact Page
- Navigate to: `http://localhost:5175/contact`
- Or: `/contact?email=test@example.com`
- Or: `/contact?topic=password-reset`

### Test Help Center Page
- Navigate to: `http://localhost:5175/help-center`
- Search: Type in search box (2+ characters)

---

## Documentation Generated

✅ **phase3-contact-help-test-report.md** - Comprehensive test report
✅ **phase3-contact-help-testing-summary.md** - Testing summary
✅ **phase3-visual-testing-matrix.md** - Visual test matrix
✅ **phase3-contact-help-quick-reference.md** - This document

---

## Next Steps

1. **Setup Phase:**
   - Ensure backend running
   - Configure contact settings
   - Add help articles
   - Enable mock mode (fallback)

2. **Testing Phase:**
   - Execute test matrix
   - Capture screenshots
   - Document issues
   - Verify accessibility

3. **Review Phase:**
   - Review test results
   - Address issues
   - Re-test fixes
   - Get sign-off

4. **Deployment Phase:**
   - Deploy to staging
   - Final testing
   - Deploy to production
   - Monitor for issues

---

**Document Version:** 1.0
**Last Updated:** 2024
**Status:** ✅ Complete and Ready for Testing
