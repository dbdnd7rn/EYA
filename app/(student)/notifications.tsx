import NotificationCenterScreen from "@/components/notifications/NotificationCenterScreen";

export default function StudentNotificationsPage() {
  return (
    <NotificationCenterScreen
      role="student"
      emptySubtitle="Order updates, wallet activity, payment results, and messages will appear here."
    />
  );
}
