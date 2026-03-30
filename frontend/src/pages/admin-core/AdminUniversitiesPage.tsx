import AdminGuardShell from '../../components/admin/AdminGuardShell';
import UniversitiesPanel from '../../components/admin/UniversitiesPanel';

export default function AdminUniversitiesPage() {
    return (
        <AdminGuardShell
            title="Universities"
            description="Manage university records, mapping, and category assignments."
            requiredModule="universities"
        >
            <UniversitiesPanel />
        </AdminGuardShell>
    );
}
