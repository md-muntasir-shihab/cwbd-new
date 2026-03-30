import AdminGuardShell from '../../components/admin/AdminGuardShell';
import SupportTicketsPanel from '../../components/admin/SupportTicketsPanel';

export default function AdminSupportCenterPage() {
    return (
        <AdminGuardShell
            title="Support Center"
            description="Handle student tickets, replies, and resolution workflow."
            requiredModule="support_center"
        >
            <SupportTicketsPanel />
        </AdminGuardShell>
    );
}
