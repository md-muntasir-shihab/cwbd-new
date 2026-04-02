#!/usr/bin/env node

/**
 * Phase 13 Performance Analysis Script
 * Analyzes:
 * 1. Page Load Times (FCP, LCP, DOMContentLoaded)
 * 2. Search & Filtering Performance
 * 3. Database Query Performance
 * 4. API Payload Analysis
 */

import { chromium } from 'playwright';
import axios from 'axios';
import { MongoClient } from 'mongodb';

const BACKEND_URL = 'http://localhost:5003';
const FRONTEND_URL = 'http://localhost:5176';
const MONGO_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017';

const results = {
  pageLoadTimes: {},
  searchPerformance: {},
  queryAnalysis: {},
  payloadAnalysis: {},
  recommendations: []
};

// Helper: Format time
const formatTime = (ms) => `${ms.toFixed(2)}ms`;

// 1. PAGE LOAD TIMES TEST
async function testPageLoadTimes(browser) {
  console.log('\n✅ PHASE 1: Page Load Times Analysis\n');
  
  const pages = [
    { name: 'Homepage', url: `${FRONTEND_URL}/` },
    { name: 'Universities List', url: `${FRONTEND_URL}/universities` },
    { name: 'Admin Dashboard', url: `${FRONTEND_URL}/admin/dashboard`, requiresAuth: true },
    { name: 'Student Dashboard', url: `${FRONTEND_URL}/student/dashboard`, requiresAuth: true },
    { name: 'News List', url: `${FRONTEND_URL}/news` }
  ];

  for (const page of pages) {
    try {
      const context = await browser.newContext();
      const newPage = await context.newPage();
      
      // Inject performance observer
      await newPage.addInitScript(() => {
        window.perfMetrics = {};
        
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name.includes('navigation')) {
              window.perfMetrics.navigation = entry;
            }
            if (entry.entryType === 'paint') {
              if (entry.name === 'first-contentful-paint') {
                window.perfMetrics.fcp = entry.startTime;
              }
            }
            if (entry.entryType === 'largest-contentful-paint') {
              window.perfMetrics.lcp = entry.renderTime || entry.loadTime;
            }
          }
        });
        
        observer.observe({ entryTypes: ['navigation', 'paint', 'largest-contentful-paint'] });
      });

      const startTime = Date.now();
      await newPage.goto(page.url, { waitUntil: 'networkidle', timeout: 30000 });
      const loadTime = Date.now() - startTime;
      
      // Get performance metrics
      const metrics = await newPage.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const lcp = performance.getEntriesByType('largest-contentful-paint').pop();
        
        return {
          fcp: fcp?.startTime || null,
          lcp: lcp?.renderTime || lcp?.loadTime || null,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          totalTime: nav.loadEventEnd - nav.fetchStart,
          resourceCount: performance.getEntriesByType('resource').length,
          resourceSize: Math.round(performance.getEntriesByType('resource').reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024) // KB
        };
      });

      const pageMetrics = {
        url: page.url,
        loadTime: loadTime,
        fcp: metrics.fcp,
        lcp: metrics.lcp,
        domContentLoaded: metrics.domContentLoaded,
        loadComplete: metrics.loadComplete,
        totalTime: metrics.totalTime,
        resourceCount: metrics.resourceCount,
        resourceSize: metrics.resourceSize,
        status: metrics.fcp < 3000 ? 'PASS' : 'SLOW'
      };

      results.pageLoadTimes[page.name] = pageMetrics;
      
      console.log(`📄 ${page.name}:`);
      console.log(`   Load Time: ${formatTime(loadTime)}`);
      console.log(`   FCP: ${metrics.fcp ? formatTime(metrics.fcp) : 'N/A'}`);
      console.log(`   LCP: ${metrics.lcp ? formatTime(metrics.lcp) : 'N/A'}`);
      console.log(`   Resources: ${metrics.resourceCount} (${metrics.resourceSize}KB)`);
      console.log(`   Status: ${pageMetrics.status}\n`);

      if (metrics.fcp > 3000) {
        results.recommendations.push({
          severity: 'HIGH',
          page: page.name,
          issue: `FCP is ${formatTime(metrics.fcp)}, target is < 3000ms`,
          suggestion: 'Consider code splitting, lazy loading, or optimizing critical rendering path'
        });
      }

      await context.close();
    } catch (error) {
      console.log(`❌ ${page.name}: ${error.message}`);
    }
  }
}

// 2. SEARCH & FILTERING PERFORMANCE
async function testSearchPerformance(browser) {
  console.log('\n✅ PHASE 2: Search & Filtering Performance\n');
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Listen to network requests
    const networkMetrics = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        networkMetrics.push({
          url: response.url(),
          status: response.status(),
          time: response.timing()
        });
      }
    });

    await page.goto(`${FRONTEND_URL}/universities`, { waitUntil: 'networkidle' });

    // Test: Universities search
    const startSearch = Date.now();
    await page.fill('input[placeholder*="search"]', 'Dhaka');
    await page.waitForTimeout(500);
    const searchTime = Date.now() - startSearch;

    const universities = await page.locator('[data-testid="university-item"]').count();

    results.searchPerformance['Universities Search'] = {
      query: 'Dhaka',
      responseTime: searchTime,
      resultsCount: universities,
      status: searchTime < 200 ? 'PASS' : 'SLOW'
    };

    console.log(`🔍 Universities Search (query: "Dhaka"):`);
    console.log(`   Response Time: ${formatTime(searchTime)}`);
    console.log(`   Results: ${universities}`);
    console.log(`   Status: ${searchTime < 200 ? 'PASS' : 'SLOW'}\n`);

    if (searchTime > 200) {
      results.recommendations.push({
        severity: 'MEDIUM',
        feature: 'Universities Search',
        issue: `Search took ${formatTime(searchTime)}, target is < 200ms`,
        suggestion: 'Add debouncing, implement server-side search with proper indexes'
      });
    }

    await context.close();
  } catch (error) {
    console.log(`❌ Search Performance: ${error.message}`);
  }
}

// 3. DATABASE QUERY ANALYSIS
async function analyzeQueries() {
  console.log('\n✅ PHASE 3: Database Query Analysis\n');
  
  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    const db = client.db('campusway');

    // Check collections and their indexes
    const collections = ['universities', 'users', 'news', 'campaigns', 'questions'];
    
    for (const collName of collections) {
      try {
        const coll = db.collection(collName);
        const indexes = await coll.getIndexes();
        const stats = await db.collection(collName).stats();
        
        results.queryAnalysis[collName] = {
          documentCount: stats.count,
          avgDocSize: stats.avgObjSize,
          indexes: Object.keys(indexes),
          indexCount: Object.keys(indexes).length,
          storageSize: stats.size
        };

        console.log(`📊 Collection: ${collName}`);
        console.log(`   Documents: ${stats.count}`);
        console.log(`   Avg Doc Size: ${stats.avgObjSize} bytes`);
        console.log(`   Indexes: ${Object.keys(indexes).length}`);
        console.log(`   Indexes: ${Object.keys(indexes).join(', ')}\n`);
      } catch (error) {
        console.log(`⚠️  ${collName}: ${error.message}`);
      }
    }

    // Check for missing indexes on common search fields
    const searches = [
      { collection: 'universities', field: 'name' },
      { collection: 'users', field: 'email' },
      { collection: 'news', field: 'title' },
      { collection: 'campaigns', field: 'status' }
    ];

    console.log('\n📋 Index Recommendations:\n');
    for (const { collection, field } of searches) {
      try {
        const coll = db.collection(collection);
        const indexes = await coll.getIndexes();
        const hasIndex = Object.values(indexes).some(idx => idx.key[field]);
        
        if (!hasIndex) {
          console.log(`⚠️  Missing: Create index on ${collection}.${field}`);
          results.recommendations.push({
            severity: 'MEDIUM',
            area: 'Database Indexes',
            issue: `Missing index on ${collection}.${field}`,
            suggestion: `db.${collection}.createIndex({ ${field}: 1 })`
          });
        }
      } catch (error) {}
    }

  } finally {
    await client.close();
  }
}

// 4. API PAYLOAD ANALYSIS
async function analyzePayloads(browser) {
  console.log('\n✅ PHASE 4: API Payload Analysis\n');
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const networkData = [];
    let totalSize = 0;
    let apiCount = 0;

    page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        apiCount++;
        try {
          const size = response.headers()['content-length'];
          const url = response.url();
          const method = response.request().method();
          
          networkData.push({ url, size: parseInt(size) || 0, method });
          totalSize += parseInt(size) || 0;
        } catch (error) {}
      }
    });

    await page.goto(`${FRONTEND_URL}/universities`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    results.payloadAnalysis = {
      totalApiCalls: apiCount,
      totalPayloadSize: totalSize,
      avgPayloadSize: apiCount > 0 ? (totalSize / apiCount).toFixed(2) : 0,
      oversizedPayloads: networkData.filter(d => d.size > 1024 * 1024)
    };

    console.log(`📦 API Payload Analysis:`);
    console.log(`   Total API Calls: ${apiCount}`);
    console.log(`   Total Payload: ${(totalSize / 1024).toFixed(2)}KB`);
    console.log(`   Avg Per Call: ${((totalSize / apiCount) / 1024).toFixed(2)}KB\n`);

    if (results.payloadAnalysis.oversizedPayloads.length > 0) {
      console.log(`⚠️  Large Payloads Found:`);
      for (const payload of results.payloadAnalysis.oversizedPayloads) {
        console.log(`   ${payload.url}: ${(payload.size / 1024 / 1024).toFixed(2)}MB`);
        results.recommendations.push({
          severity: 'HIGH',
          area: 'API Payloads',
          issue: `Payload exceeds 1MB: ${payload.url}`,
          suggestion: 'Implement pagination, field selection, or response compression'
        });
      }
    }

    await context.close();
  } catch (error) {
    console.log(`❌ Payload Analysis: ${error.message}`);
  }
}

// MAIN EXECUTION
async function runAnalysis() {
  console.log('🚀 Starting Phase 13 Performance Analysis...\n');
  
  const browser = await chromium.launch();

  try {
    // Wait for servers to be ready
    let serverReady = false;
    for (let i = 0; i < 10; i++) {
      try {
        await axios.get(`${BACKEND_URL}/health`);
        serverReady = true;
        break;
      } catch (error) {
        if (i < 9) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!serverReady) {
      console.log('⚠️  Backend server not responding, attempting to continue...');
    }

    await testPageLoadTimes(browser);
    await testSearchPerformance(browser);
    await analyzeQueries();
    await analyzePayloads(browser);

  } finally {
    await browser.close();
  }

  // Generate summary report
  console.log('\n\n===========================================');
  console.log('📊 PERFORMANCE ANALYSIS SUMMARY');
  console.log('===========================================\n');

  console.log('🎯 Recommendations:\n');
  if (results.recommendations.length === 0) {
    console.log('✅ All systems operating within acceptable performance parameters!');
  } else {
    const byPriority = {
      HIGH: results.recommendations.filter(r => r.severity === 'HIGH'),
      MEDIUM: results.recommendations.filter(r => r.severity === 'MEDIUM'),
      LOW: results.recommendations.filter(r => r.severity === 'LOW')
    };

    for (const [severity, items] of Object.entries(byPriority)) {
      if (items.length > 0) {
        console.log(`\n${severity} PRIORITY (${items.length}):`);
        items.forEach(rec => {
          console.log(`  • ${rec.issue}`);
          console.log(`    → ${rec.suggestion}`);
        });
      }
    }
  }

  console.log('\n\n✅ Performance Analysis Complete!');
  return results;
}

// Run with error handling
runAnalysis().catch(error => {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
});
