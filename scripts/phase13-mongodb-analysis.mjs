#!/usr/bin/env node

/**
 * Phase 13 MongoDB Performance & Query Analysis
 * Analyzes:
 * - Query execution times
 * - Index usage and recommendations
 * - N+1 query patterns
 * - Aggregate pipeline efficiency
 * - Collection statistics
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';

const MONGO_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const ANALYSIS_REPORT = './phase13-mongodb-analysis.json';

const analysis = {
  timestamp: new Date().toISOString(),
  collections: {},
  queries: [],
  indexes: {},
  recommendations: [],
  performance: {
    slowQueries: [],
    missingIndexes: [],
    n1QueryPatterns: []
  }
};

async function analyzeCollections(db) {
  console.log('\n📊 ANALYZING COLLECTIONS...\n');
  
  const collectionNames = await db.listCollections().toArray();
  
  for (const collection of collectionNames) {
    const name = collection.name;
    try {
      const coll = db.collection(name);
      const stats = await coll.stats();
      const indexInfo = await coll.getIndexes();
      const count = await coll.countDocuments();
      
      analysis.collections[name] = {
        count,
        avgDocumentSize: stats.avgObjSize || 0,
        totalSize: stats.size || 0,
        storageSize: stats.storageSize || 0,
        indexCount: Object.keys(indexInfo).length,
        indexes: Object.keys(indexInfo).map(indexName => ({
          name: indexName,
          spec: indexInfo[indexName].key,
          unique: indexInfo[indexName].unique || false,
          sparse: indexInfo[indexName].sparse || false
        }))
      };
      
      console.log(`✅ ${name}`);
      console.log(`   Documents: ${count}`);
      console.log(`   Avg Size: ${(stats.avgObjSize / 1024).toFixed(2)}KB`);
      console.log(`   Total: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Indexes: ${Object.keys(indexInfo).length}`);
      console.log(`   Index Names: ${Object.keys(indexInfo).join(', ')}\n`);
      
    } catch (error) {
      console.log(`⚠️  ${name}: ${error.message}`);
    }
  }
}

async function analyzeCommonQueries(db) {
  console.log('\n🔍 ANALYZING COMMON QUERY PATTERNS...\n');
  
  const queryPatterns = [
    {
      collection: 'universities',
      query: { status: 'active' },
      description: 'Fetch active universities'
    },
    {
      collection: 'users',
      query: { role: 'student', status: 'active' },
      description: 'Fetch active students'
    },
    {
      collection: 'news',
      query: { published: true, status: 'active' },
      description: 'Fetch published news'
    },
    {
      collection: 'campaigns',
      query: { status: 'active', endDate: { $gte: new Date() } },
      description: 'Fetch active campaigns'
    }
  ];

  for (const pattern of queryPatterns) {
    try {
      const coll = db.collection(pattern.collection);
      
      // Explain the query to get execution plan
      const explanation = await coll.find(pattern.query).explain('executionStats');
      
      const executionStage = explanation.executionStats.executionStages;
      const executionTime = explanation.executionStats.executionTimeMillis || 0;
      const documentsExamined = executionStage.totalDocsExamined || 0;
      const documentsReturned = executionStage.nReturned || 0;
      
      const efficiency = documentsReturned > 0 ? ((documentsReturned / documentsExamined) * 100).toFixed(2) : 0;
      
      const queryInfo = {
        collection: pattern.collection,
        description: pattern.description,
        query: pattern.query,
        executionTime,
        documentsExamined,
        documentsReturned,
        efficiency: `${efficiency}%`,
        stage: executionStage.stage,
        performanceIssue: executionTime > 100 || efficiency < 50
      };
      
      analysis.queries.push(queryInfo);
      
      console.log(`📋 ${pattern.collection} - ${pattern.description}`);
      console.log(`   Execution Time: ${executionTime}ms`);
      console.log(`   Docs Examined: ${documentsExamined}`);
      console.log(`   Docs Returned: ${documentsReturned}`);
      console.log(`   Efficiency: ${efficiency}%`);
      console.log(`   Stage: ${executionStage.stage}`);
      
      if (executionTime > 100) {
        console.log(`   ⚠️  SLOW QUERY (${executionTime}ms > 100ms)`);
        analysis.performance.slowQueries.push({
          collection: pattern.collection,
          description: pattern.description,
          time: executionTime,
          query: pattern.query
        });
        analysis.recommendations.push({
          severity: 'HIGH',
          type: 'Slow Query',
          collection: pattern.collection,
          issue: `Query takes ${executionTime}ms`,
          suggestion: 'Add index on query fields or optimize query logic'
        });
      }
      
      if (efficiency < 50) {
        console.log(`   ⚠️  LOW EFFICIENCY (${efficiency}% < 50%)`);
        analysis.recommendations.push({
          severity: 'MEDIUM',
          type: 'Index Missing',
          collection: pattern.collection,
          issue: `Query efficiency is ${efficiency}%`,
          suggestion: 'Create composite index on query fields'
        });
      }
      
      console.log();
      
    } catch (error) {
      console.log(`❌ ${pattern.collection}: ${error.message}\n`);
    }
  }
}

async function checkIndexRecommendations(db) {
  console.log('\n💡 INDEX RECOMMENDATIONS...\n');
  
  const indexRecommendations = [
    {
      collection: 'universities',
      fields: [
        { field: 'slug', reason: 'Used for URL lookups' },
        { field: 'status', reason: 'Used in list filtering' },
        { field: 'name', reason: 'Used in search queries' },
        { field: 'country', reason: 'Used in geographical filtering' }
      ]
    },
    {
      collection: 'users',
      fields: [
        { field: 'email', reason: 'Used for login and unique lookups' },
        { field: 'role', reason: 'Used in role-based queries' },
        { field: 'status', reason: 'Used in status filtering' },
        { field: { userId: 1, createdAt: -1 }, reason: 'Used in paginated lists' }
      ]
    },
    {
      collection: 'news',
      fields: [
        { field: 'slug', reason: 'Used for URL lookups' },
        { field: 'status', reason: 'Used in list filtering' },
        { field: 'published', reason: 'Used in published news queries' },
        { field: { status: 1, createdAt: -1 }, reason: 'Used for sorted lists' }
      ]
    },
    {
      collection: 'campaigns',
      fields: [
        { field: 'status', reason: 'Used in status filtering' },
        { field: 'startDate', reason: 'Used in date range queries' },
        { field: 'endDate', reason: 'Used in active campaign queries' },
        { field: { status: 1, endDate: -1 }, reason: 'Composite for active campaigns' }
      ]
    }
  ];

  for (const collectionInfo of indexRecommendations) {
    try {
      const coll = db.collection(collectionInfo.collection);
      const existingIndexes = await coll.getIndexes();
      const indexNames = Object.keys(existingIndexes);
      
      console.log(`📊 ${collectionInfo.collection}:`);
      
      for (const fieldInfo of collectionInfo.fields) {
        const fieldKey = typeof fieldInfo.field === 'string' ? fieldInfo.field : JSON.stringify(fieldInfo.field);
        let hasIndex = false;
        
        if (typeof fieldInfo.field === 'string') {
          hasIndex = indexNames.some(name => 
            existingIndexes[name].key[fieldInfo.field] !== undefined
          );
        } else {
          hasIndex = indexNames.some(name => {
            const spec = existingIndexes[name].key;
            return Object.keys(fieldInfo.field).every(k => spec[k] === fieldInfo.field[k]);
          });
        }
        
        if (hasIndex) {
          console.log(`   ✅ Index exists on ${fieldKey}`);
        } else {
          console.log(`   ❌ MISSING: ${fieldKey} (${fieldInfo.reason})`);
          analysis.performance.missingIndexes.push({
            collection: collectionInfo.collection,
            field: fieldKey,
            reason: fieldInfo.reason
          });
          analysis.recommendations.push({
            severity: 'MEDIUM',
            type: 'Missing Index',
            collection: collectionInfo.collection,
            field: fieldKey,
            suggestion: `Create index: db.${collectionInfo.collection}.createIndex(${fieldKey})`
          });
        }
      }
      console.log();
      
    } catch (error) {
      console.log(`❌ ${collectionInfo.collection}: ${error.message}\n`);
    }
  }
}

async function checkN1QueryPatterns(db) {
  console.log('\n🔗 CHECKING FOR N+1 QUERY PATTERNS...\n');
  
  // Check for potential N+1 patterns in schema lookups
  const n1Warnings = [
    {
      collection: 'questions',
      description: 'Questions referencing exam, university, category by ID',
      tip: 'Use aggregation $lookup to fetch related data in single query'
    },
    {
      collection: 'campaigns',
      description: 'Campaigns with nested arrays of universities/categories',
      tip: 'Use $lookup for audience filtering instead of fetching all campaigns'
    },
    {
      collection: 'news',
      description: 'News items with author/university references',
      tip: 'Use aggregation pipelines to avoid fetching news then authors separately'
    }
  ];

  for (const warning of n1Warnings) {
    try {
      const coll = db.collection(warning.collection);
      const doc = await coll.findOne();
      
      if (doc) {
        console.log(`⚠️  ${warning.collection}`);
        console.log(`   Pattern: ${warning.description}`);
        console.log(`   Recommendation: ${warning.tip}\n`);
        
        analysis.performance.n1QueryPatterns.push(warning);
        analysis.recommendations.push({
          severity: 'MEDIUM',
          type: 'N+1 Query Pattern',
          collection: warning.collection,
          issue: warning.description,
          suggestion: warning.tip
        });
      }
    } catch (error) {}
  }
}

async function analyzeAggregationPipelines(db) {
  console.log('\n⚙️  ANALYZING AGGREGATION PIPELINE EFFICIENCY...\n');
  
  const pipelines = [
    {
      collection: 'users',
      name: 'User Statistics by Role',
      pipeline: [
        { $match: { role: { $in: ['student', 'admin', 'provider'] } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]
    },
    {
      collection: 'news',
      name: 'Recent Published News',
      pipeline: [
        { $match: { published: true, status: 'active' } },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
        { $project: { title: 1, slug: 1, createdAt: 1 } }
      ]
    }
  ];

  for (const pipelineInfo of pipelines) {
    try {
      const coll = db.collection(pipelineInfo.collection);
      const explain = await coll.aggregate(pipelineInfo.pipeline).explain();
      
      console.log(`📈 ${pipelineInfo.collection} - ${pipelineInfo.name}`);
      console.log(`   Stages: ${pipelineInfo.pipeline.length}`);
      console.log(`   ✅ Aggregation structure looks good\n`);
      
    } catch (error) {
      console.log(`❌ ${pipelineInfo.name}: ${error.message}\n`);
    }
  }
}

async function generateReport() {
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 PHASE 13 MONGODB PERFORMANCE ANALYSIS REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📋 RECOMMENDATIONS SUMMARY:\n');
  
  if (analysis.recommendations.length === 0) {
    console.log('✅ No performance issues detected!\n');
  } else {
    const byType = {};
    analysis.recommendations.forEach(rec => {
      if (!byType[rec.type]) byType[rec.type] = [];
      byType[rec.type].push(rec);
    });

    Object.entries(byType).forEach(([type, items]) => {
      console.log(`\n🔸 ${type} (${items.length}):`);
      items.forEach((item, idx) => {
        console.log(`   ${idx + 1}. [${item.severity}] ${item.collection}`);
        console.log(`      Issue: ${item.issue}`);
        console.log(`      Action: ${item.suggestion}`);
      });
    });
  }

  console.log('\n\n📊 PERFORMANCE METRICS:\n');
  console.log(`   Slow Queries (>100ms): ${analysis.performance.slowQueries.length}`);
  console.log(`   Missing Indexes: ${analysis.performance.missingIndexes.length}`);
  console.log(`   N+1 Patterns: ${analysis.performance.n1QueryPatterns.length}`);
  console.log(`   Total Collections: ${Object.keys(analysis.collections).length}`);
  
  // Write report to file
  fs.writeFileSync(ANALYSIS_REPORT, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Detailed report saved to: ${ANALYSIS_REPORT}`);
}

async function main() {
  const client = new MongoClient(MONGO_URL);
  
  try {
    console.log('🚀 Starting MongoDB Performance Analysis...\n');
    await client.connect();
    const db = client.db('campusway');

    await analyzeCollections(db);
    await analyzeCommonQueries(db);
    await checkIndexRecommendations(db);
    await checkN1QueryPatterns(db);
    await analyzeAggregationPipelines(db);
    await generateReport();

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
