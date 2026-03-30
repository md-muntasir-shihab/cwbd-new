import AdminGuardShell from '../../components/admin/AdminGuardShell';
import { AdminExamsPage as StandaloneExamsPage } from '../admin/exams/AdminExamsPage';

export default function AdminExamsPage() {
    return (
        <AdminGuardShell
            title="Exams"
            description="Create and manage exams, questions, results, and payments."
            requiredModule="exams"
        >
            <StandaloneExamsPage />
        </AdminGuardShell>
    );
}
