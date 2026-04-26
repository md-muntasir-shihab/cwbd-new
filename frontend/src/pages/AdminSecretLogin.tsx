import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import ThemeSwitchPro from '../components/ui/ThemeSwitchPro';

const ADMIN_ROLES = new Set(['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent']);

export default function AdminSecretLoginPage() {
    const navigate = useNavigate();
    const { login, user, isAuthenticated, isLoading } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isLoading && isAuthenticated && user && ADMIN_ROLES.has(user.role)) {
        return <Navigate to={user.mustChangePassword ? "/__cw_admin__/settings/admin-profile" : "/__cw_admin__/dashboard"} replace />;
    }

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const response = await login(identifier.trim(), password, { portal: 'admin' });
            if (response?.requires2fa) {
                navigate('/otp-verify?from=admin', { replace: true });
                return;
            }
            navigate(response?.user?.mustChangePassword ? '/__cw_admin__/settings/admin-profile' : '/__cw_admin__/dashboard', { replace: true });
        } catch (err: any) {
            setError(String(err?.response?.data?.message || 'Admin login failed'));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen cw-bg px-4 py-8">
            <div className="mx-auto flex w-full max-w-lg justify-end">
                <ThemeSwitchPro className="mb-4" />
            </div>
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center justify-center">
                <div className="w-full rounded-3xl border cw-border cw-surface p-6 shadow-xl sm:p-8">
                    <AuthBrandHeader subtitle="Admin Portal" />
                    <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
                        Secret route enabled. This page is intentionally not linked from public navigation.
                    </div>

                    {error ? (
                        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                            {error}
                        </div>
                    ) : null}

                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide cw-muted">Admin Email / Username</label>
                            <input
                                id="identifier"
                                name="identifier"
                                value={identifier}
                                onChange={(event) => setIdentifier(event.target.value)}
                                className="input-field h-12 w-full"
                                placeholder="admin@example.com"
                                autoComplete="username"
                                required
                                disabled={submitting}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide cw-muted">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="input-field h-12 w-full"
                                placeholder="********"
                                autoComplete="current-password"
                                required
                                disabled={submitting}
                            />
                        </div>
                        <button type="submit" disabled={submitting} className="btn-primary h-12 w-full justify-center gap-2 rounded-xl">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                            {submitting ? 'Signing in...' : 'Sign In to Admin Panel'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm cw-muted">
                        Back to <Link to="/" className="font-semibold text-primary hover:underline">home</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
