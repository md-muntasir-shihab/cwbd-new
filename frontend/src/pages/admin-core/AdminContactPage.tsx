import AdminGuardShell from '../../components/admin/AdminGuardShell';
import AdminTabNav from '../../components/admin/AdminTabNav';
import ContactPanel from '../../components/admin/ContactPanel';
import { LifeBuoy, HelpCircle, Mail } from 'lucide-react';
import { ADMIN_PATHS } from '../../routes/adminPaths';

const SUPPORT_TABS = [
    { key: 'center', label: 'Support Center', path: ADMIN_PATHS.supportCenter, icon: LifeBuoy },
    { key: 'help', label: 'Help Center', path: ADMIN_PATHS.helpCenterAdmin, icon: HelpCircle },
    { key: 'contact', label: 'Contact Messages', path: ADMIN_PATHS.contact, icon: Mail },
];

export default function AdminContactPage() {
    return (
        <AdminGuardShell
            title="Contact Messages"
            description="View and manage contact form submissions."
            requiredModule="support_center"
        >
            <AdminTabNav tabs={SUPPORT_TABS} />
            <ContactPanel />
        </AdminGuardShell>
    );
}
