import NotificationCenterScreen from "@/components/notifications/NotificationCenterScreen";

export default function SellerNotificationsPage() {
  return (
    <NotificationCenterScreen
      role="vendor"
      emptySubtitle="New paid orders, delivery updates, customer messages, and payout events will appear here."
    />
  );
}
