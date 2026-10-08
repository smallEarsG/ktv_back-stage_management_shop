# Local merchant demonstration

Use the combined local runner described by the backend. Merchant Vite proxies `/api` to `LOCAL_API_TARGET` (default `http://127.0.0.1:8080`). No production service is configured.

1. Sign in at `/login` with synthetic account `merchant-local` / `LocalDemo123!`.
2. The order workbench opens. Customer demo-paid orders appear under 待处理 within 10 seconds, even when sound reminders are off. 接单 → 标记已备齐 → 完成 advances server-confirmed status 20 → 30 → 40 → 50.
3. Alternatively open 收银台, select LOCAL-001, choose an available SKU and quantity, then 现金开单. This records a synthetic cash sale already completed (status 50); inspect it in 已完成 or 订单管理. Use a customer demo-paid order to demonstrate fulfillment transitions.
4. Order details show SKU quantities, totals and recorded payment amounts. 订单管理 includes unpaid records; unpaid orders cannot be fulfilled.
5. Leave sound off and create another customer order to demonstrate independent background updates. Stop the API to see a stale-data warning; restart it to recover automatically.

Repeated cashier clicks are guarded. An unchanged retry after an unconfirmed network result uses the same `clientOrderNo`. Do not change the cart after an ambiguous submission until its order has been checked: an altered cart is intentionally a new request.

Unsupported functionality is explicit: online cashier payment, credit settlement and refund execution are disabled. Store-profile/payment settings are display-only and cannot pretend to save. Payment credentials belong in secure server configuration, never in browser fields. The demo banner defaults on; `VITE_DEMO_MODE=false` only hides that banner and does not enable any payment functionality.

## Checks

`npm run check` runs Vue 3 essential lint, Node helper tests and production build. Helper tests cover forward fulfillment transitions and stable request IDs for retry/changed cart/success. This is not a claim of end-to-end browser verification.
