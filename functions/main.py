"""
Milk Farm — Cloud Functions (Python 3.11)

Hosts the LP solver endpoint for automatic ration optimization
and the Excel export function for recipe downloads.
"""
import base64
import io

from firebase_functions import firestore_fn, https_fn, options
from firebase_admin import firestore, initialize_app
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
    est_headers = [
        "Nutriente",
        "valori stimati su s.s.",
        "valori ideali",
        "u.m.",
        "Origine",
    ]
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

    overridden = []
    for n in ordered:
        code = n["code"]
        target = targets.get(code) or {}
        is_override = target.get("source") == "override"
        if is_override:
            overridden.append((n.get("label", code), target.get("reason")))
        ws.cell(row=row, column=1, value=n.get("label", code))
        ws.cell(row=row, column=2, value=round(analysis.get(code, 0), 2))
        ws.cell(row=row, column=3, value=format_range(target))
        ws.cell(row=row, column=4, value=n.get("unit", ""))
        ws.cell(
            row=row,
            column=5,
            value="aziendale" if is_override else "riferimento",
        )
        row += 1

    if overridden:
        row += 1
        ws.cell(
            row=row,
            column=1,
            value="Nota: i valori ideali contrassegnati come \"aziendale\" sono override della singola azienda.",
        ).font = Font(italic=True, size=9)
        row += 1
        for label, reason in overridden:
            text = f"{label}: {reason or '-'}"
            ws.cell(row=row, column=1, value=text).font = Font(italic=True, size=9)
            row += 1

    for column_cells in ws.columns:
        length = max((len(str(c.value)) for c in column_cells if c.value is not None), default=10)
        ws.column_dimensions[column_cells[0].column_letter].width = length + 2

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    safe_name = "".join(c for c in recipe.get("name", "ration") if c.isalnum() or c in " -_").strip() or "ration"

    return f"{safe_name}.xlsx", buffer.read()


# ── Target overrides ────────────────────────────────────────────────────────
# Overrides are written through callables, not the client: the server checks
# the farm role and writes the audit entry in the same transaction, so the
# author and reason cannot be spoofed.

_VALID_ANIMAL_GROUPS = {"lactating", "dry", "heifer"}
_MIN_REASON_LENGTH = 10


def _require_farm_admin(farm_id, uid):
    db = firestore.client()
    member = db.collection("farmMembers").document(f"{farm_id}_{uid}").get()
    if not member.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="No access to this farm.",
        )
    data = member.to_dict() or {}
    if data.get("status") != "active" or data.get("role") not in (
        "owner",
        "farmAdmin",
    ):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Farm admin role required.",
        )
    return db


def _validate_override(data, require_reason=True):
    farm_id = data.get("farmId")
    animal_group_id = data.get("animalGroupId")
    nutrient_code = data.get("nutrientCode")
    if not isinstance(farm_id, str) or not farm_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="farmId is required.",
        )
    if animal_group_id not in _VALID_ANIMAL_GROUPS:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Unknown animalGroupId.",
        )
    if not isinstance(nutrient_code, str) or not nutrient_code:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="nutrientCode is required.",
        )
    min_value = data.get("minValue")
    max_value = data.get("maxValue")
    for value in (min_value, max_value):
        if value is not None and (
            isinstance(value, bool) or not isinstance(value, (int, float))
        ):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="minValue/maxValue must be numbers or null.",
            )
    if require_reason and min_value is None and max_value is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="At least one of minValue or maxValue is required.",
        )
    if min_value is not None and max_value is not None and min_value > max_value:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="minValue must be <= maxValue.",
        )
    reason = data.get("reason")
    if require_reason:
        if not isinstance(reason, str) or len(reason.strip()) < _MIN_REASON_LENGTH:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"A reason of at least {_MIN_REASON_LENGTH} characters is required.",
            )
        reason = reason.strip()
    return farm_id, animal_group_id, nutrient_code, min_value, max_value, reason


def _write_audit(transaction, db, farm_id, payload):
    """Append one audit entry inside the caller's transaction."""
    audit_ref = (
        db.collection("farms").document(farm_id).collection("auditLog").document()
    )
    transaction.set(audit_ref, payload)


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def set_target_override(req: https_fn.CallableRequest):
    """Set one nutrient override for a farm and append an audit entry."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    farm_id, animal_group_id, nutrient_code, min_value, max_value, reason = (
        _validate_override(req.data or {})
    )
    db = _require_farm_admin(farm_id, req.auth.uid)

    override_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("targetOverrides")
        .document(animal_group_id)
    )
    @firestore.transactional
    def apply(transaction):
        snapshot = override_ref.get(transaction=transaction)
        existing = snapshot.to_dict() if snapshot.exists else {}
        nutrients = dict(existing.get("nutrients") or {})
        before = nutrients.get(nutrient_code)
        after = {
            "minValue": min_value,
            "maxValue": max_value,
            "reason": reason,
            "updatedBy": req.auth.uid,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        nutrients[nutrient_code] = after
        transaction.set(
            override_ref,
            {
                "groupId": animal_group_id,
                "nutrients": nutrients,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "version": int(existing.get("version") or 0) + 1,
            },
            merge=True,
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "target.override.set",
                "farmId": farm_id,
                "animalGroupId": animal_group_id,
                "nutrientCode": nutrient_code,
                "before": before,
                "after": after,
                "reason": reason,
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {
        "ok": True,
        "farmId": farm_id,
        "animalGroupId": animal_group_id,
        "nutrientCode": nutrient_code,
        "minValue": min_value,
        "maxValue": max_value,
    }


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def clear_target_override(req: https_fn.CallableRequest):
    """Revert one nutrient to the workbook reference range."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    farm_id, animal_group_id, nutrient_code, _, _, _ = _validate_override(
        req.data or {}, require_reason=False
    )
    db = _require_farm_admin(farm_id, req.auth.uid)

    override_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("targetOverrides")
        .document(animal_group_id)
    )
    @firestore.transactional
    def apply(transaction):
        snapshot = override_ref.get(transaction=transaction)
        if not snapshot.exists:
            return
        existing = snapshot.to_dict() or {}
        nutrients = dict(existing.get("nutrients") or {})
        if nutrient_code not in nutrients:
            return
        before = nutrients.pop(nutrient_code)
        if nutrients:
            transaction.set(
                override_ref,
                {
                    "groupId": animal_group_id,
                    "nutrients": nutrients,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                    "version": int(existing.get("version") or 0) + 1,
                },
                merge=True,
            )
        else:
            transaction.delete(override_ref)
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "target.override.clear",
                "farmId": farm_id,
                "animalGroupId": animal_group_id,
                "nutrientCode": nutrient_code,
                "before": before,
                "after": None,
                "reason": "reverted to reference",
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {
        "ok": True,
        "farmId": farm_id,
        "animalGroupId": animal_group_id,
        "nutrientCode": nutrient_code,
    }


# ── Inventory ───────────────────────────────────────────────────────────────
# One inventory item per feed: the document id is the feed id. The on-hand
# cache and the append-only ledger entry are written in one transaction; the
# ledger doc id is deterministic so a retry cannot double-count.

_INVENTORY_ROLES = ("owner", "farmAdmin", "consultant")
_INVENTORY_ADMIN_ROLES = ("owner", "farmAdmin")


def _require_farm_role(farm_id, uid, allowed):
    db = firestore.client()
    member = db.collection("farmMembers").document(f"{farm_id}_{uid}").get()
    if not member.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="No access to this farm.",
        )
    data = member.to_dict() or {}
    if data.get("status") != "active" or data.get("role") not in allowed:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Insufficient farm role.",
        )
    return db


def _require_string(data, key, min_length=1):
    value = data.get(key)
    if not isinstance(value, str) or len(value.strip()) < min_length:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"{key} is required.",
        )
    return value.strip()


def _require_number(data, key, positive=False, allow_zero=True):
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"{key} must be a number.",
        )
    if positive and value <= 0:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"{key} must be positive.",
        )
    if not allow_zero and value == 0:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"{key} must not be zero.",
        )
    return float(value)


def _inventory_item_ref(db, farm_id, feed_id):
    return (
        db.collection("farms")
        .document(farm_id)
        .collection("inventoryItems")
        .document(feed_id)
    )


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def upsert_inventory_item(req: https_fn.CallableRequest):
    """Create or update the per-feed inventory settings."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    feed_id = _require_string(data, "feedId")
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)

    feed = db.collection("feeds").document(feed_id).get()
    if not feed.exists or (feed.to_dict() or {}).get("farmId") != farm_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Feed not found on this farm.",
        )
    feed_data = feed.to_dict() or {}

    reorder_point_days = data.get("reorderPointDays", 7)
    if isinstance(reorder_point_days, bool) or not isinstance(
        reorder_point_days, (int, float)
    ):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="reorderPointDays must be a number.",
        )
    unit_cost = data.get("unitCostPerKgAsFed", feed_data.get("pricePerKg", 0))
    unit_cost = _require_number(
        {"unitCostPerKgAsFed": unit_cost}, "unitCostPerKgAsFed"
    )

    item_ref = _inventory_item_ref(db, farm_id, feed_id)
    audit_after = {
        "feedId": feed_id,
        "feedName": feed_data.get("name", feed_id),
        "reorderPointDays": max(0, int(reorder_point_days)),
        "location": str(data.get("location") or ""),
        "unitCostPerKgAsFed": unit_cost,
    }

    @firestore.transactional
    def apply(transaction):
        existing = item_ref.get(transaction=transaction)
        payload = dict(audit_after)
        payload["updatedAt"] = firestore.SERVER_TIMESTAMP
        if not existing.exists:
            payload["onHandKgAsFed"] = 0
            payload["createdAt"] = firestore.SERVER_TIMESTAMP
        transaction.set(item_ref, payload, merge=True)
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "inventory.item.upsert",
                "farmId": farm_id,
                "itemId": feed_id,
                "before": existing.to_dict() if existing.exists else None,
                "after": audit_after,
                "reason": "inventory settings",
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {"ok": True, "itemId": feed_id}


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def record_delivery(req: https_fn.CallableRequest):
    """Add a delivery to the on-hand cache and the ledger in one transaction."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    feed_id = _require_string(data, "feedId")
    quantity = _require_number(data, "quantityKgAsFed", positive=True)
    unit_cost = _require_number(data, "unitCostPerKgAsFed")
    idempotency_key = _require_string(data, "idempotencyKey", min_length=6)
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ROLES)

    item_ref = _inventory_item_ref(db, farm_id, feed_id)
    ledger_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("inventoryTransactions")
        .document(f"{farm_id}_delivery_{idempotency_key}")
    )

    @firestore.transactional
    def apply(transaction):
        item = item_ref.get(transaction=transaction)
        if not item.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Create the inventory item before recording a delivery.",
            )
        existing = ledger_ref.get(transaction=transaction)
        if existing.exists:
            return
        item_data = item.to_dict() or {}
        before = float(item_data.get("onHandKgAsFed") or 0)
        after = before + quantity
        transaction.update(
            item_ref,
            {
                "onHandKgAsFed": after,
                "unitCostPerKgAsFed": unit_cost,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
        transaction.set(
            ledger_ref,
            {
                "itemId": feed_id,
                "type": "delivery",
                "deltaKgAsFed": quantity,
                "unitCostPerKgAsFed": unit_cost,
                "sourceType": "manual",
                "sourceId": idempotency_key,
                "idempotencyKey": idempotency_key,
                "createdBy": req.auth.uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "note": str(data.get("note") or ""),
            },
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "inventory.delivery",
                "farmId": farm_id,
                "itemId": feed_id,
                "before": before,
                "after": after,
                "reason": str(data.get("note") or "delivery"),
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {"ok": True, "itemId": feed_id}


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def adjust_inventory(req: https_fn.CallableRequest):
    """Apply a signed manual correction to on-hand stock."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    item_id = _require_string(data, "itemId")
    delta = _require_number(data, "deltaKgAsFed", allow_zero=False)
    reason = _require_string(data, "reason", min_length=3)
    idempotency_key = _require_string(data, "idempotencyKey", min_length=6)
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)

    item_ref = _inventory_item_ref(db, farm_id, item_id)
    ledger_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("inventoryTransactions")
        .document(f"{farm_id}_adjust_{idempotency_key}")
    )

    @firestore.transactional
    def apply(transaction):
        item = item_ref.get(transaction=transaction)
        if not item.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Inventory item not found.",
            )
        existing = ledger_ref.get(transaction=transaction)
        if existing.exists:
            return
        item_data = item.to_dict() or {}
        before = float(item_data.get("onHandKgAsFed") or 0)
        after = before + delta
        if after < 0:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Adjustment would make on-hand stock negative.",
            )
        transaction.update(
            item_ref,
            {
                "onHandKgAsFed": after,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
        transaction.set(
            ledger_ref,
            {
                "itemId": item_id,
                "type": "adjustment",
                "deltaKgAsFed": delta,
                "unitCostPerKgAsFed": float(
                    item_data.get("unitCostPerKgAsFed") or 0
                ),
                "sourceType": "manual",
                "sourceId": idempotency_key,
                "idempotencyKey": idempotency_key,
                "createdBy": req.auth.uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "note": reason,
            },
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "inventory.adjustment",
                "farmId": farm_id,
                "itemId": item_id,
                "before": before,
                "after": after,
                "reason": reason,
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {"ok": True, "itemId": item_id}


# ── Feeding confirmation trigger ────────────────────────────────────────────
# Posts the loaded quantities to the inventory ledger exactly once. The
# feeding document is the client's; the trigger is the only writer of
# inventoryPostedAt. The ledger doc id is deterministic, and the feeding is
# re-read inside the transaction, so a retry or a concurrent invocation
# cannot double-count.


@firestore_fn.on_document_written(
    document="farms/{farmId}/feedings/{feedingId}",
    memory=options.MemoryOption.MB_256,
    region="europe-west1",
)
def on_feeding_confirmed(event: firestore_fn.Event) -> None:
    """Consume the loaded kg of a confirmed feeding from inventory."""
    after = event.data.after if event.data else None
    if after is None or not after.exists:
        return
    feeding = after.to_dict() or {}
    if feeding.get("status") != "confirmed":
        return

    farm_id = event.params.get("farmId")
    feeding_id = event.params.get("feedingId")
    if not farm_id or not feeding_id:
        return

    db = firestore.client()
    feeding_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("feedings")
        .document(feeding_id)
    )

    @firestore.transactional
    def apply(transaction):
        current = feeding_ref.get(transaction=transaction)
        if not current.exists:
            return
        current_data = current.to_dict() or {}
        if current_data.get("inventoryPostedAt"):
            return
        if current_data.get("status") != "confirmed":
            return

        # Read phase: every read must happen before any write in a
        # Firestore transaction.
        prepared = []
        for line in current_data.get("lines") or []:
            line_id = line.get("lineId")
            feed_id = line.get("feedId")
            loaded = float(line.get("loadedKgAsFed") or 0)
            if not line_id or not feed_id or loaded <= 0:
                continue
            ledger_ref = (
                db.collection("farms")
                .document(farm_id)
                .collection("inventoryTransactions")
                .document(f"{farm_id}_{feeding_id}_{line_id}")
            )
            ledger_snap = ledger_ref.get(transaction=transaction)
            item_ref = _inventory_item_ref(db, farm_id, feed_id)
            item_snap = item_ref.get(transaction=transaction)
            prepared.append((line, ledger_ref, ledger_snap, item_ref, item_snap))

        # Write phase. Aggregate by feed before updating: two lines of the
        # same feed share one item snapshot, so writing `before - loaded` per
        # line would let the second update overwrite the first with a stale
        # on-hand value.
        item_updates = {}
        ledger_writes = []
        skipped = []
        for line, ledger_ref, ledger_snap, item_ref, item_snap in prepared:
            if ledger_snap.exists:
                continue
            line_id = line.get("lineId")
            if not item_snap.exists:
                # The feed is not tracked; post the rest and surface the
                # skipped line (with its feed identity) for the UI to explain.
                skipped.append(
                    {
                        "lineId": line_id,
                        "feedId": line.get("feedId"),
                        "feedName": line.get("feedName"),
                    }
                )
                continue
            feed_id = line.get("feedId")
            item_data = item_snap.to_dict() or {}
            loaded = float(line.get("loadedKgAsFed") or 0)
            if feed_id not in item_updates:
                item_updates[feed_id] = {
                    "ref": item_ref,
                    "feedName": line.get("feedName"),
                    "before": float(item_data.get("onHandKgAsFed") or 0),
                    "loaded": 0.0,
                    "lineIds": [],
                }
            item_updates[feed_id]["loaded"] += loaded
            item_updates[feed_id]["lineIds"].append(line_id)
            ledger_writes.append((ledger_ref, line, item_data))

        for update in item_updates.values():
            transaction.update(
                update["ref"],
                {
                    "onHandKgAsFed": update["before"] - update["loaded"],
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
            )
        for ledger_ref, line, item_data in ledger_writes:
            line_id = line.get("lineId")
            loaded = float(line.get("loadedKgAsFed") or 0)
            transaction.set(
                ledger_ref,
                {
                    "itemId": line.get("feedId"),
                    "type": "consumption",
                    "deltaKgAsFed": -loaded,
                    "unitCostPerKgAsFed": float(
                        item_data.get("unitCostPerKgAsFed") or 0
                    ),
                    "sourceType": "feeding",
                    "sourceId": line_id,
                    "idempotencyKey": f"{farm_id}_{feeding_id}_{line_id}",
                    "createdBy": current_data.get("createdBy"),
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "note": f"feeding {feeding_id}",
                },
            )
        posted = len(ledger_writes)

        posted_summary = [
            {
                "feedId": feed_id,
                "lineIds": update["lineIds"],
                "deltaKgAsFed": -update["loaded"],
                "onHandBeforeKgAsFed": update["before"],
                "onHandAfterKgAsFed": update["before"] - update["loaded"],
            }
            for feed_id, update in item_updates.items()
        ]
        # The ledger is authoritative and keeps the negative value (the feed
        # left the mixer). The feeding and audit flag the shortfall so the
        # operator can see it rather than discovering it in reconciliation.
        overdrawn = [
            {
                "feedId": feed_id,
                "feedName": update["feedName"],
                "onHandKgAsFed": update["before"],
                "consumptionKgAsFed": update["loaded"],
                "resultingKgAsFed": update["before"] - update["loaded"],
            }
            for feed_id, update in item_updates.items()
            if update["before"] - update["loaded"] < 0
        ]
        transaction.update(
            feeding_ref,
            {
                "inventoryPostedAt": firestore.SERVER_TIMESTAMP,
                "inventoryPostedLines": posted,
                "inventorySkippedLines": skipped,
                "inventoryOverdrawn": overdrawn,
            },
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "feeding.confirm",
                "farmId": farm_id,
                "feedingId": feeding_id,
                "herdGroupId": current_data.get("herdGroupId"),
                "postedLines": posted,
                "inventoryPosted": posted_summary,
                "skipped": skipped,
                "overdrawn": overdrawn,
                "actorUid": current_data.get("createdBy"),
                "actorEmail": None,
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
