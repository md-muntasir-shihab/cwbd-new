import AdminGuardShell from '../../components/admin/AdminGuardShell';
import AdminTabNav from '../../components/admin/AdminTabNav';
import SupportTicketsPanel from '../../components/admin/SupportTicketsPanel';
import { LifeBuoy, HelpCircle, Mail } from 'lucide-react';
import { ADMIN_PATHS } from '../../routes/adminPaths';

const SUPPORT_TABS = [
    { key: 'center', label: 'Support Center', path: ADMIN_PATHS.supportCenter, icon: LifeBuoy },
    { key: 'help', label: 'Help Center', path: ADMIN_PATHS.helpCenterAdmin, icon: HelpCircle },
    { key: 'contact', label: 'Contact Messages', path: ADMIN_PATHS.contact, icon: Mail },
];

export default function AdminSupportCenterPage() {
    return (
        <AdminGuardShell
            title="Support Center"
            description="Handle student tickets, replies, and resolution workflow."
            requiredModule="support_center"
        >
            <AdminTabNav tabs={SUPPORT_TABS} />
            <SupportTicketsPanel />
        </AdminGuardShell>
    );
}
