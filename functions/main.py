"""
Milk Farm — Cloud Functions (Python 3.11)

Hosts the LP solver endpoint for automatic ration optimization
and the Excel export function for recipe downloads.
"""
import base64
import hashlib
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from firebase_functions import firestore_fn, https_fn, options, scheduler_fn
from firebase_admin import firestore, initialize_app, storage
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import google.auth
from google.auth.transport import requests as google_requests

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
    mode = data.get("mode", "relaxed")
    if mode not in ("relaxed", "strict"):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="mode must be 'relaxed' or 'strict'.",
        )
    return solve_ration(
        data.get("feeds", []),
        data.get("targets", []),
        data.get("constraints", {}),
        mode=mode,
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


def _post_feeding_inventory(db, farm_id, feeding_id):
    """Post a confirmed feeding's loaded lines exactly once.

    Shared by the trigger and the retry queue. The transaction re-reads the
    feeding, and the inventoryPostedAt guard makes a replay a no-op.
    """

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
            return "missing"
        current_data = current.to_dict() or {}
        if current_data.get("writeOffAt"):
            return "written-off"
        if current_data.get("inventoryPostedAt"):
            return "already-posted"
        if current_data.get("status") != "confirmed":
            return "not-confirmed"

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
                    "date": current_data.get("date"),
                    "createdBy": current_data.get("createdBy"),
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "note": f"feeding {feeding_id}",
                },
            )
        posted = len(ledger_writes)

        skipped_feed_ids = sorted(
            {
                item["feedId"]
                for item in skipped
                if item.get("feedId")
            }
        )
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
                "inventorySkippedFeedIds": skipped_feed_ids,
                "inventoryOverdrawn": overdrawn,
            },
        )
        # Written with the same transaction object as the ledger and the
        # feeding update: a crash before commit rolls the audit back too, so
        # there is no window where the ledger moves but the audit is missing.
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
                "skippedFeedIds": skipped_feed_ids,
                "overdrawn": overdrawn,
                "actorUid": current_data.get("createdBy"),
                "actorEmail": None,
                "at": firestore.SERVER_TIMESTAMP,
            },
        )
        return "posted"

    return apply(db.transaction())


_FAILURE_RETRY_LIMIT = 5
_FAILURE_STALE_SECONDS = 600
_ABANDON_AFTER_DAYS = 90


def _failure_ref(db, farm_id, feeding_id):
    return (
        db.collection("farms")
        .document(farm_id)
        .collection("feedingTriggerFailures")
        .document(feeding_id)
    )


def _record_trigger_failure(db, farm_id, feeding_id, error):
    ref = _failure_ref(db, farm_id, feeding_id)

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        existing = snapshot.to_dict() if snapshot.exists else {}
        retry_count = int(existing.get("retryCount") or 0) + 1
        transaction.set(
            ref,
            {
                "farmId": farm_id,
                "feedingId": feeding_id,
                "error": str(error)[:1000],
                "status": "pending",
                "retryCount": retry_count,
                "attemptedAt": existing.get("attemptedAt")
                or firestore.SERVER_TIMESTAMP,
                "lastRetryAt": firestore.SERVER_TIMESTAMP,
                "lockedBy": None,
                "lockedAt": None,
            },
            merge=True,
        )

    apply(db.transaction())


def _resolve_trigger_failure(
    db, farm_id, feeding_id, resolved_by, reason="trigger"
):
    ref = _failure_ref(db, farm_id, feeding_id)

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            return
        data = snapshot.to_dict() or {}
        if data.get("status") == "resolved":
            return
        transaction.update(
            ref,
            {
                "status": "resolved",
                "resolvedAt": firestore.SERVER_TIMESTAMP,
                "resolvedBy": resolved_by,
                "lockedBy": None,
                "lockedAt": None,
            },
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "feeding.trigger_resolved",
                "farmId": farm_id,
                "feedingId": feeding_id,
                "resolvedBy": resolved_by,
                "reason": reason,
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())


def _claim_failure(db, farm_id, feeding_id, instance_id, allow_dead=False):
    """Atomically claim a pending/dead/stale-retrying failure."""
    ref = _failure_ref(db, farm_id, feeding_id)
    now = datetime.now(timezone.utc)

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        status = data.get("status")
        stale = False
        locked_at = data.get("lockedAt")
        if status == "retrying" and locked_at is not None:
            try:
                stale = (
                    now.timestamp() - locked_at.timestamp()
                ) > _FAILURE_STALE_SECONDS
            except Exception:
                stale = True
        allowed = (
            status == "pending"
            or stale
            or (allow_dead and status == "dead")
        )
        if not allowed:
            return None
        transaction.update(
            ref,
            {
                "status": "retrying",
                "lockedBy": instance_id,
                "lockedAt": firestore.SERVER_TIMESTAMP,
            },
        )
        return data

    return apply(db.transaction())


def _fail_retry(db, farm_id, feeding_id, error):
    ref = _failure_ref(db, farm_id, feeding_id)

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            return
        data = snapshot.to_dict() or {}
        retry_count = int(data.get("retryCount") or 0) + 1
        dead = retry_count >= _FAILURE_RETRY_LIMIT
        update = {
            "retryCount": retry_count,
            "error": str(error)[:1000],
            "lastRetryAt": firestore.SERVER_TIMESTAMP,
            "lockedBy": None,
            "lockedAt": None,
        }
        if dead:
            update["status"] = "dead"
            update["deadAt"] = firestore.SERVER_TIMESTAMP
        else:
            update["status"] = "pending"
        transaction.update(ref, update)
        if dead:
            _write_audit(
                transaction,
                db,
                farm_id,
                {
                    "action": "feeding.trigger_dead",
                    "farmId": farm_id,
                    "feedingId": feeding_id,
                    "retryCount": retry_count,
                    "error": str(error)[:1000],
                    "at": firestore.SERVER_TIMESTAMP,
                },
            )

    apply(db.transaction())


def _write_off_feeding(
    transaction,
    db,
    farm_id,
    feeding_id,
    feeding_data,
    source="abandoned",
    created_by="trigger_abandoned",
):
    """Read the items/ledgers and book per-line write_off entries.

    Must be called before the caller writes anything else in the transaction.
    Returns the line ids, per-line details and totals.
    """
    prepared = []
    if feeding_data:
        for line in feeding_data.get("lines") or []:
            line_id = line.get("lineId")
            feed_id = line.get("feedId")
            loaded = float(line.get("loadedKgAsFed") or 0)
            if not line_id or not feed_id or loaded <= 0:
                continue
            item_ref = _inventory_item_ref(db, farm_id, feed_id)
            item = item_ref.get(transaction=transaction)
            ledger_ref = (
                db.collection("farms")
                .document(farm_id)
                .collection("inventoryTransactions")
                .document(f"{farm_id}_{feeding_id}_{line_id}_writeoff")
            )
            ledger = ledger_ref.get(transaction=transaction)
            prepared.append(
                (line, feed_id, loaded, item_ref, item, ledger_ref, ledger)
            )

    item_before = {}
    item_refs = {}
    total_by_feed = {}
    write_off_lines = []
    write_off_details = []
    running = {}
    for line, feed_id, loaded, item_ref, item, ledger_ref, ledger in prepared:
        if ledger.exists or not item.exists:
            continue
        item_data = item.to_dict() or {}
        if feed_id not in item_before:
            item_before[feed_id] = float(
                item_data.get("onHandKgAsFed") or 0
            )
            item_refs[feed_id] = item_ref
            running[feed_id] = item_before[feed_id]
        unit_cost = float(
            line.get("costPerKgAsFed")
            or item_data.get("unitCostPerKgAsFed")
            or 0
        )
        before_kg = running[feed_id]
        after_kg = before_kg - loaded
        running[feed_id] = after_kg
        transaction.set(
            ledger_ref,
            {
                "itemId": feed_id,
                "type": "write_off",
                "deltaKgAsFed": -loaded,
                "unitCostPerKgAsFed": unit_cost,
                "sourceType": source,
                "sourceId": line.get("lineId"),
                "idempotencyKey": f"{farm_id}_{feeding_id}_{line.get('lineId')}_writeoff",
                "date": feeding_data.get("date"),
                "createdBy": created_by,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "note": f"write-off feeding {feeding_id}",
            },
        )
        total_by_feed[feed_id] = total_by_feed.get(feed_id, 0.0) + loaded
        write_off_lines.append(line.get("lineId"))
        write_off_details.append(
            {
                "lineId": line.get("lineId"),
                "feedId": feed_id,
                "deltaKgAsFed": -loaded,
                "unitCostPerKgAsFed": unit_cost,
                "onHandBeforeKgAsFed": before_kg,
                "onHandAfterKgAsFed": after_kg,
            }
        )

    for feed_id, total in total_by_feed.items():
        transaction.update(
            item_refs[feed_id],
            {
                "onHandKgAsFed": item_before[feed_id] - total,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
    return {
        "writeOffLines": write_off_lines,
        "writeOffs": write_off_details,
        "totalByFeed": total_by_feed,
    }


def _abandon_dead_failure(db, farm_id, feeding_id):
    """Abandon a dead failure after 90 days and book the physical write-off."""
    ref = _failure_ref(db, farm_id, feeding_id)
    feeding_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("feedings")
        .document(feeding_id)
    )
    now = datetime.now(timezone.utc)

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            return False
        data = snapshot.to_dict() or {}
        if data.get("status") != "dead":
            return False
        dead_at = data.get("deadAt")
        if dead_at is None:
            return False
        try:
            age = now.timestamp() - dead_at.timestamp()
        except Exception:
            return False
        if age < _ABANDON_AFTER_DAYS * 86400:
            return False

        feeding = feeding_ref.get(transaction=transaction)
        feeding_data = feeding.to_dict() if feeding.exists else {}
        already_posted = bool(
            feeding_data.get("inventoryPostedAt")
            or feeding_data.get("writeOffAt")
        )

        # If a manual adjustment was recorded for one of the affected items
        # after the failure, do not auto-write-off: the operator may have
        # already handled the load. Escalate for a human decision instead.
        if feeding.exists and not already_posted:
            attempted_at = data.get("attemptedAt")
            expected_consumption = [
                {
                    "lineId": line.get("lineId"),
                    "feedId": line.get("feedId"),
                    "kg": float(line.get("loadedKgAsFed") or 0),
                }
                for line in feeding_data.get("lines") or []
                if line.get("lineId") and line.get("feedId")
            ]
            for feed_id in {
                line.get("feedId")
                for line in feeding_data.get("lines") or []
                if line.get("feedId")
            }:
                adjustments = (
                    db.collection("farms")
                    .document(farm_id)
                    .collection("inventoryTransactions")
                    .where("itemId", "==", feed_id)
                )
                for entry in transaction.get(adjustments):
                    entry_data = entry.to_dict() or {}
                    if entry_data.get("type") != "adjustment":
                        continue
                    created_at = entry_data.get("createdAt")
                    if (
                        attempted_at is not None
                        and created_at is not None
                        and created_at < attempted_at
                    ):
                        continue
                    transaction.update(
                        ref,
                        {
                            "status": "needs-review",
                            "reviewReason": "adjustment-detected",
                            "reviewedAt": firestore.SERVER_TIMESTAMP,
                            "lockedBy": None,
                            "lockedAt": None,
                        },
                    )
                    _write_audit(
                        transaction,
                        db,
                        farm_id,
                        {
                            "action": "feeding.trigger_needs_review",
                            "farmId": farm_id,
                            "feedingId": feeding_id,
                            "reason": "adjustment-detected",
                            "detectedAdjustments": [
                                {
                                    "itemId": feed_id,
                                    "transactionId": entry.id,
                                    "deltaKgAsFed": entry_data.get(
                                        "deltaKgAsFed"
                                    ),
                                    "createdAt": created_at,
                                }
                            ],
                            "expectedConsumption": expected_consumption,
                            "at": firestore.SERVER_TIMESTAMP,
                        },
                    )
                    return True

        write_off = _write_off_feeding(
            transaction, db, farm_id, feeding_id, feeding_data
        )
        write_off_lines = write_off["writeOffLines"]
        write_off_details = write_off["writeOffs"]
        total_by_feed = write_off["totalByFeed"]

        if feeding.exists and not already_posted:
            transaction.update(
                feeding_ref, {"writeOffAt": firestore.SERVER_TIMESTAMP}
            )
        transaction.delete(ref)
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "feeding.trigger_abandoned",
                "farmId": farm_id,
                "feedingId": feeding_id,
                "retryCount": data.get("retryCount"),
                "deadAt": dead_at,
                "alreadyPosted": already_posted,
                "writeOffLines": write_off_lines,
                "writeOffs": write_off_details,
                "writeOffKgAsFed": sum(total_by_feed.values()),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )
        return True

    return apply(db.transaction())


def _retry_one_failure(db, farm_id, feeding_id, instance_id, allow_dead=False):
    if _claim_failure(db, farm_id, feeding_id, instance_id, allow_dead) is None:
        return False
    try:
        result = _post_feeding_inventory(db, farm_id, feeding_id)
    except Exception as error:
        _fail_retry(db, farm_id, feeding_id, error)
        return False
    reason = {
        "already-posted": "already-posted",
        "written-off": "written-off",
        "missing": "missing-feeding",
        "not-confirmed": "not-confirmed",
    }.get(result, "retry-succeeded")
    _resolve_trigger_failure(db, farm_id, feeding_id, instance_id, reason)
    return True


@firestore_fn.on_document_written(
    document="farms/{farmId}/feedings/{feedingId}",
    memory=options.MemoryOption.MB_256,
    region="europe-west1",
)
def on_feeding_confirmed(event: firestore_fn.Event) -> None:
    """Consume the loaded kg of a confirmed feeding from inventory.

    On failure the posting is queued in feedingTriggerFailures; the scheduled
    retry and the admin bulk retry both reuse _post_feeding_inventory.
    """
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
    try:
        _post_feeding_inventory(db, farm_id, feeding_id)
        _resolve_trigger_failure(db, farm_id, feeding_id, "trigger")
    except Exception as error:
        _record_trigger_failure(db, farm_id, feeding_id, error)
        raise


def _write_scan_heartbeat(db, status, scanned, open_failures=0, error=None):
    payload = {
        "lastRunAt": firestore.SERVER_TIMESTAMP,
        "lastRunStatus": status,
        "docsScanned": scanned,
        "openFailures": open_failures,
        "error": None if error is None else str(error)[:500],
    }
    db.collection("system").document("feedingRetryScan").set(
        payload, merge=True
    )


@scheduler_fn.on_schedule(
    schedule="*/5 * * * *",
    timezone=scheduler_fn.Timezone("Europe/Rome"),
    memory=options.MemoryOption.MB_256,
    timeout_sec=300,
    region="europe-west1",
)
def scheduled_feeding_retry(event: scheduler_fn.ScheduledEvent) -> None:
    """Retry pending trigger failures; stale claims are reclaimed after 10m."""
    db = firestore.client()
    instance_id = f"scheduled-{uuid.uuid4()}"
    scanned = 0
    open_failures = 0
    try:
        # Equality queries use the (status, deadAt) composite prefix. An `in`
        # query would additionally require a collection-group single-field index;
        # the two scans avoid that dependency.
        for scan_status in ("pending", "retrying"):
            docs = list(
                db.collection_group("feedingTriggerFailures")
                .where("status", "==", scan_status)
                .limit(20)
                .stream()
            )
            scanned += len(docs)
            open_failures += len(docs)
            for doc in docs:
                data = doc.to_dict() or {}
                farm_id = data.get("farmId")
                if farm_id:
                    _retry_one_failure(db, farm_id, doc.id, instance_id)

        cutoff = datetime.now(timezone.utc) - timedelta(
            days=_ABANDON_AFTER_DAYS
        )
        dead_docs = list(
            db.collection_group("feedingTriggerFailures")
            .where("status", "==", "dead")
            .where("deadAt", "<", cutoff)
            .limit(50)
            .stream()
        )
        scanned += len(dead_docs)
        for doc in dead_docs:
            data = doc.to_dict() or {}
            farm_id = data.get("farmId")
            if farm_id:
                _abandon_dead_failure(db, farm_id, doc.id)
        _write_scan_heartbeat(db, "ok", scanned, open_failures)
    except Exception as error:
        try:
            _write_scan_heartbeat(
                db, "error", scanned, open_failures, error
            )
        except Exception:
            pass
        raise


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=120,
    region="europe-west1",
)
def retry_feeding_failures(req: https_fn.CallableRequest):
    """Owner/admin bulk retry of pending or dead feeding postings."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)
    status = data.get("status")
    failures = (
        db.collection("farms")
        .document(farm_id)
        .collection("feedingTriggerFailures")
    )
    if status in ("pending", "dead"):
        query = failures.where("status", "==", status)
    else:
        query = failures.where("status", "in", ["pending", "dead"])
    instance_id = f"manual-{req.auth.uid}-{uuid.uuid4()}"
    resolved = 0
    failed = 0
    for doc in query.stream():
        if _retry_one_failure(db, farm_id, doc.id, instance_id, allow_dead=True):
            resolved += 1
        else:
            failed += 1
    return {"ok": True, "resolved": resolved, "failed": failed}


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def mark_feeding_failure_handled(req: https_fn.CallableRequest):
    """Resolve a failure with an adjustment, a write-off, or an explicit ack."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    feeding_id = _require_string(data, "feedingId")
    resolution = data.get("resolution", "manual-adjustment")
    if resolution not in (
        "manual-adjustment",
        "acknowledged-no-action",
        "write-off",
    ):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Unknown resolution.",
        )
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)
    ref = _failure_ref(db, farm_id, feeding_id)
    feeding_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("feedings")
        .document(feeding_id)
    )
    stored_resolution = (
        "manual-write-off" if resolution == "write-off" else resolution
    )

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Failure not found.",
            )
        current = snapshot.to_dict() or {}
        if current.get("status") == "resolved":
            return {"alreadyResolved": True}
        if current.get("status") == "retrying":
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="A retry is in progress.",
            )

        extra = {}
        if resolution == "write-off":
            feeding = feeding_ref.get(transaction=transaction)
            if not feeding.exists:
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                    message="Feeding not found; cannot write off.",
                )
            feeding_data = feeding.to_dict() or {}
            if (
                feeding_data.get("inventoryPostedAt")
                or feeding_data.get("writeOffAt")
            ):
                extra = {
                    "writeOffLines": [],
                    "writeOffs": [],
                }
            else:
                write_off = _write_off_feeding(
                    transaction,
                    db,
                    farm_id,
                    feeding_id,
                    feeding_data,
                    source="manual-write-off",
                    created_by=req.auth.uid,
                )
                transaction.update(
                    feeding_ref,
                    {"writeOffAt": firestore.SERVER_TIMESTAMP},
                )
                extra = {
                    "writeOffLines": write_off["writeOffLines"],
                    "writeOffs": write_off["writeOffs"],
                }
        elif resolution == "manual-adjustment":
            feeding = feeding_ref.get(transaction=transaction)
            feeding_data = feeding.to_dict() if feeding.exists else {}
            attempted_at = current.get("attemptedAt")
            feed_ids = {
                line.get("feedId")
                for line in feeding_data.get("lines") or []
                if line.get("feedId")
            }
            uncovered = []
            for feed_id in sorted(feed_ids):
                found = False
                adjustments = (
                    db.collection("farms")
                    .document(farm_id)
                    .collection("inventoryTransactions")
                    .where("itemId", "==", feed_id)
                )
                for entry in transaction.get(adjustments):
                    entry_data = entry.to_dict() or {}
                    if entry_data.get("type") != "adjustment":
                        continue
                    created_at = entry_data.get("createdAt")
                    if (
                        attempted_at is not None
                        and created_at is not None
                        and created_at <= attempted_at
                    ):
                        continue
                    found = True
                    break
                if not found:
                    uncovered.append(feed_id)
            if uncovered:
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                    message=(
                        "Adjust every affected item first; uncovered: "
                        + ", ".join(uncovered)
                    ),
                )

        transaction.update(
            ref,
            {
                "status": "resolved",
                "resolvedAt": firestore.SERVER_TIMESTAMP,
                "resolvedBy": req.auth.uid,
                "resolution": stored_resolution,
                "lockedBy": None,
                "lockedAt": None,
            },
        )
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "feeding.trigger_resolved",
                "farmId": farm_id,
                "feedingId": feeding_id,
                "resolvedBy": req.auth.uid,
                "reason": stored_resolution,
                "at": firestore.SERVER_TIMESTAMP,
                **extra,
            },
        )
        return {"alreadyResolved": False, **extra}

    result = apply(db.transaction())
    return {"ok": True, **result}


# ── Retroactive posting ─────────────────────────────────────────────────────
# A feed may have been loaded before it had an inventory item; the trigger
# recorded those lines in inventorySkippedLines / inventorySkippedFeedIds.
# Once the item exists, an owner/admin can post them as retoractive
# adjustments. This is a separate, auditable action, not part of the trigger.


def _retro_post_feeding(db, farm_id, feed_id, feeding_id, uid, email):
    feeding_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("feedings")
        .document(feeding_id)
    )
    item_ref = _inventory_item_ref(db, farm_id, feed_id)

    @firestore.transactional
    def apply(transaction):
        current = feeding_ref.get(transaction=transaction)
        if not current.exists:
            return 0
        current_data = current.to_dict() or {}
        skipped = list(current_data.get("inventorySkippedLines") or [])
        matching = [line for line in skipped if line.get("feedId") == feed_id]
        if not matching:
            return 0
        lines_by_id = {
            line.get("lineId"): line for line in (current_data.get("lines") or [])
        }
        item = item_ref.get(transaction=transaction)
        if not item.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Create the inventory item before posting retroactively.",
            )
        item_data = item.to_dict() or {}
        before = float(item_data.get("onHandKgAsFed") or 0)

        prepared = []
        for skipped_line in matching:
            line_id = skipped_line.get("lineId")
            full_line = lines_by_id.get(line_id) or {}
            loaded = float(full_line.get("loadedKgAsFed") or 0)
            if loaded <= 0:
                continue
            ledger_ref = (
                db.collection("farms")
                .document(farm_id)
                .collection("inventoryTransactions")
                .document(f"{farm_id}_{feeding_id}_{line_id}")
            )
            ledger_snap = ledger_ref.get(transaction=transaction)
            prepared.append(
                (skipped_line, ledger_ref, ledger_snap, loaded, full_line)
            )

        total = 0.0
        posted = 0
        running = before
        audit_lines = []
        for skipped_line, ledger_ref, ledger_snap, loaded, full_line in prepared:
            if ledger_snap.exists:
                continue
            line_id = skipped_line.get("lineId")
            # Historical load cost, not today's replacement cost.
            unit_cost = float(
                full_line.get("costPerKgAsFed")
                or item_data.get("unitCostPerKgAsFed")
                or 0
            )
            transaction.set(
                ledger_ref,
                {
                    "itemId": feed_id,
                    "type": "adjustment",
                    "deltaKgAsFed": -loaded,
                    "unitCostPerKgAsFed": unit_cost,
                    "sourceType": "retroactive",
                    "sourceId": line_id,
                    "idempotencyKey": f"{farm_id}_{feeding_id}_{line_id}",
                    "date": current_data.get("date"),
                    "createdBy": uid,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "note": f"retroactive feeding {feeding_id}",
                },
            )
            total += loaded
            posted += 1
            audit_lines.append((line_id, running, running - loaded, unit_cost))
            running -= loaded

        if total > 0:
            transaction.update(
                item_ref,
                {
                    "onHandKgAsFed": before - total,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
            )

        # Remove the lines that were just posted from the skipped surface.
        remaining = [line for line in skipped if line.get("feedId") != feed_id]
        remaining_feed_ids = sorted(
            {
                line["feedId"]
                for line in remaining
                if line.get("feedId")
            }
        )
        transaction.update(
            feeding_ref,
            {
                "inventorySkippedLines": remaining,
                "inventorySkippedFeedIds": remaining_feed_ids,
            },
        )
        cleared_ids = [
            line.get("lineId") for line in matching if line.get("lineId")
        ]
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "feeding.skipped_cleared",
                "farmId": farm_id,
                "feedingId": feeding_id,
                "clearedSkippedLineIds": cleared_ids,
                "remainingSkippedFeedIds": remaining_feed_ids,
                "actorUid": uid,
                "actorEmail": email,
                "at": firestore.SERVER_TIMESTAMP,
            },
        )
        for line_id, line_before, line_after, unit_cost in audit_lines:
            _write_audit(
                transaction,
                db,
                farm_id,
                {
                    "action": "inventory.retroactive",
                    "farmId": farm_id,
                    "itemId": feed_id,
                    "sourceFeedingId": feeding_id,
                    "sourceLineId": line_id,
                    "deltaKgAsFed": -(line_before - line_after),
                    "unitCostPerKgAsFed": unit_cost,
                    "onHandBeforeKgAsFed": line_before,
                    "onHandAfterKgAsFed": line_after,
                    "overdrawn": line_after < 0,
                    "actorUid": uid,
                    "actorEmail": email,
                    "at": firestore.SERVER_TIMESTAMP,
                },
            )
        return posted

    return apply(db.transaction())


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def post_skipped_consumption(req: https_fn.CallableRequest):
    """Post previously skipped feeding lines once the inventory item exists."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    feed_id = _require_string(data, "feedId")
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)

    transactions = db.collection("farms").document(farm_id).collection(
        "inventoryTransactions"
    )
    already_posted = sum(
        1
        for entry in transactions.where("itemId", "==", feed_id).stream()
        if (entry.to_dict() or {}).get("sourceType") == "retroactive"
    )

    feedings = list(
        db.collection("farms")
        .document(farm_id)
        .collection("feedings")
        .where("inventorySkippedFeedIds", "array_contains", feed_id)
        .where("status", "==", "confirmed")
        .stream()
    )
    posted = 0
    touched = 0
    email = (req.auth.token or {}).get("email")
    for feeding in feedings:
        count = _retro_post_feeding(
            db, farm_id, feed_id, feeding.id, req.auth.uid, email
        )
        posted += count
        if count > 0:
            touched += 1

    # Reconcile the item from the ledger so an existing drift is corrected
    # immediately rather than waiting for the next scheduled pass.
    item_ref = _inventory_item_ref(db, farm_id, feed_id)
    item = item_ref.get()
    total = 0.0
    if item.exists:
        for entry in (
            db.collection("farms")
            .document(farm_id)
            .collection("inventoryTransactions")
            .where("itemId", "==", feed_id)
            .stream()
        ):
            total += float((entry.to_dict() or {}).get("deltaKgAsFed") or 0)
        item_ref.update(
            {"onHandKgAsFed": total, "updatedAt": firestore.SERVER_TIMESTAMP}
        )

    return {
        "ok": True,
        "postedLines": posted,
        "alreadyPosted": already_posted,
        "feedings": touched,
        "onHandKgAsFed": total,
    }


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def set_farm_milk_price(req: https_fn.CallableRequest):
    """Owner/admin sets the farm-level IOFC milk price, with an audit entry."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    farm_id = _require_string(data, "farmId")
    raw = data.get("milkPricePerKg")
    if (
        not isinstance(raw, (int, float))
        or isinstance(raw, bool)
        or raw < 0
        or raw > 100
    ):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="milkPricePerKg must be between 0 and 100.",
        )
    value = float(raw)
    db = _require_farm_role(farm_id, req.auth.uid, _INVENTORY_ADMIN_ROLES)
    farm_ref = db.collection("farms").document(farm_id)

    @firestore.transactional
    def apply(transaction):
        snapshot = farm_ref.get(transaction=transaction)
        if not snapshot.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Farm not found.",
            )
        before = (snapshot.to_dict() or {}).get("milkPricePerKg")
        transaction.update(farm_ref, {"milkPricePerKg": value})
        _write_audit(
            transaction,
            db,
            farm_id,
            {
                "action": "farm.milk_price_changed",
                "farmId": farm_id,
                "before": before,
                "after": value,
                "actorUid": req.auth.uid,
                "actorEmail": (req.auth.token or {}).get("email"),
                "at": firestore.SERVER_TIMESTAMP,
            },
        )

    apply(db.transaction())
    return {"ok": True, "milkPricePerKg": value}


# ── Scenarios ───────────────────────────────────────────────────────────────
# Writes are callable-only (rules deny client writes). The server loads the
# base recipe/feeds/targets, recomputes the snapshot, and writes the audit
# record; the client cannot supply a snapshot.

_SCENARIO_ROLES = ("owner", "farmAdmin", "consultant")
_SCENARIO_DELETE_ROLES = ("owner", "farmAdmin")
_SCENARIO_MAX_NAME = 100
_SCENARIO_MAX_COUNT = 200


def _target_ranges():
    with open(os.path.join(os.path.dirname(__file__), "target_ranges.json")) as handle:
        return json.load(handle)


def _scenario_base(db, farm_id, recipe_id):
    recipe_ref = db.collection("recipes").document(recipe_id)
    recipe = recipe_ref.get()
    if not recipe.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="base-deleted",
        )
    recipe_data = recipe.to_dict() or {}
    if recipe_data.get("farmId") != farm_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Recipe belongs to another farm.",
        )
    animal_group = recipe_data.get("animalGroupId")
    ranges = _target_ranges()
    if animal_group not in ranges:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Unknown animal group.",
        )

    feeds = []
    for line in recipe_ref.collection("feeds").stream():
        line_data = line.to_dict() or {}
        feed_ref = db.collection("feeds").document(line_data.get("feedId", ""))
        feed = feed_ref.get()
        if not feed.exists:
            continue
        feed_data = feed.to_dict() or {}
        if feed_data.get("farmId") != farm_id:
            continue
        feeds.append(
            {
                "id": feed.id,
                "name": feed_data.get("name", feed.id),
                "moisturePct": feed_data.get("moisturePct", 0),
                "nutrients": feed_data.get("nutrients") or {},
                "pricePerKg": feed_data.get("pricePerKg", 0),
                "category": feed_data.get("category", "concentrate"),
                "kgAsFed": line_data.get("kgAsFed", 0),
            }
        )

    override_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("targetOverrides")
        .document(animal_group)
    )
    override_doc = override_ref.get()
    overrides = (override_doc.to_dict() or {}).get("nutrients", {}) if override_doc.exists else {}
    targets = []
    for target in ranges[animal_group]:
        entry = overrides.get(target["nutrientCode"])
        if entry:
            targets.append(
                {
                    **target,
                    "minValue": entry.get("minValue"),
                    "maxValue": entry.get("maxValue"),
                    "source": "override",
                }
            )
        else:
            targets.append(target)
    return {
        "baseSource": "saved-recipe",
        "recipeId": recipe_id,
        "recipeName": recipe_data.get("name", recipe_id),
        "animalGroupId": animal_group,
        "feeds": feeds,
        "targets": targets,
    }


def _scenario_base_from_builder(db, farm_id, data):
    """Validate a builder-state base: feeds must exist and have positive DM."""
    lines = data.get("baseLines")
    if not isinstance(lines, list) or not lines:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="baseLines is required for a builder base.",
        )
    animal_group = data.get("animalGroupId")
    ranges = _target_ranges()
    if animal_group not in ranges:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Unknown animal group.",
        )
    feeds = []
    for line in lines:
        if not isinstance(line, dict):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="baseLines entries must be objects.",
            )
        feed_id = line.get("feedId")
        kg = line.get("kgAsFed")
        if not isinstance(feed_id, str) or not feed_id:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="baseLines feedId is required.",
            )
        if isinstance(kg, bool) or not isinstance(kg, (int, float)) or kg < 0:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="baseLines kgAsFed must be a non-negative number.",
            )
        feed = db.collection("feeds").document(feed_id).get()
        if not feed.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"unknown_feed: {feed_id}",
            )
        feed_data = feed.to_dict() or {}
        if feed_data.get("farmId") != farm_id:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
                message="Feed belongs to another farm.",
            )
        feeds.append(
            {
                "id": feed_id,
                "name": feed_data.get("name", feed_id),
                "moisturePct": feed_data.get("moisturePct", 0),
                "nutrients": feed_data.get("nutrients") or {},
                "pricePerKg": feed_data.get("pricePerKg", 0),
                "category": feed_data.get("category", "concentrate"),
                "kgAsFed": kg,
            }
        )
    if sum(f["kgAsFed"] * (1 - f["moisturePct"] / 100) for f in feeds) <= 0:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Base has no dry matter.",
        )

    override_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("targetOverrides")
        .document(animal_group)
    )
    override_doc = override_ref.get()
    overrides = (override_doc.to_dict() or {}).get("nutrients", {}) if override_doc.exists else {}
    targets = []
    for target in ranges[animal_group]:
        entry = overrides.get(target["nutrientCode"])
        if entry:
            targets.append(
                {
                    **target,
                    "minValue": entry.get("minValue"),
                    "maxValue": entry.get("maxValue"),
                    "source": "override",
                }
            )
        else:
            targets.append(target)
    return {
        "baseSource": "builder",
        "recipeId": None,
        "recipeName": data.get("name", "Builder"),
        "animalGroupId": animal_group,
        "feeds": feeds,
        "targets": targets,
    }


def _canonical_kg(value):
    rounded = round(float(value), 3)
    return int(rounded) if rounded.is_integer() else rounded


def _hash_scenario_lines(lines):
    normalized = sorted(
        (
            {
                "feedId": line["feedId"],
                "kgAsFed": _canonical_kg(line["kgAsFed"]),
            }
            for line in lines
            if float(line["kgAsFed"]) > 0
        ),
        key=lambda line: line["feedId"],
    )
    return hashlib.sha256(
        json.dumps(normalized, separators=(",", ":")).encode()
    ).hexdigest()


def _base_hash(base):
    return _hash_scenario_lines(
        [{"feedId": feed["id"], "kgAsFed": feed["kgAsFed"]} for feed in base["feeds"]]
    )


def _validate_scenario_changes(base, changes, override_codes):
    if not isinstance(changes, dict):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="changes must be an object.",
        )
    feed_ids = {feed["id"] for feed in base["feeds"]}
    for key in ("feedPrices", "inclusions"):
        values = changes.get(key)
        if values is None:
            continue
        if not isinstance(values, dict):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"{key} must be an object.",
            )
        unknown = set(values) - feed_ids
        if unknown:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"unknown_feed: {sorted(unknown)}",
            )
    overrides = changes.get("targetOverrides")
    if overrides is not None:
        if not isinstance(overrides, dict):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message="targetOverrides must be an object.",
            )
        unknown = set(overrides) - set(override_codes)
        if unknown:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"invalid_override: {sorted(unknown)}",
            )
        for code, entry in overrides.items():
            if not isinstance(entry, dict):
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                    message="targetOverrides entries must be objects.",
                )
            for bound in ("min", "max"):
                value = entry.get(bound)
                if value is not None and (
                    isinstance(value, bool) or not isinstance(value, (int, float))
                ):
                    raise https_fn.HttpsError(
                        code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                        message="override bounds must be numbers or null.",
                    )
            min_value = entry.get("min")
            max_value = entry.get("max")
            if (
                min_value is not None
                and max_value is not None
                and min_value > max_value
            ):
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                    message=f"invalid_override: invalid_bounds {code} min {min_value} > max {max_value}",
                )


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def save_scenario(req: https_fn.CallableRequest):
    """Validate and persist one scenario with a server-computed snapshot."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data
    farm_id = _require_string(data, "farmId")
    uid = req.auth.uid
    db = _require_farm_role(farm_id, uid, _SCENARIO_ROLES)
    name = _require_string(data, "name").strip()
    if len(name) > _SCENARIO_MAX_NAME or "/" in name:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="name is too long or contains '/'.",
        )
    scenario_id = _require_string(data, "scenarioId")
    try:
        uuid.UUID(scenario_id)
    except ValueError as exc:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="scenarioId must be a UUID.",
        ) from exc

    base_source = data.get("baseSource", "saved-recipe")
    if base_source not in ("saved-recipe", "builder"):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="unsupported_base_source",
        )
    if base_source == "builder":
        base = _scenario_base_from_builder(db, farm_id, data)
        recipe_id = None
    else:
        recipe_id = _require_string(data, "baseRecipeId")
        base = _scenario_base(db, farm_id, recipe_id)
    override_codes = set()
    override_ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("targetOverrides")
        .document(base["animalGroupId"])
        .get()
    )
    if override_ref.exists:
        override_codes = set((override_ref.to_dict() or {}).get("nutrients", {}).keys())

    changes = data.get("changes", {})
    _validate_scenario_changes(base, changes, override_codes)

    from scenario import apply_scenario  # local import keeps cold start lean

    snapshot = apply_scenario(base, changes)
    ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("scenarios")
        .document(scenario_id)
    )
    if ref.get().exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.ALREADY_EXISTS,
            message="scenarioId already exists.",
        )
    server_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ref.set(
        {
            "farmId": farm_id,
            "name": name,
            "baseSource": base_source,
            "baseRecipeId": recipe_id,
            "baseHash": _base_hash(base) if base_source == "builder" else None,
            "baseLines": [
                {"feedId": feed["id"], "kgAsFed": feed["kgAsFed"]}
                for feed in base["feeds"]
            ]
            if base_source == "builder"
            else None,
            "changes": changes,
            "resultSnapshot": snapshot,
            "createdBy": uid,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "savedAt": firestore.SERVER_TIMESTAMP,
            "deletedAt": None,
        }
    )
    return {
        "scenarioId": scenario_id,
        "snapshot": snapshot,
        "serverTime": server_time,
    }


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=30,
    region="europe-west1",
)
def delete_scenario(req: https_fn.CallableRequest):
    """Soft-delete a scenario; owner/admin only."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data
    farm_id = _require_string(data, "farmId")
    scenario_id = _require_string(data, "scenarioId")
    db = _require_farm_role(farm_id, req.auth.uid, _SCENARIO_DELETE_ROLES)
    ref = (
        db.collection("farms")
        .document(farm_id)
        .collection("scenarios")
        .document(scenario_id)
    )
    existing = ref.get()
    if not existing.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Scenario not found.",
        )
    if (existing.to_dict() or {}).get("deletedAt") is not None:
        return {"ok": True, "alreadyDeleted": True}
    ref.update({"deletedAt": firestore.SERVER_TIMESTAMP})
    return {"ok": True, "alreadyDeleted": False}


# ── Comparison export A1: reference Confronto only ──────────────────────────
_COMPARISON_HEADERS = [
    ("source", "Fonte"),
    ("status", "Stato"),
    ("totalDM", "SS totali"),
    ("totalCost", "Costo"),
    ("warnings", "Avvisi"),
]


def _reference_confronto_rows():
    from solver import solve_ration

    data = json.load(open(os.path.join(os.path.dirname(__file__), "tests", "reference_rations.json")))
    reference = data["lactating"]
    feeds = [
        {
            "id": feed["id"],
            "name": feed["name"],
            "dmFactor": feed["dmFactor"],
            "nutrients": feed["nutrients"],
            "pricePerKg": feed["pricePerKg"],
            "category": feed.get("category", "concentrate"),
        }
        for feed in reference["feeds"]
    ]
    targets = [
        {"code": target["nutrientCode"], "min": target["minValue"], "max": target["maxValue"]}
        for target in reference["targets"]
        if target.get("isActive", True)
    ]
    constraints = {"totalDM": reference["solverTotalDM"]}
    relaxed = solve_ration(feeds, targets, constraints, mode="relaxed")
    strict = solve_ration(feeds, targets, constraints, mode="strict")
    rows = [
        {
            "source": "workbook",
            "status": "hand-ration",
            "totalDM": reference["workbookTotalDM"],
            "totalCost": reference["costPerHead"],
            "warnings": "",
        },
        {
            "source": "relaxed-solver",
            "status": relaxed.get("status", ""),
            "totalDM": relaxed.get("totalDM"),
            "totalCost": relaxed.get("totalCost"),
            "warnings": _format_warnings(relaxed.get("warnings", [])),
        },
        {
            "source": "strict-solver",
            "status": strict.get("status", ""),
            "totalDM": strict.get("totalDM"),
            "totalCost": strict.get("totalCost"),
            "warnings": _format_warnings(strict.get("warnings", [])),
        },
    ]
    return rows


def _saved_recipe_confronto_rows(db, farm_id, recipe_id):
    from scenario import apply_scenario
    from solver import solve_ration

    base = _scenario_base(db, farm_id, recipe_id)
    hand = apply_scenario(base, {})
    feeds = [
        {
            "id": feed["id"],
            "name": feed["name"],
            "dmFactor": 1 - feed["moisturePct"] / 100,
            "nutrients": feed["nutrients"],
            "pricePerKg": feed["pricePerKg"],
            "category": feed["category"],
        }
        for feed in base["feeds"]
    ]
    targets = [
        {"code": target["nutrientCode"], "min": target["minValue"], "max": target["maxValue"]}
        for target in base["targets"]
        if target.get("isActive", True)
    ]
    constraints = {"totalDM": hand["totalDM"]}
    relaxed = solve_ration(feeds, targets, constraints, mode="relaxed")
    strict = solve_ration(feeds, targets, constraints, mode="strict")
    return [
        {
            "source": "workbook",
            "status": "hand-ration",
            "totalDM": hand["totalDM"],
            "totalCost": hand["totalCost"],
            "warnings": _format_warnings(hand["warnings"]),
        },
        {
            "source": "relaxed-solver",
            "status": relaxed.get("status", ""),
            "totalDM": relaxed.get("totalDM"),
            "totalCost": relaxed.get("totalCost"),
            "warnings": _format_warnings(relaxed.get("warnings", [])),
        },
        {
            "source": "strict-solver",
            "status": strict.get("status", ""),
            "totalDM": strict.get("totalDM"),
            "totalCost": strict.get("totalCost"),
            "warnings": _format_warnings(strict.get("warnings", [])),
        },
    ]


def _format_warnings(warnings):
    return "\n".join(
        f"{w['code']}|{w['value']}|{w['min']}|{w['max']}|{w['issue']}|{w.get('boundary', '')}"
        for w in warnings
    )


def _sensitivity_columns(snapshot):
    if snapshot.get("status") == "infeasible" or not snapshot.get("lines"):
        return {f"feed_top{slot}": None for slot in (1, 2, 3)} | {
            f"delta_top{slot}_{shock}": None
            for slot in (1, 2, 3)
            for shock in ("+5", "-5", "+10", "-10")
        }
    ranking = sorted(
        (
            {
                "feedId": line["feedId"],
                "contribution": line["unitCostPerKgAsFed"] * line["kgAsFed"],
                "line": line,
            }
            for line in snapshot["lines"]
        ),
        key=lambda item: (-item["contribution"], item["feedId"]),
    )[:3]
    result = {}
    for slot in (1, 2, 3):
        item = ranking[slot - 1] if len(ranking) >= slot else None
        result[f"feed_top{slot}"] = item["feedId"] if item else None
        for shock in ("+5", "-5", "+10", "-10"):
            if not item:
                result[f"delta_top{slot}_{shock}"] = None
            else:
                pct = int(shock) / 100
                result[f"delta_top{slot}_{shock}"] = (
                    item["line"]["unitCostPerKgAsFed"] * item["line"]["kgAsFed"] * pct
                )
    return result


def _add_sensibilita_sheet(workbook, rows):
    sheet = workbook.create_sheet("Sensibilità")
    headers = ["Scenario"]
    for slot in (1, 2, 3):
        headers.append(f"feed_top{slot}")
        headers += [
            f"delta_top{slot}_+5%", f"delta_top{slot}_-5%",
            f"delta_top{slot}_+10%", f"delta_top{slot}_-10%",
        ]
    for column, header in enumerate(headers, start=1):
        sheet.cell(row=1, column=column, value=header).font = Font(bold=True)
    sheet.column_dimensions["A"].width = 20
    for column in range(2, 17):
        sheet.column_dimensions[sheet.cell(1, column).column_letter].width = 14
    for row_index, row in enumerate(rows, start=2):
        sheet.cell(row=row_index, column=1, value=row["scenario"])
        for column, header in enumerate(headers[1:], start=2):
            key = header.replace("%", "")
            value = row.get(key)
            cell = sheet.cell(row=row_index, column=column, value="=NA()" if value is None else value)
            if header.startswith("delta_"):
                cell.number_format = '€ #,##0.000'


def _scenario_export_rows(db, farm_id, base, scenario_ids):
    from export_validation import validate_scenario_selection
    from scenario import apply_scenario

    docs = []
    for scenario_id in scenario_ids:
        entry = (
            db.collection("farms").document(farm_id)
            .collection("scenarios").document(scenario_id).get()
        )
        if not entry.exists:
            raise ValueError("scenario_deleted")
        data = entry.to_dict() or {}
        data["_id"] = entry.id
        docs.append(data)
    validate_scenario_selection(docs)
    base_snapshot = apply_scenario(base, {})
    rows = []
    for data in docs:
        snapshot = apply_scenario(base, data.get("changes") or {})
        row = {
            "scenario": data.get("name", data["_id"]),
            "base_cost": base_snapshot["totalCost"],
            "scenario_cost": snapshot["totalCost"],
            "delta_cost": snapshot["totalCost"] - base_snapshot["totalCost"],
            "status": snapshot["status"],
        }
        row.update(_sensitivity_columns(snapshot))
        rows.append(row)
    return rows


def _add_scenari_sheet(workbook, rows):
    sheet = workbook.create_sheet("Scenari")
    headers = [("scenario", "Scenario"), ("base_cost", "Costo base"),
               ("scenario_cost", "Costo scenario"), ("delta_cost", "Delta costo"),
               ("status", "Stato")]
    for column, (_, header) in enumerate(headers, start=1):
        sheet.cell(row=1, column=column, value=header).font = Font(bold=True)
    sheet.column_dimensions["A"].width = 24
    for column in range(2, 6):
        sheet.column_dimensions[sheet.cell(1, column).column_letter].width = 16
    for row_index, row in enumerate(rows, start=2):
        for column, (key, _) in enumerate(headers, start=1):
            value = row.get(key)
            if key in ("base_cost", "scenario_cost", "delta_cost"):
                cell = sheet.cell(row=row_index, column=column, value=value)
                cell.number_format = '€ #,##0.000'
            else:
                sheet.cell(row=row_index, column=column, value=value)


def _build_confronto_workbook(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Confronto"
    for column, (_, header) in enumerate(_COMPARISON_HEADERS, start=1):
        ws.cell(row=1, column=column, value=header).font = Font(bold=True)
    for row_index, row in enumerate(rows, start=2):
        for column, (key, _) in enumerate(_COMPARISON_HEADERS, start=1):
            value = row.get(key)
            if value is None and key in ("totalDM", "totalCost"):
                cell = ws.cell(row=row_index, column=column, value="=NA()")
                cell.number_format = '€ #,##0.000' if key == "totalCost" else "0.000"
                continue
            cell = ws.cell(row=row_index, column=column, value=value)
            if key == "totalCost" and isinstance(value, (int, float)):
                cell.number_format = '€ #,##0.000'
            elif key == "totalDM" and isinstance(value, (int, float)):
                cell.number_format = "0.000"
    for column_cells in ws.columns:
        width = max(
            (len(str(cell.value)) for cell in column_cells if cell.value is not None),
            default=10,
        )
        ws.column_dimensions[column_cells[0].column_letter].width = min(width + 2, 60)
        for cell in column_cells:
            if cell.column_letter == "E":
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def export_comparison(req: https_fn.CallableRequest):
    """A1: reference Confronto only; scenario sheets land in A2/B."""
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Sign in required.",
        )
    data = req.data or {}
    if data.get("baseSource") == "builder":
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="unsupported_base_for_confronto",
        )
    farm_id = _require_string(data, "farmId") if data.get("scenarioIds") else None
    db = _require_farm_role(farm_id, req.auth.uid, _SCENARIO_ROLES) if farm_id else None
    scenario_rows = []
    if data.get("scenarioIds"):
        base_id = _require_string(data, "baseRecipeId")
        base = _scenario_base(db, farm_id, base_id)
        rows = _saved_recipe_confronto_rows(db, farm_id, base_id)
        scenario_rows = _scenario_export_rows(db, farm_id, base, data["scenarioIds"])
    elif data.get("baseRecipeId"):
        farm_id = _require_string(data, "farmId")
        db = _require_farm_role(farm_id, req.auth.uid, _SCENARIO_ROLES)
        rows = _saved_recipe_confronto_rows(db, farm_id, data["baseRecipeId"])
    else:
        rows = _reference_confronto_rows()
    content = _build_confronto_workbook(rows)
    if scenario_rows:
        from io import BytesIO
        from openpyxl import load_workbook
        workbook = load_workbook(BytesIO(content))
        _add_scenari_sheet(workbook, scenario_rows)
        _add_sensibilita_sheet(workbook, scenario_rows)
        buffer = BytesIO()
        workbook.save(buffer)
        content = buffer.getvalue()
    bucket = storage.bucket()
    blob = bucket.blob(f"exports/confronto-{uuid.uuid4()}.xlsx")
    blob.upload_from_string(
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    credentials, _ = google.auth.default()
    credentials.refresh(google_requests.Request())
    service_account_email = getattr(credentials, "service_account_email", None)
    if not service_account_email or service_account_email == "default":
        request = google_requests.Request()
        response = request(
            url="http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
            headers={"Metadata-Flavor": "Google"},
        )
        service_account_email = response.text.strip()
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        service_account_email=service_account_email,
        access_token=credentials.token,
    )
    return {"url": url, "rows": len(rows)}
