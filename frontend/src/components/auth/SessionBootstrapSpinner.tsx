/**
 * SessionBootstrapSpinner
 *
 * A full-screen loading indicator shown while the authentication bootstrap
 * is in progress on protected routes. Matches the RouteLoadingFallback visual style.
 *
 * Requirements: 1.4
 */
export function SessionBootstrapSpinner() {
    return (
        <div className="flex min-h-screen items-center justify-center px-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading...
        </div>
    );
}

export default SessionBootstrapSpinner;
