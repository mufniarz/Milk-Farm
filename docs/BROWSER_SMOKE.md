# Browser smoke — 2026-11-25

Executed against production `https://nicola-milk-farm.web.app` with a
throwaway owner tenant (farm, group, recipe, feeder, inventory item). The
tenant, recipe feed, feed, membership, profile and Auth user were deleted
afterward.

## What passed

- Login with email/password, dashboard.
- `/loading`: selected group and feeder, loaded 100 kg, confirmed. The trigger
  posted: on-hand 1000 → 900, one `-100` consumption ledger entry, no failure
  document.
- `/iofc`: saved a 300 kg / €0.50 record, then used "Aggiorna snapshot" to
  re-lock the feeding snapshot. Cards rendered €150.00 revenue, €45.00 feed,
  €105.00 IOFC/day, €10.50 IOFC/cow, 30 kg milk/cow, €0.150 feed/kg.
- `/accuracy`: rendered the per-feeder row for the confirmed load.
- No console errors or page errors.

Screenshots: [loading](screenshots/loading-confirmed.png),
[IOFC after refresh](screenshots/iofc-refreshed.png),
[loading at 360 px](screenshots/loading-360.png).

## Findings fixed during the smoke

1. **Missing i18n keys** `IOFC.INCOMPLETE_SNAPSHOT` and `IOFC.SAVE_DEFAULT`
   rendered as raw keys. Added in both languages.
2. **Incomplete milk record could be saved** while the recipe/feeding data
   was still loading: the page saved `feedCostPerHeadSnapshot: null` and
   `hasFeedingSnapshot: false`. Save is now disabled until `result` is
   non-null, with a guard in `save()`.
3. **The shell was not responsive at 360 px**: the permanent 260 px sidenav
   clipped the page. The sidenav is now `over` on ≤800 px with a menu button,
   and the new-feeder row wraps instead of clipping the "Aggiungi" button.

## Not covered

- CSV download opened in Italian Excel/LibreOffice (delimiter/BOM visual
  check). The CSV path is unit-tested; the browser download was not opened.
- The heartbeat stale banner was verified by pure specs, not by forcing a
  stale heartbeat in the browser.
- The loading confirm button at 360 px after selecting a group (the form is
  below the fold in the screenshot).
