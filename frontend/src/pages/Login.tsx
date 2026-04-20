import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import ThemeSwitchPro from '../components/ui/ThemeSwitchPro';

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    /**
     * Validates the returnTo parameter to prevent open redirect attacks.
     * Only allows relative paths starting with '/'.
     */
    const getValidReturnTo = (): string | null => {
        const returnTo = searchParams.get('returnTo');
        if (!returnTo) return null;
        // Must start with '/' and must NOT start with '//' (protocol-relative URL)
        if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
            return returnTo;
        }
        return null;
    };

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!identifier.trim() || !password) {
            setError('Email/phone and password are required.');
            return;
        }

        setError('');
        setLoading(true);
        try {
            const response = await login(identifier.trim(), password, { portal: 'student' });
            if (response?.requires2fa) {
                navigate('/otp-verify?from=student', { replace: true });
                return;
            }
            const returnTo = getValidReturnTo();
            navigate(returnTo || '/dashboard', { replace: true });
        } catch (err: any) {
            const message = String(err?.response?.data?.message || 'Login failed. Please try again.');
            if (/admin|chairman/i.test(message)) {
                setError('This login page is for students only.');
            } else {
                setError(message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen cw-bg px-4 py-8">
            <div className="mx-auto flex w-full max-w-lg justify-end">
                <ThemeSwitchPro className="mb-4" />
            </div>
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center justify-center">
                <div className="w-full rounded-3xl border cw-border cw-surface p-6 shadow-xl sm:p-8">
                    <AuthBrandHeader subtitle="Student Portal" />

                    <h1 className="mb-2 text-center text-2xl font-bold cw-text">Student Login</h1>
                    <p className="mb-6 text-center text-sm cw-muted">Sign in to access your admission dashboard.</p>

                    {error ? (
                        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                            {error}
                        </div>
                    ) : null}

                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="identifier" className="mb-1 block text-xs font-semibold uppercase tracking-wide cw-muted">
                                Email / Phone / Username
                            </label>
                            <input
                                id="identifier"
                                type="text"
                                autoComplete="username"
                                value={identifier}
                                onChange={(event) => setIdentifier(event.target.value)}
                                className="input-field h-12 w-full"
                                placeholder="you@example.com"
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <div className="mb-1 flex items-center justify-between">
                                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide cw-muted">
                                    Password
                                </label>
                                <Link to="/student/forgot-password" className="text-xs font-medium text-primary hover:underline">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="input-field h-12 w-full pr-11"
                                    placeholder="********"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 cw-muted hover:cw-text"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="mt-2 text-xs leading-5 cw-muted">
                                Password recovery now goes through admin verification. Use <span className="font-semibold cw-text">Forgot password?</span> to open a contact request with your email and phone number.
                            </p>
                        </div>

                        <button type="submit" disabled={loading} className="btn-primary h-12 w-full justify-center gap-2 rounded-xl">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
