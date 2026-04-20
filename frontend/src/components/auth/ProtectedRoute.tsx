import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { SessionBootstrapSpinner } from './SessionBootstrapSpinner';

/**
 * ProtectedRoute
 *
 * A wrapper component that gates access to protected routes based on authentication state.
 * Implements the Session Bootstrap Gate Pattern to ensure no content renders or redirects
 * occur until the authentication bootstrap is complete.
 *
 * Requirements: 1.1, 1.2, 1.4, 2.3, 2.4
 */
interface ProtectedRouteProps {
    children: React.ReactNode;
    redirectTo?: string;          // default: '/login'
    returnTo?: boolean;           // if true, append ?returnTo=<current path>
}

export function ProtectedRoute({
    children,
    redirectTo = '/login',
    returnTo = false
}: ProtectedRouteProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    // Show spinner while bootstrap is in progress
    if (isLoading) {
        return <SessionBootstrapSpinner />;
    }

    // Redirect to login when not authenticated
    if (!isAuthenticated) {
        const target = returnTo
            ? `${redirectTo}?returnTo=${encodeURIComponent(location.pathname + location.search)}`
            : redirectTo;
        return <Navigate to={target} replace />;
    }

    // Render children when authenticated and not loading
    return <>{children}</>;
}

export default ProtectedRoute;
