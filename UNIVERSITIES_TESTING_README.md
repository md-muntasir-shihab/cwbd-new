# Universities Module Comprehensive Testing Guide

## Quick Start

### Option 1: Automated (Recommended)

1. **Start the frontend server** (in one terminal):
   ```cmd
   cd F:\CampusWay\CampusWay\frontend
   npm run dev
   ```
   Wait for it to show "Local: http://localhost:5175/"

2. **Run the test script** (in another terminal):
   ```cmd
   cd F:\CampusWay\CampusWay
   RUN_UNIVERSITIES_TEST.bat
   ```

### Option 2: Manual Steps

1. **Ensure frontend is running**:
   ```cmd
   cd F:\CampusWay\CampusWay\frontend
   npm run dev
   ```

2. **Install Puppeteer** (if not already installed):
   ```cmd
   cd F:\CampusWay\CampusWay\frontend
   npm install puppeteer
   ```

3. **Run the test script**:
   ```cmd
   cd F:\CampusWay\CampusWay
   node test-universities-comprehensive.mjs
   ```

## What the Test Does

### ✅ Test Coverage

1. **Universities List Page** (`/universities`)
   - ✓ Page load verification
   - ✓ University cards display (grid layout check)
   - ✓ Search functionality (search for "Dhaka")
   - ✓ Category filter chips interaction
   - ✓ Cluster groups dropdown
   - ✓ Sort options
   - ✓ Image loading validation

2. **University Detail Page** (`/universities/{slug}`)
   - ✓ Navigation from list to detail
   - ✓ Section rendering
   - ✓ Image loading
   - ✓ CTA buttons/links verification
   - ✓ Back navigation

3. **Category View Page** (`/universities/category/{slug}`)
   - ✓ Category routing
   - ✓ Filtered results display

4. **Responsive Design Testing**
   - ✓ Desktop (1280 x 900)
   - ✓ Tablet (768 x 1024)
   - ✓ Mobile (375 x 667)

5. **Theme Testing**
   - ✓ Dark/Light theme toggle (if available)

### 📸 Screenshots

The script automatically captures screenshots for:
- Initial page load (all viewports)
- Search results
- Filter interactions
- Dropdown/sort interactions
- Detail page views
- Theme toggles
- Responsive layout checks

All screenshots are saved to: `universities-test-screenshots/`

### 📄 Test Report

After completion, a comprehensive markdown report is generated:
- **File**: `phase3-universities-test-report.md`
- **Contains**:
  - Test summary with pass rate
  - Detailed results (passed/failed/warnings)
  - Issues found
  - Screenshots captured
  - Recommendations

## Expected Output

You should see console output like:
```
[2025-XX-XX...] [INFO] 🚀 Starting CampusWay Universities Module Comprehensive Test Suite
[2025-XX-XX...] [INFO] Target URL: http://localhost:5175
[2025-XX-XX...] [INFO] ========================================
[2025-XX-XX...] [INFO] Testing with Desktop viewport (1280x900)
[2025-XX-XX...] [PASS] ✓ Page Load: Universities page loaded with title: ...
[2025-XX-XX...] [PASS] ✓ University Cards: Found X university cards
...
```

## Troubleshooting

### "Connection refused" or "Cannot reach localhost:5175"
**Solution**: Make sure the frontend dev server is running:
```cmd
cd frontend
npm run dev
```

### "Cannot find module 'puppeteer'"
**Solution**: Install Puppeteer:
```cmd
cd frontend
npm install puppeteer
```

### Screenshots not captured
**Issue**: Permission or disk space issues
**Solution**: Check you have write permissions and sufficient disk space

### Tests timeout
**Issue**: Slow network or server response
**Solution**: 
- Check frontend server is responsive
- Try running tests again
- Increase timeout values in the script if needed

## Results Location

After the test completes:

```
F:\CampusWay\CampusWay\
├── phase3-universities-test-report.md      ← Main report
├── universities-test-screenshots\         ← Screenshot folder
│   ├── desktop-universities-list-initial-*.png
│   ├── desktop-universities-search-dhaka-*.png
│   ├── tablet-universities-list-initial-*.png
│   ├── mobile-universities-list-initial-*.png
│   └── ... (more screenshots)
└── test-universities-comprehensive.mjs    ← Test script
```

## Test Metrics

The report includes:
- ✅ **Passed tests**: Features working correctly
- ❌ **Failed tests**: Critical issues found
- ⚠️  **Warnings**: Non-critical issues or missing optional features
- 📸 **Screenshots**: Visual evidence of each test
- **Pass Rate**: Overall success percentage

## Next Steps After Testing

1. **Review the report**: Open `phase3-universities-test-report.md`
2. **Check screenshots**: Browse `universities-test-screenshots/` folder
3. **Fix issues**: Address any failed tests or warnings
4. **Re-run tests**: Verify fixes work correctly

## Support

If you encounter any issues:
1. Check the console output for specific error messages
2. Review the generated report for detailed test results
3. Examine screenshots to see visual evidence
4. Ensure all prerequisites are met (frontend running, Puppeteer installed)
