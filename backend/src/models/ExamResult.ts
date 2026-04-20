import mongoose, { Schema, Document } from 'mongoose';

export interface IExamResult extends Document {
    exam: mongoose.Types.ObjectId;
    student: mongoose.Types.ObjectId;
    attemptNo: number;
    sourceType?: 'internal_submission' | 'external_import';
    importJobId?: mongoose.Types.ObjectId | null;
    syncStatus?: 'pending' | 'synced' | 'failed';
    profileSyncLogId?: mongoose.Types.ObjectId | null;
    answers: {
        question: mongoose.Types.ObjectId;
        questionType: 'mcq' | 'written';
        selectedAnswer: string;
        writtenAnswerUrl?: string;
        isCorrect: boolean;
        timeTaken: number;
        marks?: number;
        marksObtained?: number;
        explanation?: string;
        correctWrongIndicator?: 'correct' | 'wrong' | 'unanswered';
        topic?: string;
    }[];
    detailedAnswers?: {
        question: mongoose.Types.ObjectId;
        questionType: 'mcq' | 'written';
        selectedAnswer: string;
        isCorrect: boolean;
        marks: number;
        marksObtained: number;
        explanation: string;
        correctWrongIndicator: 'correct' | 'wrong' | 'unanswered';
        topic: string;
    }[];
    performanceSummary?: {
        totalScore: number;
        percentage: number;
        strengths: string[];
        weaknesses: string[];
    };
    totalMarks: number;
    obtainedMarks: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    percentage: number;
    rank?: number;
    serialId?: string;
    rollNumber?: string;
    registrationNumber?: string;
    admitCardNumber?: string;
    attendanceStatus?: string;
    passFail?: string;
    resultNote?: string;
    profileUpdateNote?: string;
    examCenterName?: string;
    examCenterCode?: string;
    subjectMarks?: Array<Record<string, unknown>>;
    pointsEarned: number;
    timeTaken: number; // seconds
    deviceInfo: string;
    browserInfo: string;
    ipAddress: string;
    tabSwitchCount: number;
    submittedAt: Date;
    isAutoSubmitted: boolean;
    cheat_flags?: { reason: string; timestamp: Date }[];
    createdAt: Date;

    status: 'submitted' | 'evaluated';
}

const ExamResultSchema = new Schema<IExamResult>({
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNo: { type: Number, default: 1 },
    sourceType: { type: String, enum: ['internal_submission', 'external_import'], default: 'internal_submission' },
    importJobId: { type: Schema.Types.ObjectId, ref: 'ExamImportJob', default: null },
    syncStatus: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    profileSyncLogId: { type: Schema.Types.ObjectId, ref: 'ExamProfileSyncLog', default: null },
    answers: [{
        question: { type: Schema.Types.ObjectId, ref: 'Question' },
        questionType: { type: String, enum: ['mcq', 'written'], required: true, default: 'mcq' },
        selectedAnswer: String,
        writtenAnswerUrl: String,
        isCorrect: Boolean,
        timeTaken: Number,
        marks: Number,
        marksObtained: Number,
        explanation: String,
        correctWrongIndicator: { type: String, enum: ['correct', 'wrong', 'unanswered'] },
        topic: String,
    }],
    detailedAnswers: [{
        question: { type: Schema.Types.ObjectId, ref: 'Question' },
        questionType: { type: String, enum: ['mcq', 'written'] },
        selectedAnswer: String,
        isCorrect: Boolean,
        marks: Number,
        marksObtained: Number,
        explanation: String,
        correctWrongIndicator: { type: String, enum: ['correct', 'wrong', 'unanswered'] },
        topic: String,
    }],
    performanceSummary: {
        type: {
            totalScore: Number,
            percentage: Number,
            strengths: [String],
            weaknesses: [String],
        },
        default: undefined,
    },
    totalMarks: { type: Number, required: true },
    obtainedMarks: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    rank: Number,
    serialId: { type: String, default: '' },
    rollNumber: { type: String, default: '' },
    registrationNumber: { type: String, default: '' },
    admitCardNumber: { type: String, default: '' },
    attendanceStatus: { type: String, default: '' },
    passFail: { type: String, default: '' },
    resultNote: { type: String, default: '' },
    profileUpdateNote: { type: String, default: '' },
    examCenterName: { type: String, default: '' },
    examCenterCode: { type: String, default: '' },
    subjectMarks: { type: [Schema.Types.Mixed], default: [] } as any,
    pointsEarned: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    deviceInfo: String,
    browserInfo: String,
    ipAddress: String,
    tabSwitchCount: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    isAutoSubmitted: { type: Boolean, default: false },
    cheat_flags: [{
        reason: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],

    status: { type: String, enum: ['submitted', 'evaluated'], default: 'evaluated' },
}, { timestamps: true, collection: 'student_results' });

ExamResultSchema.index({ exam: 1, student: 1, attemptNo: 1 }, { unique: true });
ExamResultSchema.index({ exam: 1, obtainedMarks: -1 });
ExamResultSchema.index({ student: 1, submittedAt: -1 });

export default mongoose.model<IExamResult>('ExamResult', ExamResultSchema);
