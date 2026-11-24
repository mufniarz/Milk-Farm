/**
 * Backfill `farmMembers` from the legacy `users.farmId` / `farms.ownerUid`
 * model.
 *
 * Run this BEFORE deploying the compatibility rules:
 *
 *   npx ts-node --transpile-only scripts/backfill-members.ts --dry-run
 *   npx ts-node --transpile-only scripts/backfill-members.ts
 *
 * The script is idempotent: existing member documents are merged, not
 * replaced, and `createdAt` is preserved. It exits non-zero if any farm is
 * left without an owner membership or any user with a farmId is left without
 * an active membership, so a failed run cannot be mistaken for a successful
 * one.
 *
 * Requires `firebase-service-account.json` in the repo root (gitignored).
 */
import { Firestore, Timestamp } from '@google-cloud/firestore';
import * as fs from 'fs';
import * as path from 'path';

const KEY_PATH = 'firebase-service-account.json';
const keyFile = path.resolve(KEY_PATH);

if (!fs.existsSync(keyFile)) {
  console.error(`\n❌ Service account key not found at ${KEY_PATH}`);
  console.error('Download it from Firebase Console → Project Settings → Service Accounts.\n');
  process.exit(1);
}

const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const db = new Firestore({
  projectId: key.project_id,
  credentials: key,
});

const dryRun = process.argv.includes('--dry-run');

interface FarmDoc {
  id: string;
  ownerUid?: string;
}

interface UserDoc {
  uid: string;
  farmId?: string;
}

interface MemberDoc {
  farmId: string;
  uid: string;
  role: 'owner' | 'farmAdmin';
  status: 'active';
  invitedBy: string | null;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

function memberId(farmId: string, uid: string): string {
  return `${farmId}_${uid}`;
}

async function mergeMember(
  farmId: string,
  uid: string,
  role: 'owner' | 'farmAdmin',
): Promise<'created' | 'updated' | 'unchanged'> {
  const ref = db.collection('farmMembers').doc(memberId(farmId, uid));
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() : null;
  if (
    existing &&
    existing['role'] === role &&
    existing['status'] === 'active'
  ) {
    return 'unchanged';
  }
  if (!dryRun) {
    await ref.set(
      {
        farmId,
        uid,
        role,
        status: 'active',
        invitedBy: existing?.['invitedBy'] ?? null,
        createdAt: existing?.['createdAt'] ?? new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }
  return existing ? 'updated' : 'created';
}

async function main(): Promise<void> {
  const [farmsSnapshot, usersSnapshot] = await Promise.all([
    db.collection('farms').get(),
    db.collection('users').get(),
  ]);

  const farms: FarmDoc[] = farmsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<FarmDoc, 'id'>),
  }));
  const users: UserDoc[] = usersSnapshot.docs.map((doc) => ({
    uid: doc.id,
    ...(doc.data() as Omit<UserDoc, 'uid'>),
  }));

  const farmById = new Map(farms.map((farm) => [farm.id, farm]));
  const counts = { created: 0, updated: 0, unchanged: 0 };

  for (const farm of farms) {
    if (!farm.ownerUid) {
      console.warn(`⚠️  Farm ${farm.id} has no ownerUid; skipping owner membership`);
      continue;
    }
    const result = await mergeMember(farm.id, farm.ownerUid, 'owner');
    counts[result]++;
  }

  for (const user of users) {
    if (!user.farmId) continue;
    const farm = farmById.get(user.farmId);
    const role = farm?.ownerUid === user.uid ? 'owner' : 'farmAdmin';
    const result = await mergeMember(user.farmId, user.uid, role);
    counts[result]++;
  }

  if (dryRun) {
    console.log(`\nDRY RUN — no writes`);
    console.log(
      `Memberships: ${counts.created} would be created, ${counts.updated} would be updated, ${counts.unchanged} unchanged`,
    );
    console.log(`Farms: ${farms.length}, Users: ${users.length}`);
    console.log('\nRun without --dry-run to write and verify.');
    return;
  }

  // Verification: this is the gate for deploying the compatibility rules.
  const farmsWithoutOwner: string[] = [];
  for (const farm of farms) {
    if (!farm.ownerUid) {
      farmsWithoutOwner.push(farm.id);
      continue;
    }
    const member = await db
      .collection('farmMembers')
      .doc(memberId(farm.id, farm.ownerUid))
      .get();
    if (!member.exists || member.data()?.['role'] !== 'owner') {
      farmsWithoutOwner.push(farm.id);
    }
  }

  const usersWithoutMembership: string[] = [];
  for (const user of users) {
    if (!user.farmId) continue;
    const member = await db
      .collection('farmMembers')
      .doc(memberId(user.farmId, user.uid))
      .get();
    if (!member.exists || member.data()?.['status'] !== 'active') {
      usersWithoutMembership.push(user.uid);
    }
  }

  console.log(`\n${dryRun ? 'DRY RUN — no writes' : 'Backfill complete'}`);
  console.log(
    `Memberships: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged`,
  );
  console.log(`Farms: ${farms.length}, Users: ${users.length}`);

  if (farmsWithoutOwner.length) {
    console.error(
      `\n❌ ${farmsWithoutOwner.length} farm(s) without an owner membership:`,
    );
    for (const id of farmsWithoutOwner) console.error(`   - ${id}`);
  }
  if (usersWithoutMembership.length) {
    console.error(
      `\n❌ ${usersWithoutMembership.length} user(s) with farmId but no active membership:`,
    );
    for (const uid of usersWithoutMembership) console.error(`   - ${uid}`);
  }
  if (farmsWithoutOwner.length || usersWithoutMembership.length) {
    process.exit(1);
  }

  console.log('\n✅ Every farm has an owner membership and every user has an active membership.');
  console.log('   Safe to deploy the compatibility rules.');
}

main().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
