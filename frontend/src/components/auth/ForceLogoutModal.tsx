import { useAuth } from '../../hooks/useAuth';
import { LogOut, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function getForceLogoutMessage(reason: string | null): string {
    switch (reason) {
        case 'SESSION_INVALIDATED':
            return 'Your session was terminated from another device or by an administrator.';
        case 'LEGACY_TOKEN_NOT_ALLOWED':
            return 'Your session format is no longer supported. Please log in again.';
        case 'SESSION_IDLE_TIMEOUT':
            return 'Your session expired due to inactivity.';
        default:
            return 'Your session has ended. Please log in again.';
    }
}

export default function ForceLogoutModal() {
    const { forceLogoutAlert, forceLogoutReason, setForceLogoutAlert } = useAuth();
    const navigate = useNavigate();

    if (!forceLogoutAlert) return null;

    const message = getForceLogoutMessage(forceLogoutReason);

    const handleDismiss = () => {
        setForceLogoutAlert(false);
        const currentPath = window.location.pathname;
        const loginPath = currentPath.startsWith('/__cw_admin__') || currentPath.startsWith('/admin')
            ? '/__cw_admin__/login'
            : currentPath.startsWith('/chairman')
                ? '/chairman/login'
                : '/login';
        navigate(loginPath);
        window.location.href = loginPath;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="bg-red-50 dark:bg-red-900/20 p-6 flex items-center justify-center border-b border-red-100 dark:border-red-900/30">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center relative">
                        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 absolute mx-auto" strokeWidth={2.5} />
                    </div>
                </div>

                <div className="p-6 text-center space-y-3">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Session Terminated</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-medium leading-relaxed">
                        {message}
                    </p>

                    <button
                        onClick={handleDismiss}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-sm hover:shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        <LogOut className="w-5 h-5" />
                        Acknowledge & Sign In
                    </button>

                    <p className="text-xs text-slate-400 dark:text-slate-500 pt-3 flex items-center justify-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        If this wasn't you, please change your password immediately.
                    </p>
                </div>
            </div>
        </div>
    );
}
