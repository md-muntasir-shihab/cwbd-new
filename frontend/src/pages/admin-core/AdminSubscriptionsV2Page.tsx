import AdminGuardShell from '../../components/admin/AdminGuardShell';
import AdminTabNav from '../../components/admin/AdminTabNav';
import SubscriptionsV2Page from '../admin/subscriptions/SubscriptionsV2Page';
import { CreditCard, Users } from 'lucide-react';
import { ADMIN_PATHS } from '../../routes/adminPaths';

const SUB_TABS = [
    { key: 'plans', label: 'Subscription Plans', path: ADMIN_PATHS.subscriptionPlans, icon: CreditCard },
    { key: 'subs', label: 'Subscriptions', path: ADMIN_PATHS.subscriptionsV2, icon: CreditCard },
    { key: 'contact', label: 'Contact Center', path: ADMIN_PATHS.subscriptionContactCenter, icon: Users },
];

export default function AdminSubscriptionsV2Page() {
    return (
        <AdminGuardShell
            title="Subscriptions"
            description="View and manage student subscriptions, renewals, and plan assignments."
        >
            <AdminTabNav tabs={SUB_TABS} />
            <SubscriptionsV2Page />
        </AdminGuardShell>
    );
}
