# Local browser verification — 2026-10-08

Verified with the supported cloud Chromium UI against the combined desktop runner, merchant port 5173, platform 5174, API 8088. All data is synthetic. Earlier command-namespace localhost refusal was resolved by the desktop runner; this report supersedes that limitation.

## Passed

- Merchant synthetic login redirects to the workbench and displays actual role/navigation.
- Cashier loads LOCAL-001, category and the ¥12 test SKU. Cash sale ORDfd8a28aaa3ca4c89bebbd79b97fa0808 succeeds, clears the cart and is recorded completed (50), per the backend's cashier semantics. UI copy now states this accurately.
- Online payment and credit controls are visibly disabled.
- Customer preview created and demo-paid ORD6ff0f24068064c609dcfb6ee5716a00d. It appeared on the open merchant workbench via background polling with sound off, without manual refresh.
- The exact order advanced through 接单 (20→30), 标记已备齐 (30→40), 完成 (40→50) using actual browser controls.
- Completed detail showed amount ¥12, recorded paid ¥12, refund ¥0, table LOCAL-001, one SKU and completed timestamp.
- Detail dismissal and later reopening work. A rapid automation reopen during the drawer close animation did not reopen it; after dismissal completed, reopening worked. No persistent overlay remained.
- Platform synthetic login and two-tenant list rendered correctly.
- Login, workbench and platform screens were visually inspected at 1180×757 viewport.

## Recovery observed

The initially running API jar produced product/list timeouts after a rebuild. Restarting the desktop API with the final jar resolved the issue; both lists were then verified. The cashier now retains a visible load error with Retry rather than leaving a silent empty grid. Production runner should restart after rebuilding the jar.

## Scope

This is local browser demo QA, not native WeChat DevTools/device verification or real payment certification. No real payment, refund, public deployment or third-party account was used. Unit checks additionally cover stable retry IDs and allowed forward transitions; UI automation did not exhaustively inject duplicate clicks or every network failure.

Screenshots: merchant-workbench.png (paid pending customer order), merchant-completed-order.png (completed detail), platform-tenants.png. Delivered separately in the final package.
