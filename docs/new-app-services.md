# New App Service Scaffold (Step 2)

All new services are isolated under `lib/newApp` and use `supabaseNewApp` only.

## Files

- `lib/newApp/types.ts`
- `lib/newApp/vendors.ts`
- `lib/newApp/catalog.ts`
- `lib/newApp/orders.ts`
- `lib/newApp/index.ts`

## Service highlights

- `vendors.ts`
  - `listVendors`
  - `getVendorById`
  - `listMyVendors`
  - `createVendor`
  - `updateVendor`

- `catalog.ts`
  - `listCatalogItems`
  - `getCatalogItemById`
  - `createCatalogItem`
  - `updateCatalogItem`

- `orders.ts`
  - `createOrderWithItems` (creates order + line items + optional delivery row)
  - `getOrderById`
  - `listOrdersForCustomer`
  - `listOrdersForVendorOwner`
  - `updateOrderStatus`
  - `getOrderItems`
  - `getDeliveryByOrderId`

## Usage

```ts
import { listVendors, listCatalogItems, createOrderWithItems } from "@/lib/newApp";
```

These calls go to the isolated `campus_market` schema via `supabaseNewApp`.
