import NotificationCenterScreen from "@/components/notifications/NotificationCenterScreen";

export default function LandlordNotificationsPage() {
  return (
    <NotificationCenterScreen
      role="landlord"
      emptySubtitle="New enquiries, support updates, listing alerts, and landlord account activity will appear here."
    />
  );
}
