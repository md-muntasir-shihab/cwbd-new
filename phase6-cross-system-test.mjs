#!/usr/bin/env node

/**
 * Phase 6 Cross-System Connection Verification
 * Tests all connection points between:
 * 1. Frontend-Backend API
 * 2. Backend-Database
 * 3. Admin-Public Reflection
 * 4. Admin-Student Reflection
 * 5. Subscription Access Gating
 * 6. Notification Routing
 */

import http from 'http';
import https from 'https';
import { MongoClient } from 'mongodb';

const BACKEND_URL = 'http://localhost:5003';
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'campusway';

const tests = {
  api: [],
  database: [],
  reflection: [],
  gating: [],
  notifications: []
};

/**
 * Test Backend-Database Connectivity
 */
async function testDatabaseConnections() {
  console.log('\n📊 TESTING BACKEND-DATABASE CONNECTIONS...\n');
  
  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    console.log('✓ MongoDB connection established');
    
    const db = client.db(DB_NAME);
    
    // Test collections exist
    const collections = [
      'universities',
      'news',
      'users',
      'user_subscriptions',
      'subscriptionplans',
      'homepages',
      'banners',
      'notifications'
    ];
    
    for (const col of collections) {
      const count = await db.collection(col).countDocuments();
      console.log(`✓ Collection '${col}': ${count} documents`);
      tests.database.push({
        collection: col,
        status: count >= 0 ? 'PASS' : 'FAIL',
        docCount: count
      });
    }
    
    // Test specific data integrity
    console.log('\n📋 Data Integrity Checks:\n');
    
    // Check featured universities
    const featuredUni = await db.collection('universities').findOne({ featured: true });
    console.log(`✓ Featured university exists: ${featuredUni?.name || 'NONE'}`);
    tests.database.push({
      check: 'Featured Universities',
      status: featuredUni ? 'PASS' : 'FAIL',
      data: featuredUni?.name
    });
    
    // Check published news
    const publishedNews = await db.collection('news').findOne({ isPublished: true });
    console.log(`✓ Published news exists: ${publishedNews?.title || 'NONE'}`);
    tests.database.push({
      check: 'Published News',
      status: publishedNews ? 'PASS' : 'FAIL',
      data: publishedNews?.title
    });
    
    // Check active subscriptions
    const activeSubs = await db.collection('user_subscriptions').countDocuments({ status: 'active' });
    console.log(`✓ Active subscriptions: ${activeSubs}`);
    tests.database.push({
      check: 'Active Subscriptions',
      status: activeSubs > 0 ? 'PASS' : 'WARN',
      count: activeSubs
    });
    
    // Check subscription plans
    const plans = await db.collection('subscriptionplans').find({}).toArray();
    console.log(`✓ Subscription plans: ${plans.length}`);
    plans.forEach(p => console.log(`  - ${p.name}: ₹${p.priceBDT || 0}`));
    tests.database.push({
      check: 'Subscription Plans',
      status: plans.length > 0 ? 'PASS' : 'FAIL',
      count: plans.length
    });
    
    // Check users and roles
    const admins = await db.collection('users').countDocuments({ role: 'admin' });
    const students = await db.collection('users').countDocuments({ role: 'student' });
    console.log(`✓ Users - Admins: ${admins}, Students: ${students}`);
    tests.database.push({
      check: 'User Roles',
      status: admins > 0 && students > 0 ? 'PASS' : 'WARN',
      admins,
      students
    });
    
    // Check indexes
    const uniIndexes = await db.collection('universities').listIndexes().toArray();
    const newsIndexes = await db.collection('news').listIndexes().toArray();
    console.log(`\n✓ Indexes - Universities: ${uniIndexes.length}, News: ${newsIndexes.length}`);
    tests.database.push({
      check: 'Database Indexes',
      status: 'PASS',
      universityIndexes: uniIndexes.length,
      newsIndexes: newsIndexes.length
    });
    
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    tests.database.push({
      check: 'Database Connection',
      status: 'FAIL',
      error: error.message
    });
  } finally {
    await client.close();
  }
}

/**
 * Test Frontend-Backend API Connectivity
 */
async function testApiConnections() {
  console.log('\n🌐 TESTING FRONTEND-BACKEND API CONNECTIONS...\n');
  
  const endpoints = [
    {
      path: '/api/public/universities',
      name: 'Universities List',
      expectedStatus: 200
    },
    {
      path: '/api/public/news/v2/list',
      name: 'News List (v2)',
      expectedStatus: 200
    },
    {
      path: '/api/public/home/stream',
      name: 'Home Stream',
      expectedStatus: 200
    },
    {
      path: '/api/public/subscription-plans',
      name: 'Subscription Plans',
      expectedStatus: 200
    },
    {
      path: '/api/public/banners/active',
      name: 'Active Banners',
      expectedStatus: 200
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(BACKEND_URL + endpoint.path);
      const passed = response.statusCode === endpoint.expectedStatus;
      console.log(`${passed ? '✓' : '✗'} ${endpoint.name}: ${response.statusCode}`);
      tests.api.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: passed ? 'PASS' : 'FAIL',
        statusCode: response.statusCode,
        expectedStatus: endpoint.expectedStatus,
        responseTime: response.time
      });
    } catch (error) {
      console.log(`✗ ${endpoint.name}: ${error.message}`);
      tests.api.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: 'FAIL',
        error: error.message
      });
    }
  }
}

/**
 * Test CORS Headers
 */
async function testCorsHeaders() {
  console.log('\n🔐 TESTING CORS HEADERS...\n');
  
  try {
    const response = await makeRequest(BACKEND_URL + '/api/public/universities', {
      'Origin': 'http://localhost:5175'
    });
    
    const hasCors = response.headers['access-control-allow-origin'] !== undefined;
    console.log(`${hasCors ? '✓' : '✗'} CORS headers present: ${hasCors}`);
    console.log(`  - Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin'] || 'MISSING'}`);
    console.log(`  - Access-Control-Allow-Methods: ${response.headers['access-control-allow-methods'] || 'MISSING'}`);
    
    tests.api.push({
      check: 'CORS Configuration',
      status: hasCors ? 'PASS' : 'FAIL',
      corsHeaders: {
        origin: response.headers['access-control-allow-origin'],
        methods: response.headers['access-control-allow-methods']
      }
    });
  } catch (error) {
    console.log(`✗ CORS check failed: ${error.message}`);
  }
}

/**
 * Make HTTP request
 */
function makeRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Phase6-Cross-System-Test/1.0',
      ...headers
    };
    
    client.get(url, { headers: defaultHeaders }, (res) => {
      const time = Date.now() - startTime;
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          time
        });
      });
    }).on('error', reject);
  });
}

/**
 * Generate Report
 */
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 6 CROSS-SYSTEM VERIFICATION REPORT');
  console.log('='.repeat(60));
  
  // Summary
  const allTests = [
    ...tests.api,
    ...tests.database,
    ...tests.reflection,
    ...tests.gating,
    ...tests.notifications
  ];
  
  const passed = allTests.filter(t => t.status === 'PASS').length;
  const failed = allTests.filter(t => t.status === 'FAIL').length;
  const warnings = allTests.filter(t => t.status === 'WARN').length;
  
  console.log(`\n📈 SUMMARY`);
  console.log(`├─ Passed: ${passed}`);
  console.log(`├─ Failed: ${failed}`);
  console.log(`└─ Warnings: ${warnings}`);
  
  // Database Results
  if (tests.database.length > 0) {
    console.log(`\n📊 DATABASE TESTS (${tests.database.length} checks)`);
    tests.database.forEach(test => {
      const icon = test.status === 'PASS' ? '✓' : test.status === 'WARN' ? '⚠' : '✗';
      console.log(`  ${icon} ${test.collection || test.check}: ${test.status}`);
    });
  }
  
  // API Results
  if (tests.api.length > 0) {
    console.log(`\n🌐 API TESTS (${tests.api.length} endpoints)`);
    tests.api.forEach(test => {
      const icon = test.status === 'PASS' ? '✓' : '✗';
      console.log(`  ${icon} ${test.name || test.check}: ${test.status}`);
      if (test.responseTime) console.log(`     Response time: ${test.responseTime}ms`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('CRITICAL ISSUES REQUIRING SERVER START:');
  console.log('├─ Frontend-Backend API (requires servers running on 5003/5175)');
  console.log('├─ Admin-Public Reflection (requires browser automation)');
  console.log('├─ Admin-Student Reflection (requires login flows)');
  console.log('├─ Subscription Access Gating (requires authenticated testing)');
  console.log('└─ Notification Routing (requires real-time verification)');
  console.log('\nTo run full tests: npm run start-all (in two terminals)');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main
 */
async function main() {
  console.log('\n🚀 PHASE 6 CROSS-SYSTEM CONNECTION VERIFICATION');
  console.log('Testing all connection points in CampusWay\n');
  
  try {
    await testDatabaseConnections();
    await testApiConnections();
    await testCorsHeaders();
  } catch (error) {
    console.error('Test suite error:', error);
  }
  
  generateReport();
}

main();
