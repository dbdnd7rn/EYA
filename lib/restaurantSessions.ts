import type { OrderRow } from "@/lib/newApp/types";

export type RestaurantSession = "lunch" | "dinner";

type SessionConfig = {
  id: RestaurantSession;
  title: string;
  shortTitle: string;
  startsAt: string;
  closesAt: string;
  startHour: number;
  endHour: number;
};

const SESSION_CONFIG: Record<RestaurantSession, SessionConfig> = {
  lunch: {
    id: "lunch",
    title: "Lunch Session",
    shortTitle: "Lunch",
    startsAt: "12:00 PM",
    closesAt: "4:00 PM",
    startHour: 12,
    endHour: 16,
  },
  dinner: {
    id: "dinner",
    title: "Dinner Session",
    shortTitle: "Dinner",
    startsAt: "4:00 PM",
    closesAt: "10:00 PM",
    startHour: 16,
    endHour: 22,
  },
};

export function getRestaurantSessionConfig(session: RestaurantSession) {
  return SESSION_CONFIG[session];
}

export function getRestaurantSessionForDate(input: string | number | Date): RestaurantSession | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getHours();
  if (hour >= SESSION_CONFIG.lunch.startHour && hour < SESSION_CONFIG.lunch.endHour) return "lunch";
  if (hour >= SESSION_CONFIG.dinner.startHour && hour < SESSION_CONFIG.dinner.endHour) return "dinner";
  return null;
}

export function isOrderInRestaurantSession(order: Pick<OrderRow, "created_at">, session: RestaurantSession) {
  return getRestaurantSessionForDate(order.created_at) === session;
}

export function listRestaurantSessionOrders<T extends Pick<OrderRow, "created_at">>(orders: T[], session: RestaurantSession) {
  return orders.filter((order) => isOrderInRestaurantSession(order, session));
}

export function getRestaurantSessionStatus(session: RestaurantSession, now = new Date()) {
  const config = getRestaurantSessionConfig(session);
  const currentHour = now.getHours();
  if (currentHour >= config.startHour && currentHour < config.endHour) {
    const closing = new Date(now);
    closing.setHours(config.endHour, 0, 0, 0);
    const minsLeft = Math.max(0, Math.round((closing.getTime() - now.getTime()) / 60000));
    return {
      label: minsLeft > 0 ? `Closes in ${minsLeft} min` : "Closing now",
      active: true,
      nextWindowLabel: `Ends at ${config.closesAt}`,
    };
  }

  const start = new Date(now);
  start.setHours(config.startHour, 0, 0, 0);
  if (currentHour < config.startHour) {
    return {
      label: `Starts at ${config.startsAt}`,
      active: false,
      nextWindowLabel: `Opens ${config.startsAt}`,
    };
  }

  return {
    label: `Closed for ${config.shortTitle.toLowerCase()}`,
    active: false,
    nextWindowLabel: `Returns ${config.startsAt}`,
  };
}

export function getSuggestedRestaurantSession(now = new Date()): RestaurantSession {
  const active = getRestaurantSessionForDate(now);
  if (active) return active;
  return now.getHours() < SESSION_CONFIG.dinner.startHour ? "lunch" : "dinner";
}
