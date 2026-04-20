import AdminGuardShell from '../../components/admin/AdminGuardShell';
import AdminTabNav from '../../components/admin/AdminTabNav';
import UniversitiesPanel from '../../components/admin/UniversitiesPanel';
import { GraduationCap, SlidersHorizontal } from 'lucide-react';
import { ADMIN_PATHS } from '../../routes/adminPaths';

const UNIVERSITY_TABS = [
    { key: 'list', label: 'All Universities', path: ADMIN_PATHS.universities, icon: GraduationCap },
    { key: 'settings', label: 'University Settings', path: ADMIN_PATHS.universitySettings, icon: SlidersHorizontal },
];

export default function AdminUniversitiesPage() {
    return (
        <AdminGuardShell
            title="Universities"
            description="Manage university records, mapping, and category assignments."
            requiredModule="universities"
        >
            <AdminTabNav tabs={UNIVERSITY_TABS} />
            <UniversitiesPanel />
        </AdminGuardShell>
    );
}
