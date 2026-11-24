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

import pytest

EMULATOR_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST")
if not EMULATOR_HOST:
    pytest.skip(
        "Set FIRESTORE_EMULATOR_HOST (use the Firestore emulator) to run these tests.",
        allow_module_level=True,
    )

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
