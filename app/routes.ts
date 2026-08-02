import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("units", "routes/units.tsx"),
  route("units/new", "routes/unit-new.tsx"),
  route("units/import", "routes/lease-import.tsx"),
  route("units/:unitId", "routes/unit.tsx"),
  route("buildings/new", "routes/building-new.tsx"),
  route("buildings/:buildingId", "routes/building.tsx"),
  route("procedures/:procedureId", "routes/procedure.tsx"),
  route("work-orders", "routes/work-orders.tsx"),
  route("work-orders/new", "routes/work-order-new.tsx"),
  route("work-orders/:workOrderId", "routes/work-order.tsx"),
  route("settings", "routes/settings.tsx"),

  // 認証
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.ts"),
  route("api/auth/*", "routes/auth-api.ts"),
] satisfies RouteConfig;
