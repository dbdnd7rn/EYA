import NotificationCenterScreen from "@/components/notifications/NotificationCenterScreen";

export default function AgentNotificationsPage() {
  return (
    <NotificationCenterScreen
      role="agent"
      emptySubtitle="Delivery assignments, delivery status changes, verification events, and earnings updates will appear here."
    />
  );
}
