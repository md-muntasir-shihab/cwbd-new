import { Router } from "express";
import type { AuthRequest } from "../../middlewares/auth";
import { requireAuth, requireAuthStudent } from "../../middlewares/auth";
import { examAutoSaveLimit, examSessionStartLimit, examSubmitLimit } from "../../middlewares/examRateLimit";
import { antiCheatSignalLimit } from "../../middlewares/securityRateLimit";
import {
  getExamAttemptResult,
  getExamAttemptSolutions,
  getExamAttemptState,
  saveExamAttemptAnswer,
  startExam,
  submitExamAttempt,
  getDetailedExamResult,
} from "../../controllers/examController";
import { processSignalController } from "../../controllers/antiCheatController";
import { generateAnswersPdf, generateQuestionsPdf, generateSolutionsPdf } from "../../controllers/examPdfController";
import { validateBody } from "../../validators/validateBody";
import { examSubmitSchema, antiCheatSignalSchema } from "../../validators/examSchemas";

export const studentExamRoutes = Router();

function withLegacyExamId(req: AuthRequest, examId: string): AuthRequest {
  const attemptId = String(req.params.attemptId || req.params.sessionId || "");
  const proxiedReq = Object.create(req) as AuthRequest;
  proxiedReq.params = {
    ...req.params,
    id: examId,
    examId,
    attemptId,
  };
  return proxiedReq;
}

studentExamRoutes.post("/exams/:examId/sessions/start", requireAuth, requireAuthStudent, examSessionStartLimit, async (req, res) => {
  await startExam(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.get("/exams/:examId/sessions/:sessionId/questions", requireAuth, requireAuthStudent, async (req, res) => {
  await getExamAttemptState(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.post("/exams/:examId/sessions/:sessionId/answers", requireAuth, requireAuthStudent, examAutoSaveLimit, async (req, res) => {
  await saveExamAttemptAnswer(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.post("/exams/:examId/sessions/:sessionId/submit", requireAuth, requireAuthStudent, examSubmitLimit, validateBody(examSubmitSchema), async (req, res) => {
  await submitExamAttempt(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.get("/exams/:examId/sessions/:sessionId/result", requireAuth, requireAuthStudent, async (req, res) => {
  await getExamAttemptResult(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.get("/exams/:examId/sessions/:sessionId/solutions", requireAuth, requireAuthStudent, async (req, res) => {
  await getExamAttemptSolutions(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.get("/exams/:examId/detailed-result", requireAuth, requireAuthStudent, async (req, res) => {
  await getDetailedExamResult(withLegacyExamId(req, String(req.params.examId || "")), res);
});

studentExamRoutes.get("/exams/:examId/pdf/questions", requireAuth, requireAuthStudent, generateQuestionsPdf);
studentExamRoutes.get("/exams/:examId/pdf/solutions", requireAuth, requireAuthStudent, generateSolutionsPdf);
studentExamRoutes.get("/exams/:examId/sessions/:sessionId/pdf/answers", requireAuth, requireAuthStudent, generateAnswersPdf);

// Anti-cheat signal processing (Req 7.1, 7.2, 7.6, 7.8)
studentExamRoutes.post(
  "/exams/:examId/sessions/:sessionId/anti-cheat/signal",
  requireAuth,
  requireAuthStudent,
  antiCheatSignalLimit,
  validateBody(antiCheatSignalSchema),
  async (req, res) => {
    await processSignalController(req, res);
  },
);
