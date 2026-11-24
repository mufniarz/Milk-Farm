"""
Callable integration tests against the Firestore emulator.

These exercise the handler bodies (role check, validation, transaction,
audit shape, on-hand + ledger writes), not the Cloud Functions auth envelope.
Run with the emulator:

    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
      ./venv/bin/python -m pytest tests/test_callables.py -q

or through:

    firebase emulators:exec --only firestore \
      "cd functions && FIRESTORE_EMULATOR_HOST=$$FIRESTORE_EMULATOR_HOST pytest tests/test_callables.py -q"

The module skips itself when FIRESTORE_EMULATOR_HOST is not set.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest

EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST")
REQUIRE_EMULATOR = os.environ.get("REQUIRE_EMULATOR") == "1"
if not EMULATOR_HOST:
    message = (
        "SKIPPED: Firestore emulator not running — callable tests did not "
        "execute. Set FIRESTORE_EMULATOR_HOST or run `npm run test:functions`."
    )
    if REQUIRE_EMULATOR:
        raise RuntimeError(message)
    pytest.skip(message, allow_module_level=True)

import firebase_admin  # noqa: E402
from firebase_admin import firestore  # noqa: E402
from google.auth.credentials import AnonymousCredentials  # noqa: E402

# The module under test initialises the Admin SDK at import time. Initialise
# the default app against the emulator first, then neutralise main's call.
if not firebase_admin._apps:
    firebase_admin.initialize_app(
        AnonymousCredentials(), {"projectId": "demo-milk-farm"}
    )
firebase_admin.initialize_app = lambda *args, **kwargs: None

import main  # noqa: E402
from firebase_functions import https_fn  # noqa: E402

DB = firestore.client()


def _handler(decorated):
    """Unwrap the Flask/CORS/on_call layers to the original handler body."""
    fn = decorated
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


class _Auth:
    def __init__(self, uid, email="test@example.com"):
        self.uid = uid
        self.token = {"email": email}


class _Req:
    def __init__(self, uid, data):
        self.auth = _Auth(uid)
        self.data = data


def _delete_collection(collection_ref):
    for doc in collection_ref.stream():
        for subcollection in doc.reference.collections():
            _delete_collection(subcollection)
        doc.reference.delete()


@pytest.fixture(autouse=True)
def clean_emulator():
    for name in ("farms", "farmMembers", "feeds", "recipes"):
        _delete_collection(DB.collection(name))
    yield


def seed(member_uid="owner", member_role="owner"):
    DB.collection("farms").document("f1").set(
        {"id": "f1", "name": "Farm 1", "ownerUid": "owner"}
    )
    DB.collection("farmMembers").document(f"f1_{member_uid}").set(
        {
            "farmId": "f1",
            "uid": member_uid,
            "role": member_role,
            "status": "active",
            "invitedBy": None,
        }
    )
    DB.collection("feeds").document("feed1").set(
        {
            "name": "Silage",
            "farmId": "f1",
            "category": "forage",
            "pricePerKg": 0.1,
            "moisturePct": 70,
            "isAvailable": True,
            "nutrients": {},
        }
    )


def override_request(uid="owner", **overrides):
    data = {
        "farmId": "f1",
        "animalGroupId": "lactating",
        "nutrientCode": "proteina",
        "minValue": 15,
        "maxValue": 17,
        "reason": "farm standard",
    }
    data.update(overrides)
    return _Req(uid, data)


def test_set_target_override_writes_override_and_audit_in_one_call():
    seed()
    result = _handler(main.set_target_override)(override_request())
    assert result["ok"] is True

    override = (
        DB.collection("farms")
        .document("f1")
        .collection("targetOverrides")
        .document("lactating")
        .get()
        .to_dict()
    )
    assert override["version"] == 1
    assert override["nutrients"]["proteina"]["minValue"] == 15
    assert override["nutrients"]["proteina"]["maxValue"] == 17
    assert override["nutrients"]["proteina"]["reason"] == "farm standard"
    assert override["nutrients"]["proteina"]["updatedBy"] == "owner"

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert len(audits) == 1
    assert audits[0]["action"] == "target.override.set"
    assert audits[0]["actorUid"] == "owner"
    assert audits[0]["before"] is None
    assert audits[0]["after"]["minValue"] == 15
    assert audits[0]["reason"] == "farm standard"


def test_set_target_override_denies_a_feeder():
    seed(member_uid="feeder_user", member_role="feeder")
    with pytest.raises(https_fn.HttpsError):
        _handler(main.set_target_override)(override_request(uid="feeder_user"))


def test_clear_target_override_removes_the_nutrient_and_audits():
    seed()
    _handler(main.set_target_override)(override_request())
    result = _handler(main.clear_target_override)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "animalGroupId": "lactating",
                "nutrientCode": "proteina",
            },
        )
    )
    assert result["ok"] is True

    snapshot = (
        DB.collection("farms")
        .document("f1")
        .collection("targetOverrides")
        .document("lactating")
        .get()
    )
    assert snapshot.exists is False

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    actions = [entry["action"] for entry in audits]
    assert "target.override.set" in actions
    assert "target.override.clear" in actions


def test_upsert_inventory_item_transaction_and_audit():
    seed()
    result = _handler(main.upsert_inventory_item)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed1",
                "reorderPointDays": 7,
                "location": "Barn",
                "unitCostPerKgAsFed": 0.12,
            },
        )
    )
    assert result == {"ok": True, "itemId": "feed1"}

    item = (
        DB.collection("farms")
        .document("f1")
        .collection("inventoryItems")
        .document("feed1")
        .get()
        .to_dict()
    )
    assert item["onHandKgAsFed"] == 0
    assert item["feedName"] == "Silage"
    assert item["reorderPointDays"] == 7

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert len(audits) == 1
    assert audits[0]["action"] == "inventory.item.upsert"


def test_record_delivery_updates_on_hand_and_ledger_once():
    seed()
    _handler(main.upsert_inventory_item)(
        _Req("owner", {"farmId": "f1", "feedId": "feed1"})
    )

    delivery = _Req(
        "owner",
        {
            "farmId": "f1",
            "feedId": "feed1",
            "quantityKgAsFed": 100,
            "unitCostPerKgAsFed": 0.12,
            "idempotencyKey": "delivery-123456",
            "note": "first load",
        },
    )
    _handler(main.record_delivery)(delivery)

    item = (
        DB.collection("farms")
        .document("f1")
        .collection("inventoryItems")
        .document("feed1")
        .get()
        .to_dict()
    )
    assert item["onHandKgAsFed"] == 100

    ledger = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("inventoryTransactions")
        .stream()
    ]
    assert len(ledger) == 1
    assert ledger[0]["type"] == "delivery"
    assert ledger[0]["deltaKgAsFed"] == 100
    assert ledger[0]["idempotencyKey"] == "delivery-123456"

    # Replaying the same idempotency key must not double-count.
    _handler(main.record_delivery)(delivery)
    item = (
        DB.collection("farms")
        .document("f1")
        .collection("inventoryItems")
        .document("feed1")
        .get()
        .to_dict()
    )
    assert item["onHandKgAsFed"] == 100
    assert (
        len(
            list(
                DB.collection("farms")
                .document("f1")
                .collection("inventoryTransactions")
                .stream()
            )
        )
        == 1
    )


def test_adjust_inventory_rejects_negative_on_hand():
    seed()
    _handler(main.upsert_inventory_item)(
        _Req("owner", {"farmId": "f1", "feedId": "feed1"})
    )
    _handler(main.record_delivery)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed1",
                "quantityKgAsFed": 10,
                "unitCostPerKgAsFed": 0.12,
                "idempotencyKey": "delivery-abcdef",
            },
        )
    )

    with pytest.raises(https_fn.HttpsError):
        _handler(main.adjust_inventory)(
            _Req(
                "owner",
                {
                    "farmId": "f1",
                    "itemId": "feed1",
                    "deltaKgAsFed": -20,
                    "reason": "stock count error",
                    "idempotencyKey": "adjust-abcdef",
                },
            )
        )

    item = (
        DB.collection("farms")
        .document("f1")
        .collection("inventoryItems")
        .document("feed1")
        .get()
        .to_dict()
    )
    assert item["onHandKgAsFed"] == 10


def test_record_delivery_requires_an_inventory_item():
    seed()
    with pytest.raises(https_fn.HttpsError):
        _handler(main.record_delivery)(
            _Req(
                "owner",
                {
                    "farmId": "f1",
                    "feedId": "feed1",
                    "quantityKgAsFed": 10,
                    "unitCostPerKgAsFed": 0.12,
                    "idempotencyKey": "delivery-ghijkl",
                },
            )
        )


# ── Feeding confirmation trigger ─────────────────────────────────────────────

from firebase_functions.core import Change  # noqa: E402


class _TriggerEvent:
    def __init__(self, after, params):
        self.data = Change(before=None, after=after)
        self.params = params


def _feeding_lines(feed_id="feed1", line_ids=("line-1",), loaded=(100,)):
    return [
        {
            "lineId": line_id,
            "feedId": feed_id,
            "feedName": "Silage",
            "calledKgAsFed": kg,
            "loadedKgAsFed": kg,
            "costPerKgAsFed": 0.12,
        }
        for line_id, kg in zip(line_ids, loaded)
    ]


def _create_feeding(feeding_id="feeding1", status="confirmed", lines=None):
    ref = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document(feeding_id)
    )
    ref.set(
        {
            "farmId": "f1",
            "date": "2026-11-24",
            "herdGroupId": "group-1",
            "recipeId": "recipe-1",
            "animalCount": 100,
            "feederId": "feeder-1",
            "status": status,
            "lines": lines or _feeding_lines(),
            "refusedKgAsFed": 0,
            "idempotencyKey": f"feeding-{feeding_id}",
            "createdBy": "owner",
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return ref.get()


def _trigger(event):
    return _handler(main.on_feeding_confirmed)(event)


def _on_hand(feed_id="feed1"):
    return (
        DB.collection("farms")
        .document("f1")
        .collection("inventoryItems")
        .document(feed_id)
        .get()
        .to_dict()
    )


def _ledger():
    return [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("inventoryTransactions")
        .stream()
    ]


def _consumption_ledger():
    return [entry for entry in _ledger() if entry["type"] == "consumption"]


def _prepare_inventory(quantity=1000):
    seed()
    _handler(main.upsert_inventory_item)(
        _Req("owner", {"farmId": "f1", "feedId": "feed1", "unitCostPerKgAsFed": 0.12})
    )
    _handler(main.record_delivery)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed1",
                "quantityKgAsFed": quantity,
                "unitCostPerKgAsFed": 0.12,
                "idempotencyKey": "delivery-seed",
            },
        )
    )


def test_feeding_trigger_posts_each_line_once():
    _prepare_inventory(1000)
    after = _create_feeding(
        lines=_feeding_lines(
            line_ids=("line-1", "line-2"), loaded=(100, 50)
        )
    )

    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))

    assert _on_hand()["onHandKgAsFed"] == 850
    ledger = _consumption_ledger()
    assert len(ledger) == 2
    assert sorted(entry["deltaKgAsFed"] for entry in ledger) == [-100.0, -50.0]
    assert all(entry["type"] == "consumption" for entry in ledger)
    assert all(entry["sourceType"] == "feeding" for entry in ledger)
    assert all(entry["date"] == "2026-11-24" for entry in ledger)

    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding1")
        .get()
        .to_dict()
    )
    assert feeding["inventoryPostedAt"] is not None
    assert feeding["inventoryPostedLines"] == 2
    assert feeding["inventorySkippedLines"] == []
    assert feeding["inventorySkippedFeedIds"] == []
    assert feeding["inventoryOverdrawn"] == []

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    confirm_audit = next(
        entry for entry in audits if entry["action"] == "feeding.confirm"
    )
    assert confirm_audit["inventoryPosted"] == [
        {
            "feedId": "feed1",
            "lineIds": ["line-1", "line-2"],
            "deltaKgAsFed": -150.0,
            "onHandBeforeKgAsFed": 1000.0,
            "onHandAfterKgAsFed": 850.0,
        }
    ]
    assert confirm_audit["skipped"] == []
    assert confirm_audit["skippedFeedIds"] == []
    assert confirm_audit["overdrawn"] == []

    # A retry (the trigger fires again after its own update) must not
    # double-deplete.
    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))
    assert _on_hand()["onHandKgAsFed"] == 850
    assert len(_consumption_ledger()) == 2


def test_feeding_trigger_ignores_drafts():
    _prepare_inventory(1000)
    after = _create_feeding(status="draft")

    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))

    assert _on_hand()["onHandKgAsFed"] == 1000
    assert _consumption_ledger() == []


def test_feeding_trigger_skips_an_untracked_feed():
    _prepare_inventory(1000)
    after = _create_feeding(
        lines=_feeding_lines(
            feed_id="missing-feed",
            line_ids=("line-x", "line-y"),
            loaded=(40, 10),
        )
    )

    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))

    assert _on_hand()["onHandKgAsFed"] == 1000
    assert _consumption_ledger() == []
    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding1")
        .get()
        .to_dict()
    )
    assert feeding["inventorySkippedLines"] == [
        {"lineId": "line-x", "feedId": "missing-feed", "feedName": "Silage"},
        {"lineId": "line-y", "feedId": "missing-feed", "feedName": "Silage"},
    ]
    assert feeding["inventorySkippedFeedIds"] == ["missing-feed"]
    assert feeding["inventoryOverdrawn"] == []
    assert feeding["inventoryPostedAt"] is not None
    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    confirm_audit = next(
        entry for entry in audits if entry["action"] == "feeding.confirm"
    )
    assert confirm_audit["inventoryPosted"] == []
    assert confirm_audit["skipped"] == [
        {"lineId": "line-x", "feedId": "missing-feed", "feedName": "Silage"},
        {"lineId": "line-y", "feedId": "missing-feed", "feedName": "Silage"},
    ]
    assert confirm_audit["skippedFeedIds"] == ["missing-feed"]


def test_feeding_trigger_flags_overdrawn_on_hand():
    _prepare_inventory(50)
    after = _create_feeding(
        lines=_feeding_lines(line_ids=("line-1",), loaded=(80,))
    )

    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))

    # The feed left the mixer, so the ledger keeps the true negative value.
    assert _on_hand()["onHandKgAsFed"] == -30
    ledger = _consumption_ledger()
    assert len(ledger) == 1
    assert ledger[0]["deltaKgAsFed"] == -80

    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding1")
        .get()
        .to_dict()
    )
    assert feeding["inventoryOverdrawn"] == [
        {
            "feedId": "feed1",
            "feedName": "Silage",
            "onHandKgAsFed": 50.0,
            "consumptionKgAsFed": 80.0,
            "resultingKgAsFed": -30.0,
        }
    ]

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    confirm_audit = next(
        entry for entry in audits if entry["action"] == "feeding.confirm"
    )
    assert confirm_audit["overdrawn"] == feeding["inventoryOverdrawn"]

    # A retry must recompute/retain the same overdraft record, not append a
    # second one or double the ledger.
    _trigger(_TriggerEvent(after, {"farmId": "f1", "feedingId": "feeding1"}))
    assert _on_hand()["onHandKgAsFed"] == -30
    assert len(_consumption_ledger()) == 1
    retried = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding1")
        .get()
        .to_dict()
    )
    assert retried["inventoryOverdrawn"] == feeding["inventoryOverdrawn"]
    audits_after = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert (
        len(
            [
                entry
                for entry in audits_after
                if entry["action"] == "feeding.confirm"
            ]
        )
        == 1
    )


def test_retroactive_posting_posts_skipped_lines_once():
    _prepare_inventory(1000)  # seed farm, feed1 and its item

    DB.collection("feeds").document("feed2").set(
        {
            "name": "Hay",
            "farmId": "f1",
            "category": "forage",
            "pricePerKg": 0.1,
            "moisturePct": 10,
            "isAvailable": True,
            "nutrients": {},
        }
    )
    _handler(main.upsert_inventory_item)(
        _Req(
            "owner",
            {"farmId": "f1", "feedId": "feed2", "unitCostPerKgAsFed": 0.12},
        )
    )
    _handler(main.record_delivery)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed2",
                "quantityKgAsFed": 100,
                "unitCostPerKgAsFed": 0.12,
                "idempotencyKey": "delivery-feed2",
            },
        )
    )

    # A confirmed feeding that skipped feed2 before it had an item.
    DB.collection("farms").document("f1").collection("feedings").document(
        "feeding-skip"
    ).set(
        {
            "farmId": "f1",
            "date": "2026-11-20",
            "herdGroupId": "g1",
            "recipeId": "r1",
            "animalCount": 100,
            "feederId": "feeder-1",
            "status": "confirmed",
            "lines": [
                {
                    "lineId": "sl1",
                    "feedId": "feed2",
                    "feedName": "Hay",
                    "calledKgAsFed": 40,
                    "loadedKgAsFed": 40,
                    "costPerKgAsFed": 0.1,
                }
            ],
            "refusedKgAsFed": 0,
            "idempotencyKey": "skip-1",
            "createdBy": "owner",
            "inventoryPostedAt": firestore.SERVER_TIMESTAMP,
            "inventorySkippedLines": [
                {"lineId": "sl1", "feedId": "feed2", "feedName": "Hay"}
            ],
            "inventorySkippedFeedIds": ["feed2"],
        }
    )

    result = _handler(main.post_skipped_consumption)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    assert result["postedLines"] == 1
    assert result["feedings"] == 1
    assert result["onHandKgAsFed"] == 60
    assert _on_hand("feed2")["onHandKgAsFed"] == 60

    adjustments = [
        entry
        for entry in _ledger()
        if entry["itemId"] == "feed2" and entry["type"] == "adjustment"
    ]
    assert len(adjustments) == 1
    assert adjustments[0]["deltaKgAsFed"] == -40
    assert adjustments[0]["sourceType"] == "retroactive"
    assert adjustments[0]["date"] == "2026-11-20"
    # Historical load cost (0.10), not the item's current 0.12.
    assert adjustments[0]["unitCostPerKgAsFed"] == 0.1

    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding-skip")
        .get()
        .to_dict()
    )
    assert feeding["inventorySkippedLines"] == []
    assert feeding["inventorySkippedFeedIds"] == []

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    retro = [entry for entry in audits if entry["action"] == "inventory.retroactive"]
    assert len(retro) == 1
    assert retro[0]["sourceFeedingId"] == "feeding-skip"
    assert retro[0]["sourceLineId"] == "sl1"
    assert retro[0]["deltaKgAsFed"] == -40
    assert retro[0]["unitCostPerKgAsFed"] == 0.1
    cleared = [
        entry for entry in audits if entry["action"] == "feeding.skipped_cleared"
    ]
    assert len(cleared) == 1
    assert cleared[0]["clearedSkippedLineIds"] == ["sl1"]

    # Replaying the callable must not double-post.
    again = _handler(main.post_skipped_consumption)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    assert again["postedLines"] == 0
    assert again["alreadyPosted"] == 1
    assert _on_hand("feed2")["onHandKgAsFed"] == 60
    assert (
        len(
            [
                entry
                for entry in _ledger()
                if entry["itemId"] == "feed2"
                and entry["type"] == "adjustment"
            ]
        )
        == 1
    )
    audits_after = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert len(audits_after) == len(audits)


def test_retroactive_posting_flags_an_overdraft():
    _prepare_inventory(1000)
    DB.collection("feeds").document("feed2").set(
        {
            "name": "Hay",
            "farmId": "f1",
            "category": "forage",
            "pricePerKg": 0.1,
            "moisturePct": 10,
            "isAvailable": True,
            "nutrients": {},
        }
    )
    _handler(main.upsert_inventory_item)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    _handler(main.record_delivery)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed2",
                "quantityKgAsFed": 20,
                "unitCostPerKgAsFed": 0.1,
                "idempotencyKey": "delivery-feed2-small",
            },
        )
    )
    DB.collection("farms").document("f1").collection("feedings").document(
        "feeding-od"
    ).set(
        {
            "farmId": "f1",
            "date": "2026-11-20",
            "herdGroupId": "g1",
            "recipeId": "r1",
            "animalCount": 100,
            "feederId": "feeder-1",
            "status": "confirmed",
            "lines": [
                {
                    "lineId": "od1",
                    "feedId": "feed2",
                    "feedName": "Hay",
                    "calledKgAsFed": 40,
                    "loadedKgAsFed": 40,
                    "costPerKgAsFed": 0.1,
                }
            ],
            "refusedKgAsFed": 0,
            "idempotencyKey": "od-1",
            "createdBy": "owner",
            "inventoryPostedAt": firestore.SERVER_TIMESTAMP,
            "inventorySkippedLines": [
                {"lineId": "od1", "feedId": "feed2", "feedName": "Hay"}
            ],
            "inventorySkippedFeedIds": ["feed2"],
        }
    )

    result = _handler(main.post_skipped_consumption)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    assert result["onHandKgAsFed"] == -20
    assert _on_hand("feed2")["onHandKgAsFed"] == -20

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    retro = [entry for entry in audits if entry["action"] == "inventory.retroactive"]
    assert len(retro) == 1
    assert retro[0]["onHandBeforeKgAsFed"] == 20
    assert retro[0]["onHandAfterKgAsFed"] == -20
    assert retro[0]["overdrawn"] is True


def test_retroactive_posting_handles_two_skipped_lines_for_one_feed():
    _prepare_inventory(1000)
    DB.collection("feeds").document("feed2").set(
        {
            "name": "Hay",
            "farmId": "f1",
            "category": "forage",
            "pricePerKg": 0.1,
            "moisturePct": 10,
            "isAvailable": True,
            "nutrients": {},
        }
    )
    _handler(main.upsert_inventory_item)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    _handler(main.record_delivery)(
        _Req(
            "owner",
            {
                "farmId": "f1",
                "feedId": "feed2",
                "quantityKgAsFed": 100,
                "unitCostPerKgAsFed": 0.1,
                "idempotencyKey": "delivery-feed2-multi",
            },
        )
    )
    DB.collection("farms").document("f1").collection("feedings").document(
        "feeding-multi"
    ).set(
        {
            "farmId": "f1",
            "date": "2026-11-20",
            "herdGroupId": "g1",
            "recipeId": "r1",
            "animalCount": 100,
            "feederId": "feeder-1",
            "status": "confirmed",
            "lines": [
                {
                    "lineId": "m1",
                    "feedId": "feed2",
                    "feedName": "Hay",
                    "calledKgAsFed": 20,
                    "loadedKgAsFed": 20,
                    "costPerKgAsFed": 0.1,
                },
                {
                    "lineId": "m2",
                    "feedId": "feed2",
                    "feedName": "Hay",
                    "calledKgAsFed": 30,
                    "loadedKgAsFed": 30,
                    "costPerKgAsFed": 0.1,
                },
            ],
            "refusedKgAsFed": 0,
            "idempotencyKey": "multi-1",
            "createdBy": "owner",
            "inventoryPostedAt": firestore.SERVER_TIMESTAMP,
            "inventorySkippedLines": [
                {"lineId": "m1", "feedId": "feed2", "feedName": "Hay"},
                {"lineId": "m2", "feedId": "feed2", "feedName": "Hay"},
            ],
            "inventorySkippedFeedIds": ["feed2"],
        }
    )

    result = _handler(main.post_skipped_consumption)(
        _Req("owner", {"farmId": "f1", "feedId": "feed2"})
    )
    assert result["postedLines"] == 2
    assert result["onHandKgAsFed"] == 50
    assert _on_hand("feed2")["onHandKgAsFed"] == 50
    adjustments = [
        entry
        for entry in _ledger()
        if entry["itemId"] == "feed2" and entry["type"] == "adjustment"
    ]
    assert len(adjustments) == 2
    assert sorted(entry["deltaKgAsFed"] for entry in adjustments) == [-30.0, -20.0]
    assert all(entry["date"] == "2026-11-20" for entry in adjustments)
    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding-multi")
        .get()
        .to_dict()
    )
    assert feeding["inventorySkippedLines"] == []
    assert feeding["inventorySkippedFeedIds"] == []


def _failure_doc(feeding_id, status="pending", retry_count=1):
    ref = (
        DB.collection("farms")
        .document("f1")
        .collection("feedingTriggerFailures")
        .document(feeding_id)
    )
    ref.set(
        {
            "farmId": "f1",
            "feedingId": feeding_id,
            "error": "boom",
            "status": status,
            "retryCount": retry_count,
        }
    )
    return ref


def test_failure_claim_lock_resolve_and_record():
    _prepare_inventory(1000)
    ref = _failure_doc("feeding-claim")

    claimed = main._claim_failure(DB, "f1", "feeding-claim", "instance-1")
    assert claimed is not None
    assert ref.get().to_dict()["status"] == "retrying"
    # A second scanner cannot claim the same document.
    assert (
        main._claim_failure(DB, "f1", "feeding-claim", "instance-2") is None
    )

    main._resolve_trigger_failure(DB, "f1", "feeding-claim", "test")
    data = ref.get().to_dict()
    assert data["status"] == "resolved"
    assert data["resolvedBy"] == "test"

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert any(
        entry["action"] == "feeding.trigger_resolved"
        and entry["feedingId"] == "feeding-claim"
        for entry in audits
    )

    # A fresh failure records pending with an incremented retry count.
    main._record_trigger_failure(
        DB, "f1", "feeding-record", RuntimeError("cold start")
    )
    recorded = (
        DB.collection("farms")
        .document("f1")
        .collection("feedingTriggerFailures")
        .document("feeding-record")
        .get()
        .to_dict()
    )
    assert recorded["status"] == "pending"
    assert recorded["retryCount"] == 1
    assert "cold start" in recorded["error"]


def test_bulk_retry_posts_and_resolves_a_dead_failure():
    _prepare_inventory(1000)
    _create_feeding(
        feeding_id="feeding-retry",
        lines=_feeding_lines(loaded=(50,)),
    )
    ref = _failure_doc("feeding-retry", status="dead", retry_count=5)

    result = _handler(main.retry_feeding_failures)(
        _Req("owner", {"farmId": "f1"})
    )
    assert result["resolved"] == 1
    assert result["failed"] == 0
    assert _on_hand("feed1")["onHandKgAsFed"] == 950

    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding-retry")
        .get()
        .to_dict()
    )
    assert feeding["inventoryPostedAt"] is not None
    assert ref.get().to_dict()["status"] == "resolved"
    assert ref.get().to_dict()["resolvedBy"].startswith("manual-")

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert any(
        entry["action"] == "feeding.trigger_resolved"
        and entry["feedingId"] == "feeding-retry"
        for entry in audits
    )


def test_failure_exhaustion_marks_dead_and_audits():
    ref = _failure_doc("feeding-dead", status="retrying", retry_count=4)
    main._fail_retry(
        DB, "f1", "feeding-dead", RuntimeError("still down")
    )
    data = ref.get().to_dict()
    assert data["status"] == "dead"
    assert data["retryCount"] == 5

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    dead = [
        entry for entry in audits if entry["action"] == "feeding.trigger_dead"
    ]
    assert len(dead) == 1
    assert dead[0]["feedingId"] == "feeding-dead"
    assert dead[0]["retryCount"] == 5

    # Dead is terminal for the scan; only a manual retry may claim it.
    assert main._claim_failure(DB, "f1", "feeding-dead", "scan") is None
    assert main._retry_one_failure(DB, "f1", "feeding-dead", "scan") is False
    assert ref.get().to_dict()["status"] == "dead"


def test_retry_resolves_an_already_posted_feeding():
    _prepare_inventory(1000)
    _create_feeding(
        feeding_id="feeding-posted",
        lines=_feeding_lines(loaded=(50,)),
    )
    # Simulate a committed trigger whose post-commit step failed: the ledger
    # and inventoryPostedAt exist, and a pending failure doc is left behind.
    main._post_feeding_inventory(DB, "f1", "feeding-posted")
    for stale in (
        DB.collection("farms")
        .document("f1")
        .collection("feedingTriggerFailures")
        .stream()
    ):
        stale.reference.delete()
    _failure_doc("feeding-posted", status="pending", retry_count=1)
    ledger_before = len(_ledger())

    result = _handler(main.retry_feeding_failures)(
        _Req("owner", {"farmId": "f1"})
    )
    assert result["resolved"] == 1
    assert result["failed"] == 0
    assert len(_ledger()) == ledger_before

    failure = (
        DB.collection("farms")
        .document("f1")
        .collection("feedingTriggerFailures")
        .document("feeding-posted")
        .get()
        .to_dict()
    )
    assert failure["status"] == "resolved"
    assert failure["retryCount"] == 1

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    assert (
        len(
            [
                entry
                for entry in audits
                if entry["action"] == "feeding.confirm"
                and entry["feedingId"] == "feeding-posted"
            ]
        )
        == 1
    )


def test_dead_failure_is_abandoned_after_90_days():
    _prepare_inventory(1000)
    ref = _failure_doc("feeding-old", status="dead", retry_count=5)
    ref.update(
        {"deadAt": datetime.now(timezone.utc) - timedelta(days=91)}
    )

    assert main._abandon_dead_failure(DB, "f1", "feeding-old") is True
    assert not ref.get().exists

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    abandoned = [
        entry
        for entry in audits
        if entry["action"] == "feeding.trigger_abandoned"
    ]
    assert len(abandoned) == 1
    assert abandoned[0]["feedingId"] == "feeding-old"
    assert abandoned[0]["retryCount"] == 5


def test_set_farm_milk_price_audits_and_denies_a_feeder():
    seed()
    result = _handler(main.set_farm_milk_price)(
        _Req("owner", {"farmId": "f1", "milkPricePerKg": 0.55})
    )
    assert result["milkPricePerKg"] == 0.55
    farm = DB.collection("farms").document("f1").get().to_dict()
    assert farm["milkPricePerKg"] == 0.55

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    changed = [
        entry
        for entry in audits
        if entry["action"] == "farm.milk_price_changed"
    ]
    assert len(changed) == 1
    assert changed[0]["before"] is None
    assert changed[0]["after"] == 0.55
    assert changed[0]["actorUid"] == "owner"

    seed(member_uid="feeder_user", member_role="feeder")
    with pytest.raises(https_fn.HttpsError):
        _handler(main.set_farm_milk_price)(
            _Req("feeder_user", {"farmId": "f1", "milkPricePerKg": 0.6})
        )


def test_bulk_retry_resolves_three_dead_failures():
    _prepare_inventory(1000)
    for index, loaded in enumerate((10, 20, 30), start=1):
        feeding_id = f"feeding-bulk-{index}"
        _create_feeding(
            feeding_id=feeding_id,
            lines=_feeding_lines(
                line_ids=(f"bulk-line-{index}",), loaded=(loaded,)
            ),
        )
        _failure_doc(feeding_id, status="dead", retry_count=5)

    result = _handler(main.retry_feeding_failures)(
        _Req("owner", {"farmId": "f1"})
    )
    assert result["resolved"] == 3
    assert result["failed"] == 0
    assert _on_hand("feed1")["onHandKgAsFed"] == 940

    for index in (1, 2, 3):
        failure = (
            DB.collection("farms")
            .document("f1")
            .collection("feedingTriggerFailures")
            .document(f"feeding-bulk-{index}")
            .get()
            .to_dict()
        )
        assert failure["status"] == "resolved"


def test_abandonment_books_write_off_and_blocks_retry():
    _prepare_inventory(1000)
    _create_feeding(
        feeding_id="feeding-writeoff",
        lines=_feeding_lines(
            line_ids=("w1", "w2"), loaded=(30, 20)
        ),
    )
    ref = _failure_doc(
        "feeding-writeoff", status="dead", retry_count=5
    )
    ref.update(
        {"deadAt": datetime.now(timezone.utc) - timedelta(days=91)}
    )

    assert main._abandon_dead_failure(DB, "f1", "feeding-writeoff") is True
    assert _on_hand("feed1")["onHandKgAsFed"] == 950

    write_offs = [entry for entry in _ledger() if entry["type"] == "write_off"]
    assert len(write_offs) == 2
    assert sorted(entry["deltaKgAsFed"] for entry in write_offs) == [-30.0, -20.0]
    assert all(entry["sourceType"] == "abandoned" for entry in write_offs)

    feeding = (
        DB.collection("farms")
        .document("f1")
        .collection("feedings")
        .document("feeding-writeoff")
        .get()
        .to_dict()
    )
    assert feeding["writeOffAt"] is not None
    assert not ref.get().exists

    ledger_before = len(_ledger())
    assert (
        main._post_feeding_inventory(DB, "f1", "feeding-writeoff")
        == "already-posted"
    )
    assert len(_ledger()) == ledger_before
    assert _on_hand("feed1")["onHandKgAsFed"] == 950

    audits = [
        entry.to_dict()
        for entry in DB.collection("farms")
        .document("f1")
        .collection("auditLog")
        .stream()
    ]
    abandoned = [
        entry
        for entry in audits
        if entry["action"] == "feeding.trigger_abandoned"
    ]
    assert len(abandoned) == 1
    assert abandoned[0]["writeOffKgAsFed"] == 50
    assert sorted(abandoned[0]["writeOffLines"]) == ["w1", "w2"]
