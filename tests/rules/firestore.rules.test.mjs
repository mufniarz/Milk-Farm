/**
 * Firestore rules tests. Run against the emulator:
 *
 *   firebase emulators:exec --only firestore "npm run test:rules"
 *
 * The suite seeds one farm with an owner and a farm admin, then asserts the
 * tenant boundary, membership creation, and the write-denied collections.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-milk-farm';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'farms', 'f1'), {
      id: 'f1',
      name: 'Farm 1',
      ownerUid: 'owner',
    });
    await setDoc(doc(db, 'farms', 'f2'), {
      id: 'f2',
      name: 'Farm 2',
      ownerUid: 'owner',
    });
    await setDoc(doc(db, 'farmMembers', 'f1_owner'), {
      farmId: 'f1',
      uid: 'owner',
      role: 'owner',
      status: 'active',
      invitedBy: null,
    });
    await setDoc(doc(db, 'farmMembers', 'f1_member'), {
      farmId: 'f1',
      uid: 'member',
      role: 'farmAdmin',
      status: 'active',
      invitedBy: null,
    });
    await setDoc(doc(db, 'farmMembers', 'f1_feeder'), {
      farmId: 'f1',
      uid: 'feeder',
      role: 'feeder',
      status: 'active',
      invitedBy: null,
    });
    await setDoc(doc(db, 'feeds', 'feed1'), {
      name: 'Silage',
      farmId: 'f1',
      category: 'forage',
      pricePerKg: 0.1,
      moisturePct: 70,
      isAvailable: true,
      nutrients: {},
    });
    await setDoc(doc(db, 'recipes', 'r1'), {
      name: 'Reference ration',
      farmId: 'f1',
      animalGroupId: 'lactating',
      totalAsFed: 48.3,
      totalDM: 23.095,
      cost: 9.885,
      nutrientAnalysis: {},
    });
    await setDoc(doc(db, 'farms', 'f1', 'groups', 'g1'), {
      name: 'High',
      animalGroupId: 'lactating',
      headCount: 100,
      activeRecipeId: null,
      externalId: null,
    });
    await setDoc(doc(db, 'farms', 'f1', 'feeders', 'feeder1'), {
      farmId: 'f1',
      name: 'Mario',
      active: true,
    });
    await setDoc(doc(db, 'farms', 'f1', 'feedings', 'feeding1'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      status: 'draft',
      lines: [],
      idempotencyKey: 'feeding-key-1',
      createdBy: 'feeder',
    });
    await setDoc(doc(db, 'farms', 'f1', 'feedings', 'feeding-other'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      status: 'draft',
      lines: [],
      idempotencyKey: 'feeding-key-other',
      createdBy: 'member',
    });
    await setDoc(doc(db, 'farms', 'f1', 'milkRecords', 'g1_2026-11-20'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      date: '2026-11-20',
      milkKg: 3000,
      milkPricePerKg: 0.5,
      source: 'manual',
    });
    await setDoc(doc(db, 'farms', 'f1', 'inventoryItems', 'feed1'), {
      feedId: 'feed1',
      onHandKgAsFed: 1000,
      reorderPointDays: 7,
      location: '',
      unitCostPerKgAsFed: 0.1,
    });
    await setDoc(doc(db, 'farms', 'f1', 'targetOverrides', 'lactating'), {
      groupId: 'lactating',
      nutrients: {},
      version: 1,
    });
    // A user from before the farmMembers backfill: profile only.
    await setDoc(doc(db, 'users', 'legacy'), {
      uid: 'legacy',
      farmId: 'f1',
      displayName: 'Legacy User',
      email: 'legacy@example.com',
      language: 'it',
    });
  });
});

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

test('member can read the farm and its feed', async () => {
  const db = dbFor('member');
  await assertSucceeds(getDoc(doc(db, 'farms', 'f1')));
  await assertSucceeds(getDoc(doc(db, 'feeds', 'feed1')));
  await assertSucceeds(getDoc(doc(db, 'farms', 'f1', 'groups', 'g1')));
});

test('legacy user with only users.farmId can read during the window', async () => {
  const db = dbFor('legacy');
  await assertSucceeds(getDoc(doc(db, 'farms', 'f1')));
  await assertSucceeds(getDoc(doc(db, 'feeds', 'feed1')));
  await assertSucceeds(getDoc(doc(db, 'recipes', 'r1')));
});

test('outsider cannot read the farm or its feed', async () => {
  const db = dbFor('other');
  await assertFails(getDoc(doc(db, 'farms', 'f1')));
  await assertFails(getDoc(doc(db, 'feeds', 'feed1')));
  await assertFails(getDoc(doc(db, 'farms', 'f1', 'groups', 'g1')));
});

test('member can read target overrides but cannot write them', async () => {
  const db = dbFor('member');
  await assertSucceeds(
    getDoc(doc(db, 'farms', 'f1', 'targetOverrides', 'lactating')),
  );
  await assertFails(
    setDoc(doc(db, 'farms', 'f1', 'targetOverrides', 'dry'), {
      groupId: 'dry',
      nutrients: {},
    }),
  );
});

test('inventory ledger is read-only from the client', async () => {
  const db = dbFor('member');
  await assertSucceeds(
    getDoc(doc(db, 'farms', 'f1', 'inventoryItems', 'feed1')),
  );
  await assertFails(
    setDoc(doc(db, 'farms', 'f1', 'inventoryTransactions', 'tx1'), {
      itemId: 'feed1',
      type: 'delivery',
      deltaKgAsFed: 10,
    }),
  );
});

test('feed farmId is immutable on update', async () => {
  const db = dbFor('member');
  await assertFails(
    updateDoc(doc(db, 'feeds', 'feed1'), { farmId: 'f2' }),
  );
});

test('owner can create their own owner membership, but not for another farm', async () => {
  const owner = dbFor('owner');
  await assertSucceeds(
    setDoc(doc(owner, 'farmMembers', 'f2_owner'), {
      farmId: 'f2',
      uid: 'owner',
      role: 'owner',
      status: 'active',
      invitedBy: null,
    }),
  );

  const member = dbFor('member');
  await assertFails(
    setDoc(doc(member, 'farmMembers', 'f2_member'), {
      farmId: 'f2',
      uid: 'member',
      role: 'farmAdmin',
      status: 'active',
      invitedBy: null,
    }),
  );
});

test('audit log is admin-readable and client-write-denied', async () => {
  const member = dbFor('member');
  await assertFails(
    setDoc(doc(member, 'farms', 'f1', 'auditLog', 'entry1'), {
      action: 'test',
    }),
  );
});

test('inactive membership is denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'farmMembers', 'f1_member'), {
      farmId: 'f1',
      uid: 'member',
      role: 'farmAdmin',
      status: 'revoked',
      invitedBy: null,
    });
  });
  const db = dbFor('member');
  await assertFails(getDoc(doc(db, 'feeds', 'feed1')));
});


test('a feeder can create and confirm a draft feeding once', async () => {
  const feeder = dbFor('feeder');
  await assertSucceeds(
    getDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding1')),
  );
  await assertSucceeds(
    setDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding2'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      status: 'draft',
      lines: [],
      idempotencyKey: 'feeding-key-2',
    }),
  );
  await assertSucceeds(
    updateDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding1'), {
      status: 'confirmed',
    }),
  );
  // Once confirmed, the client can no longer edit the feeding.
  await assertFails(
    updateDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding1'), {
      status: 'draft',
    }),
  );
});

test('an outsider cannot create a feeding', async () => {
  const other = dbFor('other');
  await assertFails(
    setDoc(doc(other, 'farms', 'f1', 'feedings', 'feeding3'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      status: 'draft',
      lines: [],
      idempotencyKey: 'feeding-key-3',
    }),
  );
});


test('a member can read feeders; a feeder cannot create one', async () => {
  const member = dbFor('member');
  await assertSucceeds(
    getDoc(doc(member, 'farms', 'f1', 'feeders', 'feeder1')),
  );
  await assertSucceeds(
    setDoc(doc(member, 'farms', 'f1', 'feeders', 'feeder2'), {
      farmId: 'f1',
      name: 'Lucia',
      active: true,
    }),
  );

  const feeder = dbFor('feeder');
  await assertFails(
    setDoc(doc(feeder, 'farms', 'f1', 'feeders', 'feeder3'), {
      farmId: 'f1',
      name: 'Paolo',
      active: true,
    }),
  );
});

test('an outsider cannot read feeders', async () => {
  const other = dbFor('other');
  await assertFails(
    getDoc(doc(other, 'farms', 'f1', 'feeders', 'feeder1')),
  );
});


test('a feeder account reads only the feedings it entered', async () => {
  const feeder = dbFor('feeder');
  await assertSucceeds(
    getDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding1')),
  );
  await assertFails(
    getDoc(doc(feeder, 'farms', 'f1', 'feedings', 'feeding-other')),
  );

  const member = dbFor('member');
  await assertSucceeds(
    getDoc(doc(member, 'farms', 'f1', 'feedings', 'feeding-other')),
  );
});


test('milk records are owner/admin/consultant only', async () => {
  const member = dbFor('member');
  await assertSucceeds(
    getDoc(doc(member, 'farms', 'f1', 'milkRecords', 'g1_2026-11-20')),
  );
  await assertSucceeds(
    setDoc(doc(member, 'farms', 'f1', 'milkRecords', 'g1_2026-11-21'), {
      farmId: 'f1',
      herdGroupId: 'g1',
      date: '2026-11-21',
      milkKg: 3100,
      milkPricePerKg: 0.5,
      source: 'manual',
    }),
  );

  const feeder = dbFor('feeder');
  await assertFails(
    getDoc(doc(feeder, 'farms', 'f1', 'milkRecords', 'g1_2026-11-20')),
  );

  const other = dbFor('other');
  await assertFails(
    getDoc(doc(other, 'farms', 'f1', 'milkRecords', 'g1_2026-11-20')),
  );
});
