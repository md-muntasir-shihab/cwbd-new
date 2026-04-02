import dotenv from 'dotenv';

dotenv.config();
declare const fetch: any;

async function run(): Promise<void> {
    const baseUrl = process.env.SECURITY_BASE_URL || 'http://localhost:5003';
    const token = process.env.SECURITY_TOKEN || '';
    const examId = process.env.SECURITY_EXAM_ID || '';
    const attemptId = process.env.SECURITY_ATTEMPT_ID || '';

    if (!token || !examId || !attemptId) {
        console.error('Missing SECURITY_TOKEN, SECURITY_EXAM_ID, or SECURITY_ATTEMPT_ID env.');
        process.exit(1);
    }

    const attackPayloads = [
        {
            name: 'xss-answer-payload',
            endpoint: `${baseUrl}/api/exams/${examId}/attempt/${attemptId}/answer`,
            body: {
                answers: [{ questionId: '000000000000000000000000', selectedAnswer: '<script>alert(1)</script>' }],
                attemptRevision: 0,
            },
        },
        {
            name: 'event-metadata-injection',
            endpoint: `${baseUrl}/api/exams/${examId}/attempt/${attemptId}/event`,
            body: {
                eventType: 'copy_attempt',
                metadata: { raw: "' OR 1=1 --", nested: '<img src=x onerror=alert(1)>' },
            },
        },
    ];

    for (const payload of attackPayloads) {
        const response = await fetch(payload.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload.body),
        });

        const text = await response.text();
        console.log(JSON.stringify({
            test: payload.name,
            status: response.status,
            bodyPreview: text.slice(0, 200),
        }, null, 2));
    }
}

run().catch((err) => {
    console.error('security-payload-smoke failed', err);
    process.exit(1);
});
