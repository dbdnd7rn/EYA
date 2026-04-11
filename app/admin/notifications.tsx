import NotificationCenterScreen from "@/components/notifications/NotificationCenterScreen";

export default function AdminNotificationsPage() {
  return (
    <NotificationCenterScreen
      role="admin"
      emptySubtitle="Support tickets, trust reports, payouts, and operational alerts will appear here."
    />
  );
}
