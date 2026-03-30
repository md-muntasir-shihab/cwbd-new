import AdminGuardShell from '../../components/admin/AdminGuardShell';
import SubscriptionsV2Page from '../admin/subscriptions/SubscriptionsV2Page';

export default function AdminSubscriptionsV2Page() {
    return (
        <AdminGuardShell
            title="Subscriptions"
            description="View and manage student subscriptions, renewals, and plan assignments."
            requiredModule="subscription_plans"
        >
            <SubscriptionsV2Page />
        </AdminGuardShell>
    );
}
