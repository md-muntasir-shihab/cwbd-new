import HomeSettingsPanel from '../components/admin/HomeSettingsPanel';
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

export default function AdminHomeSettingsPage() {
    return (
        <AdminGuardShell title="Home Control" description="Control section visibility, highlights, featured universities, and live sync settings.">
            <AdminTabNav tabs={WEBSITE_CONTROL_TABS} />
            <HomeSettingsPanel />
        </AdminGuardShell>
    );
}
