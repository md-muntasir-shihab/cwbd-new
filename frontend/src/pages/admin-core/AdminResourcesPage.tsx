import AdminGuardShell from '../../components/admin/AdminGuardShell';
import ResourcesPanel from '../../components/admin/ResourcesPanel';

export default function AdminResourcesPage() {
    return (
        <AdminGuardShell
            title="Resources"
            description="Manage downloadable resources and visibility controls."
            requiredModule="resources"
        >
            <ResourcesPanel />
        </AdminGuardShell>
    );
}
