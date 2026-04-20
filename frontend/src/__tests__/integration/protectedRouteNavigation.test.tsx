/**
 * Integration tests for protected route navigation
 * Tests the full navigation flow with ProtectedRoute, MemoryRouter, and mocked useAuth.
 *
 * Validates: Requirements 1.1, 1.4, 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

import { ProtectedRoute } from '../../components/auth/ProtectedRoute';

// Simple page components for testing
function DashboardPage() {
    return <div>Dashboard Content</div>;
}

function LoginPage() {
    return <div>Login Page</div>;
}

function ExamPage() {
    return <div>Exam Runner</div>;
}

describe('Protected Route Navigation Integration', () => {
    beforeEach(() => {
        mockUseAuth.mockReset();
    });

    it('redirects unauthenticated user to login from protected route', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Login Page')).toBeInTheDocument();
        expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
    });

    it('authenticated user can access protected route', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });

    it('returnTo parameter is preserved when redirecting unauthenticated user', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

        function CaptureRedirect() {
            const { useLocation } = require('react-router-dom');
            const location = useLocation();
            return <div data-testid="login-redirect">Login Page{location.search}</div>;
        }

        render(
            <MemoryRouter initialEntries={['/exam/abc123']}>
                <Routes>
                    <Route path="/login" element={<CaptureRedirect />} />
                    <Route
                        path="/exam/:examId"
                        element={
                            <ProtectedRoute returnTo={true}>
                                <ExamPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        // The user should be redirected to login with returnTo param
        const loginElement = screen.getByTestId('login-redirect');
        expect(loginElement).toBeInTheDocument();
        expect(loginElement.textContent).toContain('returnTo=%2Fexam%2Fabc123');
        expect(screen.queryByText('Exam Runner')).not.toBeInTheDocument();
    });

    it('session bootstrap shows spinner while loading (simulates page refresh)', () => {
        // Simulate the bootstrap in-progress state (isLoading: true)
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        // Should show loading spinner, not redirect or render content
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });

    it('session bootstrap restores session on page refresh (loading → authenticated)', () => {
        // Start with loading state (bootstrap in progress)
        mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

        const { rerender } = render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        // Initially shows spinner
        expect(screen.getByText('Loading...')).toBeInTheDocument();

        // Bootstrap completes successfully — user is authenticated
        mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

        rerender(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <DashboardPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        // Now shows the protected content
        expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });
});
