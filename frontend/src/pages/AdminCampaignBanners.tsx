import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import CampaignBannersPanel from '../components/admin/CampaignBannersPanel';
import { Home, Image, Megaphone, Settings } from 'lucide-react';
import { ADMIN_PATHS } from '../routes/adminPaths';

const WEBSITE_CONTROL_TABS = [
    { key: 'home', label: 'Home Settings', path: ADMIN_PATHS.homeControl, icon: Home },
    { key: 'banners', label: 'Banner Manager', path: ADMIN_PATHS.bannerManager, icon: Image },
    { key: 'campaign', label: 'Campaign Banners', path: ADMIN_PATHS.campaignBanners, icon: Megaphone },
    { key: 'site', label: 'Site Settings', path: ADMIN_PATHS.siteSettings, icon: Settings },
];

export default function AdminCampaignBannersPage() {
    return (
        <AdminGuardShell
            title="Campaign Banners"
            description="Manage promotional campaign banners displayed on the home screen carousel."
        >
            <AdminTabNav tabs={WEBSITE_CONTROL_TABS} />
            <CampaignBannersPanel />
        </AdminGuardShell>
    );
}
