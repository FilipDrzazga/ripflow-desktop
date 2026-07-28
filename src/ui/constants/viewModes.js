// Lenses of the Production view. Single source of truth for the viewMode value —
// never compare against a bare string.
//
// BATCHES — stage/batch lens (default)
// ORDERS  — read-only order-centric lens
// RECEIVE — sewing-return lens (declared ahead of its UI; not reachable yet)
export const VIEW_MODE = {
  BATCHES: "batches",
  ORDERS: "orders",
  RECEIVE: "receive",
};
