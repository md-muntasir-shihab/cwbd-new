import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import AdminNewsSettingsHub from './admin-news/sections/AdminNewsSettingsHub';
import { Newspaper, Settings } from 'lucide-react';
import { adminUi } from '../lib/appRoutes';
import { ADMIN_PATHS } from '../routes/adminPaths';

const NEWS_TABS = [
    { key: 'console', label: 'News Console', path: adminUi('news/dashboard'), icon: Newspaper },
    { key: 'settings', label: 'News Settings', path: ADMIN_PATHS.newsSettings, icon: Settings },
];

export default function AdminSettingsNewsPage() {
    return (
        <AdminGuardShell
            title="News Settings"
            description="Configure news page branding, AI workflow, share templates, and RSS defaults."
            allowedRoles={['superadmin', 'admin', 'moderator']}
        >
            <AdminTabNav tabs={NEWS_TABS} />
            <AdminNewsSettingsHub initialPanel="appearance" />
        </AdminGuardShell>
    );
}
