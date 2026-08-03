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
  route("equipment", "routes/equipment.tsx"),
  route("equipment/new", "routes/equipment-new.tsx"),
  route("equipment/import", "routes/equipment-import.tsx"),
  route("work-orders", "routes/work-orders.tsx"),
  route("work-orders/new", "routes/work-order-new.tsx"),
  route("work-orders/:workOrderId", "routes/work-order.tsx"),
  route("settings", "routes/settings.tsx"),

  // 書き出し・印刷
  route("export", "routes/export.tsx"),
  route("export/:kind.csv", "routes/export-csv.ts"),
  route("print/occupancy", "routes/print-occupancy.tsx"),
  route("print/ledger", "routes/print-ledger.tsx"),
  route("print/equipment", "routes/print-equipment.tsx"),

  // 認証
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.ts"),
  route("api/auth/*", "routes/auth-api.ts"),
] satisfies RouteConfig;
