"""
Milk Farm — Cloud Functions (Python 3.11)

Hosts the LP solver endpoint for automatic ration optimization
and the Excel export function for recipe downloads.
"""
import base64
import io

from firebase_functions import https_fn, options
from firebase_admin import initialize_app
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from solver import solve_ration

initialize_app()


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def optimize_ration(req: https_fn.CallableRequest):
    """
    Solve a minimum-cost TMR formulation using linear programming.

    Input payload (req.data):
    {
      "feeds": [
        {
          "id": "abc123",
          "name": "Silomais",
          "dmFactor": 0.35,        # 1 - moisturePct/100
          "nutrients": {"proteina": 7.04, "ee": 2.91, ...},
          "pricePerKg": 0.05,
          "category": "forage"
        },
        ...
      ],
      "targets": [
        {"code": "proteina", "min": 15.5, "max": 17.0},
        {"code": "ee", "min": null, "max": 5.0},
        ...
      ],
      "constraints": {
        "totalDM": 22.5,           # optional: fix total DM intake (kg)
        "minForageRatio": 0.45,    # optional: min % of DM from forages
        "maxForageRatio": 0.65     # optional: max % of DM from forages
      }
    }

    Returns:
    {
      "status": "optimal" | "infeasible",
      "feeds": [
        {"feedId": "abc123", "kgAsFed": 15.0, "kgDM": 5.25, "cost": 0.75},
        ...
      ],
      "totalCost": 3.45,
      "totalDM": 22.5,
      "totalAsFed": 52.1,
      "nutrientAnalysis": {"proteina": 16.2, "ee": 4.1, ...},
      "message": "Optimal solution found"
    }
    """
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )

    data = req.data
    return solve_ration(
        data.get("feeds", []),
        data.get("targets", []),
        data.get("constraints", {}),
    )


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def export_recipe(req: https_fn.CallableRequest):
    """
    Build an .xlsx workbook for a saved recipe and return it as base64 so the
    client can trigger a direct download.

    Input payload (req.data):
    {
      "recipe": {"name", "animalGroupId", "totalAsFed", "totalDM", "cost",
                 "nutrientAnalysis": {...}},
      "feeds": [{"feedName", "category", "pricePerKg", "kgAsFed", "kgDM",
                 "moisturePct", "cost"}, ...],
      "nutrients": [{"code", "label", "unit"}, ...],
      "targets": [{"code", "min", "max"}, ...]
    }

    Produces a workbook mirroring the source spreadsheet layout:
    FORAGGI / CONCENTRATI feed tables, then "valori stimati su s.s." next to
    the "valori ideali" target ranges.

    Returns: {"filename": "...", "contentBase64": "...", "mimeType": "..."}
    """
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )

    data = req.data or {}
    filename, content = build_recipe_workbook(
        data.get("recipe", {}),
        data.get("feeds", []),
        data.get("nutrients", []),
        data.get("targets", []),
    )

    return {
        "filename": filename,
        "contentBase64": base64.b64encode(content).decode("ascii"),
        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }


def build_recipe_workbook(recipe, feeds, nutrients, target_list):
    """
    Build the ration .xlsx workbook and return (filename, bytes).

    Pure function (no Firebase or Flask context) so it can be unit-tested and
    reused. Mirrors the source spreadsheet layout: FORAGGI / CONCENTRATI
    tables, per-head totals, "totale carico" for the group, then
    "valori stimati su s.s." next to "valori ideali".
    """
    targets = {t["code"]: t for t in target_list}
    wb = Workbook()
    ws = wb.active
    ws.title = "Razione"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4ECCA3")
    section_font = Font(bold=True, color="FFFFFF")
    section_fill = PatternFill("solid", fgColor="2B7A5B")
    title_font = Font(bold=True, size=14)
    bold = Font(bold=True)

    ws["A1"] = recipe.get("name", "Razione")
    ws["A1"].font = title_font
    try:
        animal_count = int(recipe.get("animalCount") or 1)
    except (TypeError, ValueError):
        animal_count = 1
    animal_count = max(1, min(animal_count, 100000))
    group_label = recipe.get("animalGroupLabel") or recipe.get("animalGroupId", "")
    ws["A2"] = f"Gruppo animale: {group_label}"

    feed_headers = ["Prodotto", "Prezzo €/kg", "Kg t.q.", "Kg s.s.", "Umidità %", "Costo €"]

    def write_section(title, entries, start_row):
        """Write a FORAGGI/CONCENTRATI section; return (next_row, subtotals)."""
        r = start_row
        sec = ws.cell(row=r, column=1, value=title)
        sec.font = section_font
        sec.fill = section_fill
        for col in range(2, len(feed_headers) + 1):
            ws.cell(row=r, column=col).fill = section_fill
        r += 1
        for col, label in enumerate(feed_headers, start=1):
            cell = ws.cell(row=r, column=col, value=label)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        r += 1

        sub_tq = sub_ss = sub_cost = 0.0
        for e in entries:
            ws.cell(row=r, column=1, value=e.get("feedName", ""))
            ws.cell(row=r, column=2, value=round(e.get("pricePerKg", 0), 3))
            ws.cell(row=r, column=3, value=round(e.get("kgAsFed", 0), 3))
            ws.cell(row=r, column=4, value=round(e.get("kgDM", 0), 3))
            ws.cell(row=r, column=5, value=round(e.get("moisturePct", 0), 1))
            ws.cell(row=r, column=6, value=round(e.get("cost", 0), 4))
            sub_tq += e.get("kgAsFed", 0)
            sub_ss += e.get("kgDM", 0)
            sub_cost += e.get("cost", 0)
            r += 1

        ws.cell(row=r, column=1, value=f"Totale {title.lower()}").font = bold
        ws.cell(row=r, column=3, value=round(sub_tq, 3)).font = bold
        ws.cell(row=r, column=4, value=round(sub_ss, 3)).font = bold
        ws.cell(row=r, column=6, value=round(sub_cost, 4)).font = bold
        return r + 2, (sub_tq, sub_ss, sub_cost)

    forages = [f for f in feeds if f.get("category") == "forage"]
    concentrates = [f for f in feeds if f.get("category") == "concentrate"]

    row = 4
    row, _ = write_section("FORAGGI", forages, row)
    row, _ = write_section("CONCENTRATI", concentrates, row)

    # ── Grand totals ──
    total_as_fed = recipe.get("totalAsFed", 0)
    total_cost = recipe.get("cost", 0)
    ws.cell(row=row, column=1, value="TOTALE RAZIONE").font = bold
    ws.cell(row=row, column=3, value=round(total_as_fed, 3)).font = bold
    ws.cell(row=row, column=4, value=round(recipe.get("totalDM", 0), 3)).font = bold
    ws.cell(row=row, column=6, value=round(total_cost, 4)).font = bold
    row += 2

    # ── Per-head economics and the whole-group load ("totale carico") ──
    ws.cell(row=row, column=1, value="Capi")
    ws.cell(row=row, column=3, value=animal_count)
    row += 1
    ws.cell(row=row, column=1, value="Costo razione al kg (€/kg t.q.)")
    ws.cell(
        row=row,
        column=3,
        value=round(total_cost / total_as_fed, 4) if total_as_fed else 0,
    )
    row += 1
    ws.cell(row=row, column=1, value="Totale carico (kg t.q.)").font = bold
    ws.cell(row=row, column=3, value=round(total_as_fed * animal_count, 3)).font = bold
    row += 1
    ws.cell(row=row, column=1, value="Costo totale carico (€)").font = bold
    ws.cell(row=row, column=6, value=round(total_cost * animal_count, 2)).font = bold
    row += 2

    # ── valori stimati su s.s. | valori ideali ──
    analysis = recipe.get("nutrientAnalysis") or {}
    est_headers = ["Nutriente", "valori stimati su s.s.", "valori ideali", "u.m."]
    for col, label in enumerate(est_headers, start=1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    row += 1

    def format_range(t):
        if not t:
            return "-"
        tmin, tmax = t.get("min"), t.get("max")
        if tmin is not None and tmax is not None:
            return f"{tmin} - {tmax}"
        if tmin is not None:
            return f">{tmin}"
        if tmax is not None:
            return f"<{tmax}"
        return "-"

    # Preserve the master nutrient ordering; fall back to any extra codes.
    ordered = [n for n in nutrients if n["code"] in analysis]
    seen = {n["code"] for n in ordered}
    for code in analysis:
        if code not in seen:
            ordered.append({"code": code, "label": code, "unit": ""})

    for n in ordered:
        code = n["code"]
        ws.cell(row=row, column=1, value=n.get("label", code))
        ws.cell(row=row, column=2, value=round(analysis.get(code, 0), 2))
        ws.cell(row=row, column=3, value=format_range(targets.get(code)))
        ws.cell(row=row, column=4, value=n.get("unit", ""))
        row += 1

    for column_cells in ws.columns:
        length = max((len(str(c.value)) for c in column_cells if c.value is not None), default=10)
        ws.column_dimensions[column_cells[0].column_letter].width = length + 2

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    safe_name = "".join(c for c in recipe.get("name", "ration") if c.isalnum() or c in " -_").strip() or "ration"

    return f"{safe_name}.xlsx", buffer.read()
