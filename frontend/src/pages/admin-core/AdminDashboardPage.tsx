import { useNavigate } from 'react-router-dom';
import AdminGuardShell from '../../components/admin/AdminGuardShell';
import DashboardHome from '../../components/admin/DashboardHome';
import { routeFromDashboardActionTab } from '../../routes/adminPaths';

export default function AdminDashboardPage() {
    const navigate = useNavigate();

    return (
        <AdminGuardShell
            title="Dashboard"
            description="Live snapshot of core admin modules with direct navigation shortcuts."
        >
            <DashboardHome
                universities={[]}
                exams={[]}
                users={[]}
                onTabChange={(tab) => navigate(routeFromDashboardActionTab(tab))}
            />
        </AdminGuardShell>
    );
}
