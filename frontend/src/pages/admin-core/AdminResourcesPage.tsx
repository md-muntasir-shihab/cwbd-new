import AdminGuardShell from '../../components/admin/AdminGuardShell';
import AdminTabNav from '../../components/admin/AdminTabNav';
import ResourcesPanel from '../../components/admin/ResourcesPanel';
import { FolderOpen, Settings } from 'lucide-react';
import { ADMIN_PATHS } from '../../routes/adminPaths';

const RESOURCE_TABS = [
    { key: 'list', label: 'All Resources', path: ADMIN_PATHS.resources, icon: FolderOpen },
    { key: 'settings', label: 'Resource Settings', path: ADMIN_PATHS.resourceSettings, icon: Settings },
];

export default function AdminResourcesPage() {
    return (
        <AdminGuardShell
            title="Resources"
            description="Manage downloadable resources and visibility controls."
            requiredModule="resources"
        >
            <AdminTabNav tabs={RESOURCE_TABS} />
            <ResourcesPanel />
        </AdminGuardShell>
    );
}
