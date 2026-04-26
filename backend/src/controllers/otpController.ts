import { Response as ExpressResponse } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { requestOtp, verifyOtp, RequestOtpInput, VerifyOtpInput } from '../services/otpService';
import OtpVerification from '../models/OtpVerification';
import mongoose from 'mongoose';
import { ResponseBuilder } from '../utils/responseBuilder';

// ---------------------------------------------------------------------------
// requestOtpHandler — POST /api/student/otp/request
// Expects body: { contactType: 'phone' | 'email', contactValue: string }
// Requirements: 1.1, 8.1
// ---------------------------------------------------------------------------

export const requestOtpHandler = async (req: AuthRequest, res: ExpressResponse) => {
    try {
        if (!req.user) return ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Not authenticated'));

        const { contactType, contactValue } = req.body;

        if (!contactType || !['phone', 'email'].includes(contactType)) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'contactType must be "phone" or "email".'));
        }
        if (!contactValue || typeof contactValue !== 'string' || !contactValue.trim()) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'contactValue is required.'));
        }

        const input: RequestOtpInput = {
            userId: String(req.user._id),
            contactType,
            contactValue: contactValue.trim(),
        };

        const result = await requestOtp(input);

        if (!result.success) {
            const code = result.httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'SERVER_ERROR';
            return ResponseBuilder.send(
                res,
                result.httpStatus || 500,
                ResponseBuilder.error(code, result.error || 'OTP request failed', result.cooldownRemaining != null ? { cooldownRemaining: result.cooldownRemaining } : undefined),
            );
        }

        return ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Verification code sent successfully.'));
    } catch (err: any) {
        console.error('requestOtpHandler Error:', err);
        return ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to request OTP.'));
    }
};

// ---------------------------------------------------------------------------
// verifyOtpHandler — POST /api/student/otp/verify
// Expects body: { contactType: 'phone' | 'email', code: string }
// Requirements: 2.1
// ---------------------------------------------------------------------------

export const verifyOtpHandler = async (req: AuthRequest, res: ExpressResponse) => {
    try {
        if (!req.user) return ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Not authenticated'));

        const { contactType, code } = req.body;

        if (!contactType || !['phone', 'email'].includes(contactType)) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'contactType must be "phone" or "email".'));
        }
        if (!code || typeof code !== 'string' || !code.trim()) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Verification code is required.'));
        }

        const input: VerifyOtpInput = {
            userId: String(req.user._id),
            contactType,
            code: code.trim(),
        };

        const result = await verifyOtp(input);

        if (!result.success) {
            const code = result.httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'SERVER_ERROR';
            return ResponseBuilder.send(res, result.httpStatus || 500, ResponseBuilder.error(code, result.error || 'OTP verification failed'));
        }

        return ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Contact verified successfully.'));
    } catch (err: any) {
        console.error('verifyOtpHandler Error:', err);
        return ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to verify OTP.'));
    }
};

// ---------------------------------------------------------------------------
// resendOtpHandler — POST /api/student/otp/resend
// Invalidates previous unverified record, then requests a new OTP.
// Expects body: { contactType: 'phone' | 'email', contactValue: string }
// Requirements: 8.1, 8.2
// ---------------------------------------------------------------------------

export const resendOtpHandler = async (req: AuthRequest, res: ExpressResponse) => {
    try {
        if (!req.user) return ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Not authenticated'));

        const { contactType, contactValue } = req.body;

        if (!contactType || !['phone', 'email'].includes(contactType)) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'contactType must be "phone" or "email".'));
        }
        if (!contactValue || typeof contactValue !== 'string' || !contactValue.trim()) {
            return ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'contactValue is required.'));
        }

        const userOid = new mongoose.Types.ObjectId(String(req.user._id));

        // Invalidate previous unverified records for this user + contactType
        await OtpVerification.deleteMany({
            user_id: userOid,
            contact_type: contactType,
            verified: false,
        });

        // Request a fresh OTP (requestOtp also cleans up, but we explicitly invalidate first)
        const input: RequestOtpInput = {
            userId: String(req.user._id),
            contactType,
            contactValue: contactValue.trim(),
        };

        const result = await requestOtp(input);

        if (!result.success) {
            const code = result.httpStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'SERVER_ERROR';
            return ResponseBuilder.send(
                res,
                result.httpStatus || 500,
                ResponseBuilder.error(code, result.error || 'OTP request failed', result.cooldownRemaining != null ? { cooldownRemaining: result.cooldownRemaining } : undefined),
            );
        }

        return ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Verification code resent successfully.'));
    } catch (err: any) {
        console.error('resendOtpHandler Error:', err);
        return ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to resend OTP.'));
    }
};
