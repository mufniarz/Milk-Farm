/**
 * Seed the Firestore emulator with the mixed identity state the backfill
 * has to handle:
 *
 *   - farm-a / owner-a      owner in users.farmId, no membership yet
 *   - farm-b / owner-b      owner in users.farmId, no membership yet
 *   - consultant-c          already-membered consultant on farm-b
 *   - legacy-l              users.farmId only, no membership
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-backfill.cjs
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-backfill.cjs --negative
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-backfill.cjs --inspect
 *
 * `--negative` adds farm-c without an ownerUid and a user whose farmId points
 * at it, so the backfill's verification exits non-zero.
 */
const { Firestore } = require("@google-cloud/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Set FIRESTORE_EMULATOR_HOST (for example 127.0.0.1:8080).");
  process.exit(1);
}

// Must match the backfill script's projectId (the service account project),
// because the Firestore emulator isolates data by project id.
const projectId = process.env.SEED_PROJECT_ID || "nicola-milk-farm";
const db = new Firestore({ projectId });
const negative = process.argv.includes("--negative");
const inspect = process.argv.includes("--inspect");

async function deleteCollection(collectionRef) {
  for (const doc of await collectionRef.listDocuments()) {
    for (const sub of await doc.listCollections()) {
      await deleteCollection(sub);
    }
    await doc.delete();
  }
}

async function seed() {
  for (const name of ["farms", "users", "farmMembers"]) {
    await deleteCollection(db.collection(name));
  }

  const now = new Date();
  await db.collection("farms").doc("farm-a").set({
    id: "farm-a",
    name: "Farm A",
    ownerUid: "owner-a",
    createdAt: now,
  });
  await db.collection("farms").doc("farm-b").set({
    id: "farm-b",
    name: "Farm B",
    ownerUid: "owner-b",
    createdAt: now,
  });

  const users = {
    "owner-a": "farm-a",
    "owner-b": "farm-b",
    "consultant-c": "farm-b",
    "legacy-l": "farm-a",
  };
  for (const [uid, farmId] of Object.entries(users)) {
    await db.collection("users").doc(uid).set({
      uid,
      farmId,
      displayName: uid,
      email: `${uid}@example.com`,
      language: "it",
      createdAt: now,
    });
  }

  // An already-granted consultant. The backfill must not overwrite this role.
  await db.collection("farmMembers").doc("farm-b_consultant-c").set({
    farmId: "farm-b",
    uid: "consultant-c",
    role: "consultant",
    status: "active",
    invitedBy: "owner-b",
    createdAt: now,
    updatedAt: now,
  });

  if (negative) {
    await db.collection("farms").doc("farm-c").set({
      id: "farm-c",
      name: "Farm C (no owner)",
      createdAt: now,
    });
    await db.collection("users").doc("orphan-u").set({
      uid: "orphan-u",
      farmId: "farm-c",
      displayName: "Orphan",
      email: "orphan@example.com",
      language: "it",
      createdAt: now,
    });
  }

  console.log(
    `Seeded emulator (project ${projectId}): 2${negative ? "+1" : ""} farms, ${Object.keys(users).length + (negative ? 1 : 0)} users, 1 consultant membership.`,
  );
}

async function dump() {
  const memberships = await db.collection("farmMembers").get();
  console.log("farmMembers:");
  for (const doc of memberships.docs) {
    const data = doc.data();
    console.log(
      `  ${doc.id}: role=${data.role} status=${data.status} uid=${data.uid}`,
    );
  }
}

(async () => {
  if (inspect) {
    await dump();
    return;
  }
  await seed();
  await dump();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
