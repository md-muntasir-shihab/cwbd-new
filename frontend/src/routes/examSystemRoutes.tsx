/**
 * Exam System Routes — lazy-loaded route definitions for all new admin and student pages.
 *
 * Admin routes are mounted under /__cw_admin__/exam-center/ prefix.
 * Student routes are mounted under /student/ prefix.
 *
 * @requirements 17.1, 17.2, 17.3
 */
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

/* ─── Admin Exam System Pages (lazy-loaded) ─────────────────────────────────── */

const HierarchyManager = lazy(
    () => import('../pages/admin/exam-center/HierarchyManager'),
);
const QuestionBankManager = lazy(
    () => import('../pages/admin/question-bank/QuestionBankManager'),
);
const ExamBuilderWizard = lazy(
    () => import('../pages/admin/exam-center/ExamBuilderWizard'),
);
const WrittenGradingInterface = lazy(
    () => import('../pages/admin/exam-center/WrittenGradingInterface'),
);
const AntiCheatReport = lazy(
    () => import('../pages/admin/exam-center/AntiCheatReport'),
);
const NotificationManagement = lazy(
    () => import('../pages/admin/exam-center/NotificationManagement'),
);
/* ─── Student Exam System Pages (lazy-loaded) ───────────────────────────────── */

const ExamRunner = lazy(
    () => import('../pages/student/exam/ExamRunner'),
);
const ExamResultView = lazy(
    () => import('../pages/student/exam/ExamResultView'),
);
const LeaderboardView = lazy(
    () => import('../pages/student/exam/LeaderboardView'),
);
const AnalyticsDashboard = lazy(
    () => import('../pages/student/analytics/AnalyticsDashboard'),
);
const PracticeSession = lazy(
    () => import('../pages/student/practice/PracticeSession'),
);
const MistakeVaultView = lazy(
    () => import('../pages/student/practice/MistakeVaultView'),
);
const BattleArena = lazy(
    () => import('../pages/student/battle/BattleArena'),
);
const StudyRoutinePlanner = lazy(
    () => import('../pages/student/routine/StudyRoutinePlanner'),
);
const ExamPackageListing = lazy(
    () => import('../pages/student/packages/ExamPackageListing'),
);
const ExaminerDashboard = lazy(
    () => import('../pages/student/examiner/ExaminerDashboard'),
);

/* ─── Admin Routes ──────────────────────────────────────────────────────────── */

export const examSystemAdminRoutes: RouteObject[] = [
    // Hierarchy management
    {
        path: 'exam-center/hierarchy',
        element: <HierarchyManager />,
    },
    // Question bank management (exam system enhanced version)
    {
        path: 'exam-center/question-bank',
        element: <QuestionBankManager />,
    },
    // Exam builder wizard
    {
        path: 'exam-center/exam-builder',
        element: <ExamBuilderWizard />,
    },
    {
        path: 'exam-center/exam-builder/new',
        element: <ExamBuilderWizard />,
    },
    {
        path: 'exam-center/exam-builder/:examId/edit',
        element: <ExamBuilderWizard />,
    },
    // Written/CQ grading
    {
        path: 'exam-center/grading',
        element: <WrittenGradingInterface />,
    },
    {
        path: 'exam-center/grading/:examId',
        element: <WrittenGradingInterface />,
    },
    // Anti-cheat reports
    {
        path: 'exam-center/anti-cheat',
        element: <AntiCheatReport />,
    },
    // Notification management
    {
        path: 'exam-center/notifications',
        element: <NotificationManagement />,
    },
];

/* ─── Student Routes ────────────────────────────────────────────────────────── */

export const examSystemStudentRoutes: RouteObject[] = [
    // Exam runner
    {
        path: 'exam/:examId',
        element: <ExamRunner />,
    },
    // Exam result
    {
        path: 'exam/:examId/result',
        element: <ExamResultView />,
    },
    // Leaderboard
    {
        path: 'exam/:examId/leaderboard',
        element: <LeaderboardView />,
    },
    // Analytics dashboard
    {
        path: 'analytics',
        element: <AnalyticsDashboard />,
    },
    // Practice session
    {
        path: 'practice/:topicId',
        element: <PracticeSession />,
    },
    // Mistake vault
    {
        path: 'mistake-vault',
        element: <MistakeVaultView />,
    },
    // Battle arena
    {
        path: 'battle',
        element: <BattleArena />,
    },
    // Study routine planner
    {
        path: 'routine',
        element: <StudyRoutinePlanner />,
    },
    // Exam packages
    {
        path: 'packages',
        element: <ExamPackageListing />,
    },
    // Examiner dashboard
    {
        path: 'examiner',
        element: <ExaminerDashboard />,
    },
];
