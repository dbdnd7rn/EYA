export type MarketItem = {
  id: string;
  name: string;
  vendor: string;
  area: string;
  campus: string;
  price: number;
  deliveryFee: number;
  rating: number;
  image: string;
  description: string;
};

export type FoodItem = {
  id: string;
  name: string;
  cuisine: string;
  area: string;
  campus: string;
  etaMins: number;
  meal: string;
  mealPrice: number;
  deliveryFee: number;
  rating: number;
  isOpen: boolean;
  image: string;
  description: string;
};

export const marketItems: MarketItem[] = [
  {
    id: "m1",
    name: "Desk lamp",
    vendor: "Campus Tech Shop",
    area: "Chitawira",
    campus: "MUST",
    price: 18000,
    deliveryFee: 2500,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80",
    description: "Bright LED desk lamp suitable for study desks and hostel reading corners.",
  },
  {
    id: "m2",
    name: "Study chair",
    vendor: "Student Comforts",
    area: "Namiwawa",
    campus: "MUBAS",
    price: 45000,
    deliveryFee: 3000,
    rating: 4.4,
    image: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=1200&q=80",
    description: "Cushioned ergonomic chair with sturdy frame for long study sessions.",
  },
  {
    id: "m3",
    name: "Power bank",
    vendor: "Uni Gadgets",
    area: "Zomba CBD",
    campus: "UNIMA",
    price: 32000,
    deliveryFee: 2200,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?auto=format&fit=crop&w=1200&q=80",
    description: "Fast charging power bank with dual USB output, ideal for busy campus days.",
  },
  {
    id: "m4",
    name: "Bedding set",
    vendor: "Hostel Essentials",
    area: "Soche",
    campus: "MUST",
    price: 28000,
    deliveryFee: 2600,
    rating: 4.5,
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    description: "Complete bedding set with duvet cover, pillow cases, and fitted sheet.",
  },
];

export const foodItems: FoodItem[] = [
  {
    id: "f1",
    name: "Campus Grill",
    cuisine: "Fast food",
    area: "Soche East",
    campus: "MUST",
    etaMins: 25,
    meal: "Chicken and chips",
    mealPrice: 12000,
    deliveryFee: 2500,
    rating: 4.7,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?auto=format&fit=crop&w=1200&q=80",
    description: "Crispy chicken combos and quick meals popular with evening students.",
  },
  {
    id: "f2",
    name: "Uni Bites",
    cuisine: "Burgers",
    area: "Namiwawa",
    campus: "MUBAS",
    etaMins: 30,
    meal: "Beef burger combo",
    mealPrice: 15000,
    deliveryFee: 3000,
    rating: 4.4,
    isOpen: false,
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
    description: "Loaded burgers, chips, and sauces with value combo options.",
  },
  {
    id: "f3",
    name: "Zomba Fresh Meals",
    cuisine: "Local",
    area: "Old Naisi",
    campus: "UNIMA",
    etaMins: 28,
    meal: "Rice and fish",
    mealPrice: 10000,
    deliveryFee: 2200,
    rating: 4.8,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80",
    description: "Affordable local dishes with fresh ingredients and generous portions.",
  },
];

export function kwacha(value: number) {
  return `K${value.toLocaleString("en-MW")}`;
}
