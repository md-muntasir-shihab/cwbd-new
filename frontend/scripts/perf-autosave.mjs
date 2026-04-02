#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || 'http://localhost:5175';
const token = process.env.BENCH_TOKEN || '';
const examId = process.env.BENCH_EXAM_ID || '';
const attemptId = process.env.BENCH_ATTEMPT_ID || '';
const questionId = process.env.BENCH_QUESTION_ID || '';
const iterations = Number(process.env.BENCH_ITERATIONS || 50);

if (!token || !examId || !attemptId || !questionId) {
  console.error('Missing required env: BENCH_TOKEN, BENCH_EXAM_ID, BENCH_ATTEMPT_ID, BENCH_QUESTION_ID');
  process.exit(1);
}

const endpoint = `${baseUrl}/api/exams/${examId}/attempt/${attemptId}/answer`;
const samples = [];
let revision = 0;

for (let i = 0; i < iterations; i += 1) {
  const payload = {
    attemptRevision: revision,
    answers: [{ questionId, selectedAnswer: i % 2 === 0 ? 'A' : 'B' }],
  };
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const elapsedMs = performance.now() - started;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Request failed', { status: response.status, body });
    process.exit(1);
  }
  revision = Number(body.attemptRevision || revision + 1);
  samples.push(elapsedMs);
}

samples.sort((a, b) => a - b);
const sum = samples.reduce((acc, value) => acc + value, 0);
const p95 = samples[Math.floor(samples.length * 0.95) - 1] || samples[samples.length - 1] || 0;
const avg = samples.length ? sum / samples.length : 0;

console.log(JSON.stringify({
  endpoint,
  iterations: samples.length,
  avgMs: Number(avg.toFixed(2)),
  p95Ms: Number(p95.toFixed(2)),
}, null, 2));
