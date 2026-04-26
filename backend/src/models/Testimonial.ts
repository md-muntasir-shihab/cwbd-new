import mongoose, { Schema, Document } from 'mongoose';

export interface ITestimonial extends Document {
    name: string;
    role: string;
    university: string;
    department: string;
    batch: string;
    location: string;
    avatarUrl: string;
    shortQuote: string;
    fullQuote: string;
    rating: number;
    category: 'student' | 'parent' | 'teacher' | 'alumni' | 'other';
    status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
    featured: boolean;
    displayOrder: number;
    sourceType: 'admin' | 'user_submitted' | 'imported';
    linkedUserId: mongoose.Types.ObjectId | null;
    socialProofLabel: string;
    examReference: string;
    slug: string;
    createdBy: mongoose.Types.ObjectId | null;
    reviewedBy: mongoose.Types.ObjectId | null;
    reviewedAt: Date | null;
    rejectionReason: string;
    createdAt: Date;
    updatedAt: Date;
}

const TestimonialSchema = new Schema<ITestimonial>(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        role: { type: String, trim: true, default: 'Student', maxlength: 80 },
        university: { type: String, trim: true, default: '', maxlength: 200 },
        department: { type: String, trim: true, default: '', maxlength: 100 },
        batch: { type: String, trim: true, default: '', maxlength: 20 },
        location: { type: String, trim: true, default: '', maxlength: 100 },
        avatarUrl: { type: String, trim: true, default: '' },
        shortQuote: { type: String, trim: true, default: '', maxlength: 200 },
        fullQuote: { type: String, required: true, trim: true, maxlength: 2000 },
        rating: { type: Number, min: 1, max: 5, default: 5 },
        category: {
            type: String,
            enum: ['student', 'parent', 'teacher', 'alumni', 'other'],
            default: 'student',
        },
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'rejected', 'archived'],
            default: 'approved',
        },
        featured: { type: Boolean, default: false },
        displayOrder: { type: Number, default: 0 },
        sourceType: {
            type: String,
            enum: ['admin', 'user_submitted', 'imported'],
            default: 'admin',
        },
        linkedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        socialProofLabel: { type: String, trim: true, default: '', maxlength: 60 },
        examReference: { type: String, trim: true, default: '', maxlength: 100 },
        slug: { type: String, trim: true, default: '' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        rejectionReason: { type: String, trim: true, default: '', maxlength: 500 },
    },
    { timestamps: true },
);

TestimonialSchema.index({ status: 1, featured: -1, displayOrder: 1 });
TestimonialSchema.index({ slug: 1 }, { sparse: true });
TestimonialSchema.index({ category: 1, status: 1 });

export default mongoose.model<ITestimonial>('Testimonial', TestimonialSchema);
