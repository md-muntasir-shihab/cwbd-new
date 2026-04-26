import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GraduationCap, ArrowRight, Loader2 } from 'lucide-react';
import api from '../../services/api';

/* ── Password strength helpers ─────────────────────────────────────────────── */

type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

function computePasswordStrength(password: string): { level: StrengthLevel; score: number; label: string } {
    if (!password) return { level: 'weak', score: 0, label: '' };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 'weak', score: 1, label: 'Weak' };
    if (score <= 2) return { level: 'fair', score: 2, label: 'Fair' };
    if (score <= 3) return { level: 'good', score: 3, label: 'Good' };
    return { level: 'strong', score: 4, label: 'Strong' };
}

const STRENGTH_COLORS: Record<StrengthLevel, string> = {
    weak: 'bg-red-500',
    fair: 'bg-amber-500',
    good: 'bg-blue-500',
    strong: 'bg-emerald-500',
};

const STRENGTH_TEXT_COLORS: Record<StrengthLevel, string> = {
    weak: 'text-red-600 dark:text-red-400',
    fair: 'text-amber-600 dark:text-amber-400',
    good: 'text-blue-600 dark:text-blue-400',
    strong: 'text-emerald-600 dark:text-emerald-400',
};

/* ── Inline validation ─────────────────────────────────────────────────────── */

type FieldErrors = Partial<Record<'fullName' | 'username' | 'email' | 'password', string>>;

function validateForm(data: { fullName: string; username: string; email: string; password: string }): FieldErrors {
    const errors: FieldErrors = {};
    if (!data.fullName.trim()) errors.fullName = 'Full name is required';
    if (!data.username.trim()) errors.username = 'Username is required';
    else if (data.username.trim().length > 200) errors.username = 'Username is too long';
    if (!data.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Invalid email address';
    if (!data.password) errors.password = 'Password is required';
    else if (data.password.length > 500) errors.password = 'Password is too long';
    return errors;
}

const INPUT_CLASS =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500';
const INPUT_ERROR_CLASS =
    'w-full rounded-xl border border-red-400 bg-red-50/40 px-4 py-3 font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-600 dark:bg-red-950/20 dark:text-slate-100 dark:placeholder:text-slate-500';

export default function StudentRegister() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        fullName: '',
    });
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const navigate = useNavigate();

    const passwordStrength = useMemo(() => computePasswordStrength(formData.password), [formData.password]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        // Clear field error on change
        if (fieldErrors[name as keyof FieldErrors]) {
            setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const { name } = e.target;
        setTouched((prev) => new Set(prev).add(name));
        // Validate single field on blur
        const errors = validateForm(formData);
        if (errors[name as keyof FieldErrors]) {
            setFieldErrors((prev) => ({ ...prev, [name]: errors[name as keyof FieldErrors] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError('');

        // Client-side validation
        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            setTouched(new Set(['fullName', 'username', 'email', 'password']));
            return;
        }

        setFieldErrors({});
        setLoading(true);
        try {
            const res = await api.post('/auth/register', {
                ...formData,
                role: 'student',
            });
            toast.success(res.data.message || 'Registration successful! Please check your email.');
            navigate('/login');
        } catch (err: any) {
            const message = err.response?.data?.message || 'Registration failed';
            setServerError(message);
        } finally {
            setLoading(false);
        }
    };

    const showFieldError = (field: keyof FieldErrors) =>
        touched.has(field) && fieldErrors[field] ? fieldErrors[field] : null;

    return (
        <div className="min-h-screen flex bg-white text-slate-900 dark:bg-[#061226] dark:text-slate-100">
            <div className="mx-auto flex flex-1 flex-col justify-center border-r border-slate-100 bg-white/90 px-4 sm:px-6 lg:mx-0 lg:w-[480px] lg:flex-none lg:px-12 xl:w-[560px] xl:px-24 dark:border-slate-800/70 dark:bg-[#061226]/80">
                <div className="mx-auto w-full max-w-sm">
                    <div className="mb-10 text-center lg:text-left">
                        <Link to="/" className="group mb-8 inline-flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 transition-all group-hover:shadow-indigo-500/40">
                                <GraduationCap className="h-6 w-6" />
                            </div>
                            <span className="bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-2xl font-bold text-transparent">
                                CampusWay
                            </span>
                        </Link>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Create an account</h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                            Already have an account?{' '}
                            <Link
                                to="/login"
                                className="font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-cyan-300 dark:hover:text-cyan-200"
                            >
                                Sign in here
                            </Link>
                        </p>
                    </div>

                    {serverError && (
                        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
                            {serverError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4 pb-20 sm:pb-0" noValidate>
                        <div>
                            <label htmlFor="reg-fullName" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Full Name</label>
                            <input
                                id="reg-fullName"
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={showFieldError('fullName') ? INPUT_ERROR_CLASS : INPUT_CLASS}
                                placeholder="John Doe"
                                autoComplete="name"
                                aria-invalid={!!showFieldError('fullName')}
                                aria-describedby={showFieldError('fullName') ? 'err-fullName' : undefined}
                            />
                            {showFieldError('fullName') && (
                                <p id="err-fullName" className="mt-1 text-xs text-red-600 dark:text-red-400">{showFieldError('fullName')}</p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="reg-username" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Username</label>
                            <input
                                id="reg-username"
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={showFieldError('username') ? INPUT_ERROR_CLASS : INPUT_CLASS}
                                placeholder="johndoe123"
                                autoComplete="username"
                                aria-invalid={!!showFieldError('username')}
                                aria-describedby={showFieldError('username') ? 'err-username' : undefined}
                            />
                            {showFieldError('username') && (
                                <p id="err-username" className="mt-1 text-xs text-red-600 dark:text-red-400">{showFieldError('username')}</p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Email address</label>
                            <input
                                id="reg-email"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={showFieldError('email') ? INPUT_ERROR_CLASS : INPUT_CLASS}
                                placeholder="john@example.com"
                                autoComplete="email"
                                aria-invalid={!!showFieldError('email')}
                                aria-describedby={showFieldError('email') ? 'err-email' : undefined}
                            />
                            {showFieldError('email') && (
                                <p id="err-email" className="mt-1 text-xs text-red-600 dark:text-red-400">{showFieldError('email')}</p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
                            <input
                                id="reg-password"
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={showFieldError('password') ? INPUT_ERROR_CLASS : INPUT_CLASS}
                                placeholder="********"
                                autoComplete="new-password"
                                aria-invalid={!!showFieldError('password')}
                                aria-describedby={showFieldError('password') ? 'err-password' : 'password-strength'}
                            />
                            {showFieldError('password') && (
                                <p id="err-password" className="mt-1 text-xs text-red-600 dark:text-red-400">{showFieldError('password')}</p>
                            )}
                            {/* Password strength indicator */}
                            {formData.password.length > 0 && (
                                <div id="password-strength" className="mt-2 space-y-1" aria-live="polite">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4].map((segment) => (
                                            <div
                                                key={segment}
                                                className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${segment <= passwordStrength.score
                                                        ? STRENGTH_COLORS[passwordStrength.level]
                                                        : 'bg-slate-200 dark:bg-slate-700'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    {passwordStrength.label && (
                                        <p className={`text-xs font-medium ${STRENGTH_TEXT_COLORS[passwordStrength.level]}`}>
                                            {passwordStrength.label}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-white/95 dark:bg-[#061226]/95 backdrop-blur py-3 px-4 -mx-4 sm:static sm:bg-transparent sm:dark:bg-transparent sm:backdrop-blur-none sm:py-0 sm:px-0 sm:mx-0">
                            <button
                                type="submit"
                                disabled={loading}
                                className="mt-6 sm:mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-[#061226]"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                                    <>
                                        Create Account <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900/40 lg:flex">
                <div className="absolute inset-0 z-0 bg-cyan-600">
                    <img
                        className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-multiply"
                        src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=2670&auto=format&fit=crop"
                        alt="Campus Library"
                    />
                </div>
                <div className="relative z-10 max-w-3xl p-12 text-white lg:p-24">
                    <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
                        <GraduationCap className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="mb-6 text-4xl font-bold leading-tight lg:text-5xl">Start shaping your tomorrow.</h2>
                    <p className="max-w-2xl text-lg font-medium leading-relaxed text-cyan-100 lg:text-xl">
                        Access hundreds of university programs, manage your applications, and track your progress all in one secure portal.
                    </p>
                </div>
            </div>
        </div>
    );
}
