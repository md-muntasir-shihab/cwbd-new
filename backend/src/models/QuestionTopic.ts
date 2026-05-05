import mongoose, { Document, Schema } from 'mongoose';

export interface ILocalizedText {
    en: string;
    bn: string;
}

export interface IQuestionTopic extends Document {
    category_id: mongoose.Types.ObjectId;
    chapter_id?: mongoose.Types.ObjectId | null;
    group_id: mongoose.Types.ObjectId;
    parent_id?: mongoose.Types.ObjectId | null;
    code: string;
    title: ILocalizedText;
    description?: ILocalizedText;
    order: number;
    isActive: boolean;
    questionCount?: number;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const LocalizedTextSchema = new Schema<ILocalizedText>(
    {
        en: { type: String, default: '', trim: true },
        bn: { type: String, default: '', trim: true },
    },
    { _id: false },
);

const QuestionTopicSchema = new Schema<IQuestionTopic>(
    {
        category_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionCategory',
            required: true,
            index: true,
        },
        chapter_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionChapter',
            default: null,
            index: true,
        },
        group_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionGroup',
            required: true,
            index: true,
        },
        parent_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionTopic',
            default: null,
            index: true,
        },
        code: { type: String, required: true, trim: true, lowercase: true },
        title: { type: LocalizedTextSchema, required: true },
        description: { type: LocalizedTextSchema, default: () => ({ en: '', bn: '' }) },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        questionCount: { type: Number, default: 0 },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true, collection: 'question_topics' },
);

QuestionTopicSchema.index({ category_id: 1, code: 1 }, { unique: true });
QuestionTopicSchema.index({ category_id: 1, parent_id: 1, order: 1 });
QuestionTopicSchema.index({ group_id: 1, isActive: 1 });

export default mongoose.model<IQuestionTopic>('QuestionTopic', QuestionTopicSchema);
