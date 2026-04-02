# Phase 3: Visual Testing Matrix - Contact & Help Center Pages

## Test Matrix Overview

This document outlines the complete visual testing matrix for Contact and Help Center pages across different devices, screen sizes, and themes.

---

## 1. TEST DEVICES & VIEWPORTS

### Desktop Environments
| Device Type | Resolution | Aspect Ratio | Notes |
|-------------|-----------|------------|-------|
| Desktop | 1280x900 | 16:10 | Primary testing size |
| Desktop | 1920x1080 | 16:9 | Large screens |
| Laptop | 1366x768 | 16:9 | Common laptop size |
| MacBook | 1440x900 | 16:10 | Apple users |

### Mobile Environments
| Device | Resolution | Aspect Ratio | Notes |
|--------|-----------|------------|-------|
| iPhone SE | 375x667 | 16:9 | Small phone |
| iPhone 12 | 390x844 | 19.5:9 | Medium phone |
| iPhone 14 Pro | 430x932 | 19.5:9 | Large phone |
| Galaxy S21 | 360x800 | 18:9 | Android baseline |
| Pixel 7 | 412x915 | 19.5:9 | Android large |

### Tablet Environments
| Device | Resolution | Aspect Ratio | Notes |
|--------|-----------|------------|-------|
| iPad | 768x1024 | 3:4 | Standard tablet |
| iPad Pro | 1024x1366 | 3:4 | Large tablet |
| Tab S7 | 800x1280 | 5:8 | Android tablet |

---

## 2. CONTACT PAGE - VISUAL TEST CASES

### 2.1 Desktop (1280x900) - Dark Mode

**Layout Verification:**
- [ ] Form heading visible at top
- [ ] Form fields displayed in order (Name, Phone, Email, Subject, Message)
- [ ] Consent checkbox visible
- [ ] Submit button below form
- [ ] Quick action cards displayed horizontally below form
- [ ] Social media grid visible at bottom
- [ ] No horizontal scrolling required
- [ ] All content fits within viewport

**Form Fields:**
- [ ] Name input field properly sized
- [ ] Phone input field properly sized
- [ ] Email input field properly sized
- [ ] Subject input field properly sized
- [ ] Message textarea large enough for typing
- [ ] All field labels visible and associated
- [ ] Placeholder text visible in all fields
- [ ] Focus borders visible when clicking fields

**Quick Action Cards:**
- [ ] 4 cards displayed (WhatsApp, Messenger, Phone, Email)
- [ ] Card icons visible
- [ ] Card titles readable
- [ ] Card descriptions readable
- [ ] Links are clickable (hover effects visible)
- [ ] Contact information displayed correctly

**Social Links:**
- [ ] Facebook link visible if configured
- [ ] Telegram link visible if configured
- [ ] Instagram link visible if configured
- [ ] WhatsApp link visible if configured
- [ ] Messenger link visible if configured
- [ ] Custom links display correctly

**Color & Theme:**
- [ ] Dark background (slate-900)
- [ ] White/light text readable
- [ ] Border colors appropriate (slate-700)
- [ ] Input backgrounds dark (slate-800)
- [ ] Accent colors visible (blue/indigo)
- [ ] Hover effects visible on buttons/links
- [ ] No color contrast issues
- [ ] All text readable

---

### 2.2 Desktop (1280x900) - Light Mode

**Layout Verification:**
- [ ] Same layout as dark mode
- [ ] Form properly centered
- [ ] All sections visible without scrolling
- [ ] Proper spacing maintained

**Color & Theme:**
- [ ] White background for cards
- [ ] Dark text readable
- [ ] Light gray borders (slate-200)
- [ ] Input backgrounds white
- [ ] Blue accent colors for links
- [ ] Hover effects visible
- [ ] No color contrast issues
- [ ] Professional appearance

**Form Interaction:**
- [ ] Cursor shows input affordance
- [ ] Click targets are adequate
- [ ] Keyboard navigation works
- [ ] Tab order is logical
- [ ] Focus outline visible

---

### 2.3 Mobile (375x667) - Dark Mode

**Layout Verification:**
- [ ] Form heading visible
- [ ] Form fields stack vertically
- [ ] One input per line
- [ ] Full-width inputs
- [ ] Proper vertical spacing
- [ ] Submit button full-width
- [ ] Quick action cards stack vertically
- [ ] Social links visible
- [ ] No horizontal overflow
- [ ] Proper top/bottom spacing

**Form Fields:**
- [ ] Name input full-width with padding
- [ ] Phone input full-width with padding
- [ ] Email input full-width with padding
- [ ] Subject input full-width with padding
- [ ] Message textarea full-width
- [ ] All fields easily tappable (min 44px height)
- [ ] Labels visible above inputs
- [ ] Placeholder text visible

**Submit Button:**
- [ ] Full-width or near full-width
- [ ] Minimum 44px height (tap target)
- [ ] Clearly visible
- [ ] Prominent color
- [ ] Text readable
- [ ] Accessible via keyboard

**Touch Interaction:**
- [ ] Fields are easy to tap
- [ ] No overlap between elements
- [ ] Adequate spacing for finger touches
- [ ] Keyboard doesn't hide submit button

**Scrolling:**
- [ ] Content fits in viewport
- [ ] Smooth scrolling
- [ ] No jumping elements
- [ ] Proper scroll positioning

---

### 2.4 Mobile (375x667) - Light Mode

**Layout Verification:**
- [ ] Same responsive stacking as dark mode
- [ ] Full-width elements maintained
- [ ] Proper margins and padding

**Color & Theme:**
- [ ] White backgrounds for inputs
- [ ] Dark text readable
- [ ] Light gray borders
- [ ] Blue accent colors
- [ ] Professional appearance

**Touch Targets:**
- [ ] All buttons minimum 44x44 px
- [ ] Form fields easily tappable
- [ ] Proper spacing between elements
- [ ] No accidental overlap

---

## 3. HELP CENTER PAGE - VISUAL TEST CASES

### 3.1 Desktop (1280x900) - Dark Mode

**Layout Verification:**
- [ ] Header visible with icon and title
- [ ] "Help Center" title readable
- [ ] Subtitle "Find guides, fixes, and common answers" visible
- [ ] Search bar positioned in header
- [ ] Search status message visible below search
- [ ] Article grid below header
- [ ] 2-column article grid displayed
- [ ] All articles visible without scrolling
- [ ] No horizontal overflow

**Header Section:**
- [ ] Help circle icon visible and colored
- [ ] Title text large and readable
- [ ] Subtitle text smaller, good contrast
- [ ] Rounded corners on header card
- [ ] Proper padding and spacing

**Search Functionality:**
- [ ] Search input has visible border
- [ ] Search icon positioned in input
- [ ] Placeholder text visible
- [ ] Search status message displays count
- [ ] Text is readable

**Article Grid:**
- [ ] Articles in 2-column layout
- [ ] Cards have rounded corners
- [ ] Article titles readable
- [ ] Descriptions visible (line-clamped)
- [ ] Proper spacing between cards
- [ ] Cards are clickable (hover effects)

**Theme Colors:**
- [ ] Dark background (slate-900)
- [ ] White text readable
- [ ] Border colors appropriate (slate-700)
- [ ] Input background dark (slate-800)
- [ ] Hover effects show indigo color
- [ ] Good color contrast
- [ ] Professional appearance

---

### 3.2 Desktop (1280x900) - Light Mode

**Layout Verification:**
- [ ] Same layout as dark mode
- [ ] Header properly positioned
- [ ] 2-column grid maintained
- [ ] All content visible

**Color & Theme:**
- [ ] White backgrounds
- [ ] Dark text readable
- [ ] Light gray borders
- [ ] Blue/indigo accent colors
- [ ] Hover effects visible
- [ ] Professional appearance

**Interactive Elements:**
- [ ] Article cards show hover effect
- [ ] Cursor changes on links
- [ ] Colors meet contrast requirements
- [ ] No readability issues

---

### 3.3 Mobile (375x667) - Dark Mode

**Layout Verification:**
- [ ] Header visible at top
- [ ] Title and subtitle readable
- [ ] Search bar full-width
- [ ] Search status message visible
- [ ] Article grid switches to 1 column
- [ ] Cards stack vertically
- [ ] No horizontal overflow
- [ ] Proper vertical spacing

**Header Section:**
- [ ] Icon visible
- [ ] Title readable
- [ ] Subtitle readable
- [ ] Proper spacing

**Search:**
- [ ] Search bar full-width
- [ ] Input tap-friendly (min 44px height)
- [ ] Icon visible inside input
- [ ] Placeholder text visible
- [ ] Status message readable

**Article Cards:**
- [ ] Full-width cards on mobile
- [ ] Proper margins on sides
- [ ] Title text readable
- [ ] Description preview visible
- [ ] Cards are tappable
- [ ] Proper vertical spacing

**Scrolling:**
- [ ] Content scrolls smoothly
- [ ] No jumping elements
- [ ] Header stays stable
- [ ] Cards align properly

---

### 3.4 Mobile (375x667) - Light Mode

**Layout Verification:**
- [ ] Same responsive layout as dark mode
- [ ] Cards switch to 1 column
- [ ] Full-width maintained

**Color & Theme:**
- [ ] White backgrounds
- [ ] Dark text readable
- [ ] Light borders
- [ ] Blue accent colors
- [ ] Good contrast

**Touch Interaction:**
- [ ] Cards are easy to tap
- [ ] Proper spacing between cards
- [ ] No overlap of elements
- [ ] Keyboard accessible

---

## 4. FORM VALIDATION - VISUAL TEST CASES

### 4.1 Empty Form Submission

**Visual Expectations:**
- [ ] All error messages appear simultaneously
- [ ] Error text colored in red or distinct color
- [ ] Error messages positioned near fields
- [ ] Error icons visible if applicable
- [ ] Submit button remains visible but disabled
- [ ] Form doesn't auto-clear

**Error Messages Expected:**
- [ ] "Full name is required." near Name field
- [ ] "Phone is required." near Phone field
- [ ] "Email is required." near Email field
- [ ] "Subject is required." near Subject field
- [ ] "Message is required." near Message field
- [ ] "Consent is required." near Checkbox

---

### 4.2 Invalid Email Format

**Visual Expectations:**
- [ ] Only email error displays (other fields clear)
- [ ] Red/error color on Email field
- [ ] Error message: "Enter a valid email address."
- [ ] Other fields clear/valid state
- [ ] Submit button accessible

**Test Cases:**
- [ ] "notanemail" → Error
- [ ] "user@" → Error
- [ ] "@example.com" → Error
- [ ] "user@example" → Error
- [ ] "user@example.com" → Valid (no error)

---

### 4.3 Short Message

**Visual Expectations:**
- [ ] Only message error displays
- [ ] Red/error color on Message field
- [ ] Error message: "Message must be at least 20 characters."
- [ ] Character count visible (optional)
- [ ] Submit button accessible

**Test Cases:**
- [ ] 10 characters → Error
- [ ] 19 characters → Error
- [ ] 20 characters → Valid
- [ ] 21 characters → Valid

---

### 4.4 Missing Consent

**Visual Expectations:**
- [ ] Only consent error displays
- [ ] Checkbox highlighted or marked with error
- [ ] Error message: "Consent is required."
- [ ] Other fields valid
- [ ] Submit button accessible

---

### 4.5 Valid Form Submission

**Visual Expectations:**
- [ ] No error messages displayed
- [ ] All fields have valid appearance
- [ ] Submit button is active/clickable
- [ ] Cursor shows click affordance
- [ ] Submit button text clear

**After Submission:**
- [ ] Loading indicator shows (optional)
- [ ] Success message appears
- [ ] Ticket ID displayed
- [ ] Toast notification visible
- [ ] Form clears or shows success state

---

## 5. THEME TOGGLE - VISUAL TEST CASES

### 5.1 Dark Mode

**Colors to Verify:**
- [ ] Background: Dark slate (appears #1e293b or similar)
- [ ] Text: White or light gray
- [ ] Borders: Dark gray/slate
- [ ] Inputs: Very dark background
- [ ] Accent: Blue/indigo
- [ ] No harsh white areas
- [ ] Text readable on all backgrounds
- [ ] Sufficient contrast (WCAG AA)

**Components:**
- [ ] Header appears dark
- [ ] Form inputs appear dark
- [ ] Cards appear dark
- [ ] Buttons maintain visibility
- [ ] Links readable
- [ ] Hover states visible

### 5.2 Light Mode

**Colors to Verify:**
- [ ] Background: White or very light
- [ ] Text: Dark slate/black
- [ ] Borders: Light gray
- [ ] Inputs: White background
- [ ] Accent: Blue/indigo
- [ ] Professional appearance
- [ ] Text readable on all backgrounds
- [ ] Sufficient contrast (WCAG AA)

**Components:**
- [ ] Header appears light
- [ ] Form inputs white
- [ ] Cards white/light gray
- [ ] Buttons visible
- [ ] Links readable
- [ ] Hover states visible

### 5.3 Theme Toggle Animation

- [ ] Smooth transition between themes
- [ ] No flash or jarring change
- [ ] All components update together
- [ ] No delayed updates on elements
- [ ] Animation feels natural

---

## 6. ACCESSIBILITY - VISUAL TEST CASES

### 6.1 Keyboard Navigation

**Contact Form:**
- [ ] Tab key moves through fields in order
- [ ] Shift+Tab moves backward
- [ ] Focus outline visible on all elements
- [ ] Enter submits form from submit button
- [ ] Checkbox can be toggled with Space
- [ ] No keyboard traps
- [ ] Logical tab order

**Help Center:**
- [ ] Tab key navigates through search and articles
- [ ] Focus outline visible on all links
- [ ] Enter activates links
- [ ] No keyboard traps
- [ ] Logical navigation order

### 6.2 Focus States

- [ ] Focus outline visible on all interactive elements
- [ ] Focus color contrasts with background
- [ ] Focus outline doesn't disappear
- [ ] Clear indication of currently focused element
- [ ] Outline style is consistent

### 6.3 Color Contrast

**Text on Background:**
- [ ] Regular text: Minimum 4.5:1 contrast ratio
- [ ] Large text: Minimum 3:1 contrast ratio
- [ ] Links: Distinguishable from surrounding text
- [ ] Error messages: Visible and readable
- [ ] Buttons: Text readable

### 6.4 Text Legibility

- [ ] Font size reasonable (min 14px for body)
- [ ] Line height adequate (1.5+ for body text)
- [ ] Line length not too long (max 80 chars)
- [ ] Text wraps properly on mobile
- [ ] No text overlapping

---

## 7. RESPONSIVE DESIGN - VISUAL TEST CASES

### 7.1 Breakpoint Testing

**At 1280px (Desktop):**
- [ ] Full layout visible
- [ ] No horizontal scrolling
- [ ] 2-column grids on Help Center
- [ ] Optimal reading width
- [ ] All elements properly spaced

**At 768px (Tablet):**
- [ ] Layout adjusts properly
- [ ] Grids may be 1 or 2 columns
- [ ] Touch-friendly sizing
- [ ] No overflow
- [ ] Proper spacing

**At 375px (Mobile):**
- [ ] Single column layout
- [ ] Full-width elements
- [ ] Proper margins
- [ ] Touch-friendly sizes
- [ ] No overflow

### 7.2 Element Sizing

**Form Fields:**
- [ ] Minimum 44px height (tap target)
- [ ] Width fills container with padding
- [ ] Adequate padding inside
- [ ] Clear visual boundaries

**Buttons:**
- [ ] Minimum 44x44 px touch target
- [ ] Adequate padding
- [ ] Clear label
- [ ] Visible on all screen sizes

**Cards:**
- [ ] Proper aspect ratio
- [ ] Readable content
- [ ] Adequate spacing
- [ ] No overflow on mobile

---

## 8. PERFORMANCE - VISUAL TEST CASES

### 8.1 Page Load

- [ ] Content appears within 3 seconds
- [ ] No blank white screen
- [ ] No jumpy layout shifts
- [ ] Images load smoothly
- [ ] Fonts don't shift (FOUT/FOIT)

### 8.2 Interactions

**Form Submission:**
- [ ] Click feedback immediate
- [ ] Loading indicator appears
- [ ] No UI freezes
- [ ] Smooth transitions

**Search (Help Center):**
- [ ] Results update quickly
- [ ] No lag when typing
- [ ] Loading indicator shows
- [ ] Results render smoothly

### 8.3 Animations

- [ ] Smooth and performant
- [ ] No stuttering
- [ ] Appropriate timing
- [ ] Can be disabled (reduced motion)

---

## 9. CROSS-BROWSER TESTING - VISUAL TEST CASES

### Browsers to Test
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Chrome
- [ ] Mobile Safari

### Visual Consistency
- [ ] Same appearance across browsers
- [ ] Colors render consistently
- [ ] Fonts display properly
- [ ] Layout stable
- [ ] Interactions work same way
- [ ] No browser-specific issues

---

## 10. ERROR STATES - VISUAL TEST CASES

### Network Error

**Help Center:**
- [ ] "Failed to load help center." message visible
- [ ] Retry option available
- [ ] Clear error communication
- [ ] User knows what happened

### Timeout Error

**Contact Form:**
- [ ] "Network error" message shown
- [ ] Form data preserved
- [ ] Retry option available
- [ ] User can modify and resubmit

### Validation Error

- [ ] All error messages visible
- [ ] Red color indicates error
- [ ] Error messages clear and helpful
- [ ] User knows what to fix

---

## 11. SUCCESS STATES - VISUAL TEST CASES

### Form Submission Success

- [ ] Toast notification appears
- [ ] Ticket ID displayed
- [ ] Success message clear
- [ ] Form may show success state or reset
- [ ] User can view confirmation

### Search Results

- [ ] Results display cleanly
- [ ] Result count shown
- [ ] Loading indicator disappears
- [ ] Results immediately actionable

---

## 12. TEST EXECUTION LOG

| Test Case | Desktop Dark | Desktop Light | Mobile Dark | Mobile Light | Status |
|-----------|---|---|---|---|---|
| Form displays | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Fields visible | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Validation | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Quick cards | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Help articles | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Search works | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Categories | ⏳ | ⏳ | ⏳ | ⏳ | Pending API |
| Responsive | ✅ | ✅ | ✅ | ✅ | Code verified |
| Theme | ✅ | ✅ | ✅ | ✅ | Code verified |
| Accessibility | ✅ | ✅ | ✅ | ✅ | Code verified |

---

## 13. RECOMMENDATIONS FOR VISUAL TESTING

### Tools to Use
- [ ] Puppeteer for automated screenshots
- [ ] axe DevTools for accessibility
- [ ] Lighthouse for performance
- [ ] Cross-browser testing tool (BrowserStack, Sauce Labs)
- [ ] Mobile device testing (real devices)

### Testing Workflow
1. Start with desktop dark mode
2. Verify all visual elements
3. Test interactions and validation
4. Switch to light mode
5. Test mobile responsiveness
6. Test on multiple browsers
7. Test on real devices
8. Verify accessibility
9. Test performance
10. Document findings

---

## 14. SIGN-OFF TEMPLATE

**Test Session:** [Date]
**Tester:** [Name]
**Environment:** [Environment URL]

### Contact Page
- [ ] Desktop Dark Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Desktop Light Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Mobile Dark Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Mobile Light Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Form Validation: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Accessibility: ✅ PASS / ❌ FAIL / ⏳ PENDING

### Help Center Page
- [ ] Desktop Dark Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Desktop Light Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Mobile Dark Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Mobile Light Mode: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Search Functionality: ✅ PASS / ❌ FAIL / ⏳ PENDING
- [ ] Accessibility: ✅ PASS / ❌ FAIL / ⏳ PENDING

**Overall Status:** ✅ READY / ⏳ PENDING / ❌ BLOCKED

**Issues Found:**
[List any issues found]

**Notes:**
[Additional notes or observations]

---

**Document Version:** 1.0
**Last Updated:** 2024
**Status:** Complete - Ready for Testing
