import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Device matrix with all breakpoints
const DEVICE_MATRIX = [
  { name: '320px (iPhone SE)', width: 320, height: 812 },
  { name: '360px (Galaxy S8)', width: 360, height: 800 },
  { name: '375px (iPhone X/11/12)', width: 375, height: 812 },
  { name: '390px (iPhone 13/14)', width: 390, height: 844 },
  { name: '414px (iPhone Plus)', width: 414, height: 896 },
  { name: '768px (iPad Portrait)', width: 768, height: 1024 },
  { name: '820px (iPad Air)', width: 820, height: 1180 },
  { name: '1024px (iPad Landscape)', width: 1024, height: 768 },
  { name: '1280px (Desktop)', width: 1280, height: 800 },
  { name: '1440px (Large Desktop)', width: 1440, height: 900 },
];

// Test routes for each module
const TEST_ROUTES = {
  'Homepage': '/',
  'Universities': '/universities',
  'Admin Dashboard': '/__cw_admin__/dashboard',
  'Admin Students': '/__cw_admin__/admin/students',
  'Campaign Console': '/__cw_admin__/admin/campaigns',
};

// Report output directory
const REPORT_DIR = './responsive-test-results';
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

class ResponsiveDesignTester {
  constructor() {
    this.browser = null;
    this.results = {};
    this.baseUrl = 'http://localhost:5176';
  }

  async init() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      console.log('✓ Browser launched');
    } catch (error) {
      console.error('✗ Failed to launch browser:', error.message);
      process.exit(1);
    }
  }

  async testPage(pageLabel, route, device) {
    const page = await this.browser.newPage();
    const deviceName = device.name;
    const key = `${pageLabel} - ${deviceName}`;

    try {
      await page.setViewport({ width: device.width, height: device.height });

      // Wait for navigation with timeout
      await page.goto(`${this.baseUrl}${route}`, {
        waitUntil: 'networkidle2',
        timeout: 10000,
      });

      // Wait for content to render
      await page.waitForTimeout(1000);

      // Capture screenshot
      const screenshotPath = path.join(
        REPORT_DIR,
        `${pageLabel.replace(/\s+/g, '_')}_${device.width}px.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Check for responsive issues
      const issues = await this.checkResponsiveIssues(page, device.width);

      this.results[key] = {
        status: 'SUCCESS',
        screenshotPath,
        issues,
        viewport: `${device.width}x${device.height}`,
      };

      console.log(`✓ ${key}`);

      if (issues.length > 0) {
        console.log(`  Issues found: ${issues.map((i) => i.type).join(', ')}`);
      }
    } catch (error) {
      this.results[key] = {
        status: 'FAILED',
        error: error.message,
        viewport: `${device.width}x${device.height}`,
      };
      console.error(`✗ ${key}: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  async checkResponsiveIssues(page, viewportWidth) {
    const issues = [];

    try {
      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return html.scrollWidth > html.clientWidth;
      });

      if (hasOverflow) {
        issues.push({
          type: 'HORIZONTAL_OVERFLOW',
          severity: 'BLOCKER',
          message: 'Horizontal scrolling detected',
        });
      }

      // Check for fixed-width elements that might be too wide
      const tooWideElements = await page.evaluate((vw) => {
        const elements = [];
        document.querySelectorAll('[style*="width"]').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > vw) {
            elements.push({
              tag: el.tagName,
              class: el.className,
              width: rect.width,
            });
          }
        });
        return elements;
      }, viewportWidth);

      if (tooWideElements.length > 0) {
        issues.push({
          type: 'OVERSIZED_ELEMENTS',
          severity: 'HIGH',
          count: tooWideElements.length,
        });
      }

      // Check for hidden critical elements (CTAs, buttons, search)
      const hiddenCritical = await page.evaluate(() => {
        const hidden = [];
        const criticalSelectors = [
          'button',
          '[role="button"]',
          'a[href]',
          'input[type="search"]',
          'input[type="text"]',
        ];

        criticalSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              hidden.push({
                tag: el.tagName,
                text: el.textContent?.substring(0, 30) || 'N/A',
              });
            }
          });
        });

        return hidden;
      });

      if (hiddenCritical.length > 0) {
        issues.push({
          type: 'HIDDEN_CRITICAL_ELEMENTS',
          severity: 'HIGH',
          count: hiddenCritical.length,
        });
      }

      // Check for text readability (font size too small on mobile)
      if (viewportWidth < 768) {
        const smallText = await page.evaluate(() => {
          const elements = [];
          document.querySelectorAll('p, span, div').forEach((el) => {
            const style = window.getComputedStyle(el);
            const fontSize = parseFloat(style.fontSize);
            if (fontSize < 12 && el.textContent?.trim().length > 0) {
              elements.push({
                fontSize,
                text: el.textContent?.substring(0, 20) || 'N/A',
              });
            }
          });
          return elements;
        });

        if (smallText.length > 5) {
          issues.push({
            type: 'SMALL_TEXT',
            severity: 'MEDIUM',
            count: smallText.length,
          });
        }
      }

      // Check for clipped content
      const clippedContent = await page.evaluate(() => {
        const clipped = [];
        document.querySelectorAll('*').forEach((el) => {
          if (el.offsetHeight > 0 && el.scrollHeight > el.offsetHeight) {
            const style = window.getComputedStyle(el);
            if (style.overflow !== 'auto' && style.overflow !== 'scroll') {
              clipped.push({
                tag: el.tagName,
                class: el.className,
              });
            }
          }
        });
        return clipped.slice(0, 5); // Limit to 5 examples
      });

      if (clippedContent.length > 0) {
        issues.push({
          type: 'CLIPPED_CONTENT',
          severity: 'MEDIUM',
          count: clippedContent.length,
        });
      }
    } catch (error) {
      console.warn(`  Warning during checks: ${error.message}`);
    }

    return issues;
  }

  async runAllTests() {
    console.log('\n🚀 Starting Responsive Design Testing\n');
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Device Matrix: ${DEVICE_MATRIX.length} breakpoints\n`);

    for (const [pageLabel, route] of Object.entries(TEST_ROUTES)) {
      console.log(`\n📄 Testing ${pageLabel} (${route})`);
      console.log('━'.repeat(60));

      for (const device of DEVICE_MATRIX) {
        await this.testPage(pageLabel, route, device);
      }
    }

    this.generateReport();
  }

  generateReport() {
    console.log('\n\n📊 Generating Report\n');

    const reportContent = this.buildReportMarkdown();
    const reportPath = path.join(REPORT_DIR, 'phase8-responsive-design-report.md');

    fs.writeFileSync(reportPath, reportContent);
    console.log(`✓ Report saved to: ${reportPath}`);

    // Also save JSON results for detailed inspection
    const jsonPath = path.join(REPORT_DIR, 'responsive-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(this.results, null, 2));
    console.log(`✓ Detailed results saved to: ${jsonPath}`);

    // Print summary
    this.printSummary();
  }

  buildReportMarkdown() {
    const timestamp = new Date().toISOString();

    let md = `# Phase 8 Comprehensive Responsive Design Report\n\n`;
    md += `**Generated:** ${timestamp}\n\n`;

    md += `## Executive Summary\n\n`;

    const totalTests = Object.keys(this.results).length;
    const passedTests = Object.values(this.results).filter((r) => r.status === 'SUCCESS').length;
    const failedTests = totalTests - passedTests;
    const testsWithIssues = Object.values(this.results).filter(
      (r) => r.status === 'SUCCESS' && r.issues.length > 0
    ).length;

    md += `- **Total Tests:** ${totalTests}\n`;
    md += `- **Passed:** ${passedTests}\n`;
    md += `- **Failed:** ${failedTests}\n`;
    md += `- **Tests with Issues:** ${testsWithIssues}\n\n`;

    md += `## Device Matrix\n\n`;
    md += `| Breakpoint | Device | Resolution | Tests |\n`;
    md += `|---|---|---|---|\n`;

    DEVICE_MATRIX.forEach((device) => {
      const deviceTests = Object.entries(this.results).filter((e) =>
        e[0].includes(device.name)
      );
      const passed = deviceTests.filter((e) => e[1].status === 'SUCCESS').length;
      const failed = deviceTests.length - passed;
      const status = failed === 0 ? '✅' : `⚠️ (${failed} issues)`;
      md += `| ${device.width}px | ${device.name} | ${device.width}x${device.height} | ${passed}/${deviceTests.length} ${status} |\n`;
    });

    md += `\n## Detailed Results by Page\n\n`;

    const pageGroups = {};
    for (const [key, result] of Object.entries(this.results)) {
      const pageName = key.split(' - ')[0];
      if (!pageGroups[pageName]) {
        pageGroups[pageName] = [];
      }
      pageGroups[pageName].push({ key, result });
    }

    for (const [pageName, tests] of Object.entries(pageGroups)) {
      md += `### ${pageName}\n\n`;

      for (const { key, result } of tests) {
        const deviceName = key.split(' - ')[1];
        md += `#### ${deviceName}\n\n`;

        if (result.status === 'FAILED') {
          md += `**Status:** ❌ FAILED\n\n`;
          md += `**Error:** ${result.error}\n\n`;
        } else {
          md += `**Status:** ✅ PASSED\n`;
          md += `**Viewport:** ${result.viewport}\n\n`;

          if (result.issues.length > 0) {
            md += `**Issues Detected:**\n\n`;
            result.issues.forEach((issue) => {
              const severity =
                issue.severity === 'BLOCKER'
                  ? '🔴'
                  : issue.severity === 'HIGH'
                    ? '🟠'
                    : '🟡';
              md += `- ${severity} **${issue.type}** (${issue.severity})\n`;
              if (issue.message) md += `  - ${issue.message}\n`;
              if (issue.count) md += `  - Count: ${issue.count}\n`;
            });
          } else {
            md += `**No Issues Detected** ✓\n`;
          }
          md += `\n`;
        }
      }
    }

    md += `\n## Issue Summary\n\n`;

    const issueTypes = {};
    for (const result of Object.values(this.results)) {
      if (result.status === 'SUCCESS' && result.issues) {
        for (const issue of result.issues) {
          issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
        }
      }
    }

    if (Object.keys(issueTypes).length === 0) {
      md += `**No responsive design issues detected!** 🎉\n\n`;
    } else {
      md += `| Issue Type | Count | Severity |\n`;
      md += `|---|---|---|\n`;

      for (const [type, count] of Object.entries(issueTypes)) {
        const severity = type.includes('OVERFLOW')
          ? 'BLOCKER'
          : type.includes('HIDDEN') || type.includes('OVERSIZED')
            ? 'HIGH'
            : 'MEDIUM';
        const icon = severity === 'BLOCKER' ? '🔴' : severity === 'HIGH' ? '🟠' : '🟡';
        md += `| ${type} | ${count} | ${icon} ${severity} |\n`;
      }
    }

    md += `\n## Recommendations\n\n`;

    if (failedTests > 0) {
      md += `1. **Fix Failed Tests:** ${failedTests} pages failed to load. Check network and server status.\n`;
    }

    const blockers = Object.values(this.results).filter((r) =>
      r.issues?.some((i) => i.severity === 'BLOCKER')
    );

    if (blockers.length > 0) {
      md += `2. **Fix Blocker Issues:** ${blockers.length} tests have blocker-level issues requiring immediate attention.\n`;
    }

    const highSeverity = Object.values(this.results).filter((r) =>
      r.issues?.some((i) => i.severity === 'HIGH')
    );

    if (highSeverity.length > 0) {
      md += `3. **Address High Severity Issues:** ${highSeverity.length} tests have high-severity issues affecting usability.\n`;
    }

    md += `4. **Test on Real Devices:** Validate on actual mobile/tablet devices for touch interactions.\n`;
    md += `5. **Performance Optimization:** Monitor page load times across slow network conditions.\n\n`;

    md += `## Screenshots Generated\n\n`;
    md += `Screenshots for each breakpoint have been saved to the report directory for visual inspection.\n\n`;

    md += `---\n\n`;
    md += `*Report generated by CampusWay Responsive Design Validation Suite*\n`;

    return md;
  }

  printSummary() {
    console.log('\n\n╔════════════════════════════════════════════════════════╗');
    console.log('║     RESPONSIVE DESIGN TESTING COMPLETE                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const totalTests = Object.keys(this.results).length;
    const passedTests = Object.values(this.results).filter((r) => r.status === 'SUCCESS').length;
    const failedTests = totalTests - passedTests;

    console.log(`📊 Summary:`);
    console.log(`  • Total Tests: ${totalTests}`);
    console.log(`  • Passed: ${passedTests}`);
    console.log(`  • Failed: ${failedTests}`);

    const testsWithIssues = Object.entries(this.results)
      .filter((e) => e[1].status === 'SUCCESS' && e[1].issues.length > 0)
      .map((e) => ({ key: e[0], issues: e[1].issues }));

    if (testsWithIssues.length > 0) {
      console.log(`\n⚠️  Issues by Severity:\n`);

      const blockerIssues = testsWithIssues.filter((t) =>
        t.issues.some((i) => i.severity === 'BLOCKER')
      );
      const highIssues = testsWithIssues.filter((t) =>
        t.issues.some((i) => i.severity === 'HIGH')
      );
      const mediumIssues = testsWithIssues.filter((t) =>
        t.issues.some((i) => i.severity === 'MEDIUM')
      );

      if (blockerIssues.length > 0) {
        console.log(`  🔴 BLOCKER: ${blockerIssues.length} tests`);
        blockerIssues.forEach((t) => {
          const blockers = t.issues.filter((i) => i.severity === 'BLOCKER');
          console.log(`     • ${t.key}`);
          blockers.forEach((b) => console.log(`       - ${b.type}`));
        });
      }

      if (highIssues.length > 0) {
        console.log(`  🟠 HIGH: ${highIssues.length} tests`);
      }

      if (mediumIssues.length > 0) {
        console.log(`  🟡 MEDIUM: ${mediumIssues.length} tests`);
      }
    } else {
      console.log(`\n✅ All responsive design checks passed!\n`);
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('\n✓ Browser closed');
    }
  }
}

// Main execution
async function main() {
  const tester = new ResponsiveDesignTester();

  try {
    await tester.init();
    await tester.runAllTests();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

main();
