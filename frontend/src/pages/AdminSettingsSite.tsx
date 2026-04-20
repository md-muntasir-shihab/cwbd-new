import SiteSettingsPanel from '../components/admin/SiteSettingsPanel';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import { Home, Image, Megaphone, Settings } from 'lucide-react';
import { ADMIN_PATHS } from '../routes/adminPaths';

const WEBSITE_CONTROL_TABS = [
    { key: 'home', label: 'Home Settings', path: ADMIN_PATHS.homeControl, icon: Home },
    { key: 'banners', label: 'Banner Manager', path: ADMIN_PATHS.bannerManager, icon: Image },
    { key: 'campaign', label: 'Campaign Banners', path: ADMIN_PATHS.campaignBanners, icon: Megaphone },
    { key: 'site', label: 'Site Settings', path: ADMIN_PATHS.siteSettings, icon: Settings },
];

export default function AdminSettingsSitePage() {
    return (
        <AdminGuardShell
            title="Site Settings"
            description="Control global branding, contact information, and social links."
            allowedRoles={['superadmin', 'admin']}
        >
            <AdminTabNav tabs={WEBSITE_CONTROL_TABS} />
            <SiteSettingsPanel />
        </AdminGuardShell>
    );
}
