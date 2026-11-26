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
- Heartbeat error banner: with an error heartbeat and an **empty** queue,
  `/loading` showed "Il controllo automatico dei carichi non è in esecuzione".
- CSV export: downloaded from `/accuracy`; 250 bytes, UTF-8 BOM present,
  header `date;herdGroupId;...;hasRefusalError`, row uses `;`. Parsed with
  Python's `csv` module (14 columns, numeric fields parse). It was not opened
  in Excel/LibreOffice; no such app is installed here. A fixture is at
  [`accuracy-smoke.csv`](screenshots/accuracy-smoke.csv) for a five-minute
  `it-IT` visual check.
- 360 px active confirm: after selecting the group/feeder and loading 100 kg,
  the button is visible, enabled, and fully inside the 360 px viewport
  (`x=171, width=148`), reachable by scroll. Screenshot:
  [loading-360-confirm](screenshots/loading-360-confirm.png).
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
   non-null, with a guard in `save()` and a Karma spec.
3. **Queue-health subscriptions never started on a fresh page**: the loading
   component checked `canRetry` once in `ngOnInit`; if the farm role resolved
   after that, the failures list and heartbeat were never subscribed. This is
   why the first stale-banner browser attempt showed nothing. They are now
   started from an `effect` on `activeRole`, and the stale banner was remade
   visible on an empty queue.
4. **The shell was not responsive at 360 px**: the permanent 260 px sidenav
   clipped the page. The sidenav is now `over` on ≤800 px with a menu button,
   and the new-feeder row wraps instead of clipping the "Aggiungi" button.

## Not covered

- CSV download opened in Italian Excel/LibreOffice (delimiter/BOM visual
  check). The CSV path is unit-tested; the browser download was not opened.
- The heartbeat stale banner was verified visually with an error heartbeat and
  an empty queue; the screenshot is [stale-banner](screenshots/stale-banner.png).
- Excel/LibreOffice visual parse of the CSV (fixture provided; no app here).


## Accuracy CSV, Italian locale (2026-11-27)

The fixture `docs/screenshots/accuracy-smoke.csv` was imported with the
semicolon filter and rendered in LibreOffice set to Italian:

- BOM present, `;` delimiter, CRLF line endings;
- columns split correctly (`date`, `herdGroupId`, ...), not one column;
- fixture values are integers, so comma-decimal rendering is not exercised
  by this fixture (the exporter test covers comma decimals separately);
- screenshot: `docs/screenshots/accuracy-smoke-it.png`.


## CSV comma-decimal fixture (2026-11-27)

`docs/screenshots/accuracy-decimals.csv` uses semicolons and comma decimals.
LibreOffice imported it into columns, but its CSV filter rendered `100,5` as
`100.5` (document locale en-US despite the GUI locale). So this fixture proves
delimiter parsing, **not** comma-decimal display. Screenshot:
`docs/screenshots/accuracy-decimals-it.png`.
