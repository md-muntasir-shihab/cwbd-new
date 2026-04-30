import { lazy, type ComponentType } from 'react';

type NamedComponentModule = Record<string, ComponentType<any>>;

function lazyNamed<TModule extends NamedComponentModule, TKey extends keyof TModule>(
    loader: () => Promise<TModule>,
    key: TKey,
) {
    return lazy(async () => {
        const module = await loader();
        return { default: module[key] };
    });
}

export const UniversitiesPage = lazy(() => import('./pages/Universities'));
export const UniversityDetailsPage = lazy(() => import('./pages/UniversityDetails'));
export const UniversityCategoryBrowsePage = lazy(() => import('./pages/UniversityCategoryBrowse'));
export const UniversityClusterBrowsePage = lazy(() => import('./pages/UniversityClusterBrowse'));
export const NewsPage = lazy(() => import('./pages/News'));
export const SingleNewsPage = lazy(() => import('./pages/SingleNews'));
export const ExamsListPage = lazyNamed(() => import('./pages/exams/ExamsListPage'), 'ExamsListPage');
export const ExamRunnerPage = lazyNamed(() => import('./pages/exams/ExamRunnerPage'), 'ExamRunnerPage');
export const ExamResultPage = lazyNamed(() => import('./pages/exams/ExamResultPage'), 'ExamResultPage');
export const ExamSolutionsPage = lazyNamed(() => import('./pages/exams/ExamSolutionsPage'), 'ExamSolutionsPage');
export const ResourcesPage = lazy(() => import('./pages/Resources'));
export const ResourceDetail = lazy(() => import('./pages/ResourceDetail'));
export const ContactPage = lazy(() => import('./pages/Contact'));
export const TestimonialsPage = lazy(() => import('./pages/TestimonialsPage'));
export const HelpCenterPage = lazy(() => import('./pages/HelpCenter'));
export const HelpArticlePage = lazy(() => import('./pages/HelpArticle'));
export const SubscriptionPlansPage = lazy(() => import('./pages/SubscriptionPlans'));
export const SubscriptionPlanDetailPage = lazy(() => import('./pages/SubscriptionPlanDetail'));
export const SubscriptionPlanCheckoutPage = lazy(() => import('./pages/SubscriptionPlanCheckout'));
export const LegalPageView = lazy(() => import('./pages/LegalPageView'));
export const StaticContentPage = lazy(() => import('./components/layout/StaticContentPage'));
export const ProfilePage = lazy(() => import('./pages/Profile'));
export const CertificateVerifyPage = lazy(() => import('./pages/CertificateVerify'));
export const ChairmanLoginPage = lazy(() => import('./pages/chairman/ChairmanLogin'));
export const ChairmanDashboardPage = lazy(() => import('./pages/chairman/ChairmanDashboard'));
export const StudentLayout = lazy(() => import('./pages/student/StudentLayout'));
export const StudentRegister = lazy(() => import('./pages/student/StudentRegister'));
export const StudentForgotPassword = lazy(() => import('./pages/student/StudentForgotPassword'));
export const StudentResetPassword = lazy(() => import('./pages/student/StudentResetPassword'));
export const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
export const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));
export const StudentSecurity = lazy(() => import('./pages/student/StudentSecurity'));
export const StudentApplications = lazy(() => import('./pages/student/StudentApplications'));
export const StudentExamsHub = lazy(() => import('./pages/student/StudentExamsHub'));
export const StudentExamDetail = lazy(() => import('./pages/student/StudentExamDetail'));
export const StudentResults = lazy(() => import('./pages/student/StudentResults'));
export const StudentResultDetail = lazy(() => import('./pages/student/StudentResultDetail'));
export const StudentPayments = lazy(() => import('./pages/student/StudentPayments'));
export const StudentNotifications = lazy(() => import('./pages/student/StudentNotifications'));
export const StudentResources = lazy(() => import('./pages/student/StudentResources'));
export const StudentPractice = lazy(() => import('./pages/student/StudentPractice'));
export const StudentSupport = lazy(() => import('./pages/student/StudentSupport'));
export const StudentSupportThread = lazy(() => import('./pages/student/StudentSupportThread'));

// ─── Student Exam System v2 ────────────────────────────────────────────────
export const ExamRunnerV2Page = lazy(() => import('./pages/student/exam/ExamRunner'));
export const ExamResultViewPage = lazy(() => import('./pages/student/exam/ExamResultView'));
export const LeaderboardViewPage = lazy(() => import('./pages/student/exam/LeaderboardView'));
