import mongoose, { Document, Schema } from 'mongoose';

export interface ILocalizedText {
    en: string;
    bn: string;
}

export interface IQuestionCategory extends Document {
    group_id: mongoose.Types.ObjectId;
    sub_group_id?: mongoose.Types.ObjectId | null;
    parent_id?: mongoose.Types.ObjectId | null;
    code: string;
    title: ILocalizedText;
    description?: ILocalizedText;
    iconUrl?: string;
    order: number;
    isActive: boolean;
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

const QuestionCategorySchema = new Schema<IQuestionCategory>(
    {
        group_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionGroup',
            required: true,
            index: true,
        },
        sub_group_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionSubGroup',
            default: null,
            index: true,
        },
        parent_id: {
            type: Schema.Types.ObjectId,
            ref: 'QuestionCategory',
            default: null,
            index: true,
        },
        code: { type: String, required: true, trim: true, lowercase: true },
        title: { type: LocalizedTextSchema, required: true },
        description: { type: LocalizedTextSchema, default: () => ({ en: '', bn: '' }) },
        iconUrl: { type: String, default: '' },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true, collection: 'question_categories' },
);

// Ensure code uniqueness within a group
QuestionCategorySchema.index({ group_id: 1, code: 1 }, { unique: true });
QuestionCategorySchema.index({ group_id: 1, parent_id: 1, order: 1 });
QuestionCategorySchema.index({ isActive: 1 });

export default mongoose.model<IQuestionCategory>('QuestionCategory', QuestionCategorySchema);
