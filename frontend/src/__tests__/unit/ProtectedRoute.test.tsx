/**
 * Unit tests for ProtectedRoute component
 * Validates: Requirements 1.1, 1.2, 1.4, 2.3, 2.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

// Track Navigate calls
const mockNavigate = vi.fn();
const mockUseLocation = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        Navigate: (props: { to: string; replace?: boolean }) => {
            mockNavigate(props);
            return null;
        },
        useLocation: () => mockUseLocation(),
    };
});

// Import component after mocks
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';

describe('ProtectedRoute', () => {
    beforeEach(() => {
        mockUseAuth.mockReset();
        mockNavigate.mockReset();
        mockUseLocation.mockReturnValue({ pathname: '/dashboard', search: '' });
    });

    it('renders children when authenticated and not loading', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

        render(
            <ProtectedRoute>
                <div>Protected Content</div>
            </ProtectedRoute>
        );

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('renders SessionBootstrapSpinner when isLoading is true', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

        render(
            <ProtectedRoute>
                <div>Protected Content</div>
            </ProtectedRoute>
        );

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('redirects to login when not authenticated and not loading', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

        render(
            <ProtectedRoute>
                <div>Protected Content</div>
            </ProtectedRoute>
        );

        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(mockNavigate).toHaveBeenCalledWith(
            expect.objectContaining({ to: '/login', replace: true })
        );
    });

    it('includes returnTo query param when returnTo prop is true', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
        mockUseLocation.mockReturnValue({ pathname: '/exam/abc123', search: '?tab=overview' });

        render(
            <ProtectedRoute returnTo={true}>
                <div>Protected Content</div>
            </ProtectedRoute>
        );

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.objectContaining({
                to: '/login?returnTo=%2Fexam%2Fabc123%3Ftab%3Doverview',
                replace: true,
            })
        );
    });
});
