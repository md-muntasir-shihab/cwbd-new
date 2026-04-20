import { Schema, model } from "mongoose";

const examQuestionSchema = new Schema(
  {
    examId: { type: String, required: true, index: true },
    fromBankQuestionId: String,
    orderIndex: Number,
    question_en: String,
    question_bn: String,
    questionImageUrl: String,
    options: [{ key: String, text_en: String, text_bn: String, imageUrl: String }],
    correctKey: { type: String, enum: ["A", "B", "C", "D", "E", "F", "G", "H"] },
    explanation_en: String,
    explanation_bn: String,
    explanationImageUrl: String,
    marks: Number,
    negativeMarks: Number,
    topic: String,
    difficulty: String,
    tags: [String]
  },
  { timestamps: true }
);

examQuestionSchema.index({ fromBankQuestionId: 1 });

export const ExamQuestionModel = model("exam_questions", examQuestionSchema);
