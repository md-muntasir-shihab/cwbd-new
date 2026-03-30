import AdminGuardShell from '../../components/admin/AdminGuardShell';
import ContactPanel from '../../components/admin/ContactPanel';

export default function AdminContactPage() {
    return (
        <AdminGuardShell
            title="Contact Messages"
            description="View and manage contact form submissions."
            requiredModule="support_center"
        >
            <ContactPanel />
        </AdminGuardShell>
    );
}
