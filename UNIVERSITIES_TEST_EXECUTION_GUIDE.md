# Universities Module - Test Execution Guide

**Quick Start After Code Fix**

---

## 🚀 Step 1: Restart Dev Server

```bash
# Terminal - stop current server
Ctrl+C

# Terminal - start new server
cd frontend
npm run dev
```

**✅ Wait for:** `Local: http://localhost:5175/`

---

## 🧪 Step 2: Run Quick Validation Tests

### Test 1: Page Loads
```
URL: http://localhost:5175/universities
Expected: University cards displayed in 3-column grid
Status: ✓ Pass / ✗ Fail
```

### Test 2: Search Works
```
1. Type "Dhaka" in search bar
2. Results filter to show only Dhaka universities
Status: ✓ Pass / ✗ Fail
```

### Test 3: Category Filter
```
1. Click "Science & Technology" chip
2. Results filter to show only that category
Status: ✓ Pass / ✗ Fail
```

### Test 4: Navigation
```
1. Click any university card
2. Navigate to detail page
3. Click back button
4. Return to list
Status: ✓ Pass / ✗ Fail
```

### Test 5: Responsive (Desktop)
```
Resolution: 1280x900
Layout: Cards in 3-column grid
Status: ✓ Pass / ✗ Fail
```

### Test 6: Responsive (Tablet)
```
Resolution: 768x1024
Layout: Cards in 2-column grid
Scroll: No horizontal scroll
Status: ✓ Pass / ✗ Fail
```

### Test 7: Responsive (Mobile)
```
Resolution: 375x667
Layout: Cards in 1-column grid
Scroll: No horizontal scroll
Status: ✓ Pass / ✗ Fail
```

---

## 📋 Detailed Test Scenarios

### Universities List Page Tests

#### Grid Layout (Desktop)
```
✓ Cards display in 3-column layout
✓ Equal spacing between cards
✓ Cards are square/rectangular consistent
✓ Grid aligns properly
✓ Responsive to window resize
```

#### Search Functionality
```
✓ Search bar accepts input
✓ Results filter in real-time
✓ Multiple keywords work
✓ Case-insensitive search
✓ Clear search shows all results
```

#### Category Filters
```
✓ All chips clickable
✓ Chips highlight when selected
✓ Results filter to selected category
✓ Multiple selection supported (if applicable)
✓ "All" chip shows all universities
```

#### Cluster Dropdown
```
✓ Dropdown opens/closes
✓ Lists all clusters
✓ Selection filters results
✓ "All Clusters" shows all results
```

#### Sort Functionality
```
✓ Dropdown opens/closes
✓ Sort options available
✓ Results reorder on selection
✓ Current sort indicated
```

#### Card Content
```
✓ University name displayed
✓ Short code displayed
✓ Logo/avatar loads (no broken images)
✓ Status badge visible
✓ Category tag visible
✓ Location displayed
✓ Contact info displayed
✓ Application deadline shown
✓ Seat breakdown shown
```

#### Navigation
```
✓ Card click navigates to detail page
✓ URL changes to /universities/{slug}
✓ Detail page loads correctly
✓ Back button returns to list
✓ Search/filters preserved (if applicable)
```

---

### University Detail Page Tests

#### Page Load
```
✓ Page loads successfully
✓ Correct university data displayed
✓ No console errors
```

#### Sections Present
```
✓ Hero/Overview section
✓ Key information section
✓ Admission information
✓ Programs offered
✓ Deadlines
✓ Contact information
```

#### Images
```
✓ Hero image loads
✓ University logo displays
✓ All images responsive
✓ No broken image indicators
```

#### Interactive Elements
```
✓ Call button works (opens phone app or shows number)
✓ Email button works (opens email client)
✓ Website link works
✓ Back button functional
```

#### Responsive Layout
```
✓ Desktop layout appropriate (1280x900)
✓ Tablet layout appropriate (768x1024)
✓ Mobile layout stacked (375x667)
✓ No horizontal scroll
✓ Text readable on all sizes
```

---

### Category View Tests (`/universities/category/{slug}`)

#### Page Load
```
✓ Category page loads
✓ Only universities in category shown
✓ Category name displayed as title
```

#### Functionality
```
✓ Search works within category
✓ Filters work within category
✓ Can navigate back to all universities
```

---

### Cluster View Tests (`/universities/cluster/{slug}`)

#### Page Load
```
✓ Cluster page loads
✓ Only universities in cluster shown
✓ Cluster name displayed as title
```

#### Functionality
```
✓ Search works within cluster
✓ Filters work within cluster
✓ Can navigate back to all universities
```

---

## 🎨 Theme Tests

### Dark Mode
```
✓ Page readable in dark mode
✓ Text contrast acceptable
✓ Images visible
✓ Buttons clickable
✓ Cards have visible borders/shadows
```

### Light Mode
```
✓ Page readable in light mode
✓ Text contrast acceptable
✓ Images visible
✓ Buttons clickable
✓ Cards have visible shadows
```

---

## 🖼️ Screenshot Checklist

After testing, capture these screenshots:

```
[] 01-universities-list-1280x900-dark.png
[] 02-universities-list-1280x900-light.png
[] 03-universities-list-768x1024-dark.png
[] 04-universities-list-375x667-dark.png
[] 05-universities-search-active-1280x900.png
[] 06-universities-filter-active-1280x900.png
[] 07-universities-detail-1280x900.png
[] 08-universities-detail-375x667.png
[] 09-universities-category-view-1280x900.png
[] 10-universities-cluster-view-1280x900.png
[] 11-responsive-tablet-view-768x1024.png
[] 12-responsive-mobile-view-375x667.png
```

---

## 📊 Issues Found Template

```
Issue #: [AUTO-NUMBERED]
Title: [One-line description]
Severity: CRITICAL / HIGH / MEDIUM / LOW
Component: [Page/Feature]
Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Expected Result: [What should happen]
Actual Result: [What actually happened]
Browser: [Chrome/Firefox/Safari/Edge]
Device: [Desktop/Tablet/Mobile]
Screenshot: [Filename]
```

---

## ✅ Sign-Off Checklist

Before completing testing:

- [ ] All quick validation tests passed (Step 2)
- [ ] All detailed test scenarios completed
- [ ] Dark mode tested
- [ ] Light mode tested
- [ ] Desktop responsive verified
- [ ] Tablet responsive verified
- [ ] Mobile responsive verified
- [ ] All screenshots captured
- [ ] No console errors
- [ ] No broken images
- [ ] All links working
- [ ] Navigation working
- [ ] Search working
- [ ] Filters working
- [ ] Sort working
- [ ] Detail pages accessible
- [ ] Back buttons functional

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Page still shows old content | Clear cache: Ctrl+Shift+Delete, restart browser |
| Universities not loading | Check API: F12 → Network → filter `/api/universities` |
| Cards appearing empty | Check browser console for errors (F12) |
| Responsive layout broken | Check window size is exactly as specified (use DevTools) |
| Theme not switching | Try hard refresh: Ctrl+F5 |
| Images not loading | Check image URLs in Network tab, verify CDN accessible |
| Search not filtering | Check that input is focused and typed correctly |
| Detail page 404 | Verify slug in URL matches university slug in database |

---

## 📞 Support

**If issues persist:**
1. Check browser console (F12) for error messages
2. Check Network tab for failed requests
3. Verify backend API is running on port 5003
4. Clear all cache and restart both frontend and backend
5. Contact development team if error messages found

---

## 🎯 Success Criteria

Testing is complete when:
- ✅ All core functionality works without errors
- ✅ Responsive design works at all breakpoints
- ✅ Search and filters work correctly
- ✅ Navigation works
- ✅ Images load properly
- ✅ No broken links
- ✅ Theme toggle works
- ✅ Performance is acceptable (<2s load time)
- ✅ No console errors
- ✅ All test scenarios passed

---

**Time Estimate:** 1-2 hours  
**Next Step:** Report findings in phase3-universities-test-report.md

