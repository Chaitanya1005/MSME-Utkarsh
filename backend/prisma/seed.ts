/* eslint-disable no-console */
// Unlike the `prisma` CLI commands, `ts-node prisma/seed.ts` does not read
// backend/.env on its own, so DATABASE_URL would be undefined here unless
// it happens to be exported in the shell. Load it explicitly.
import 'dotenv/config';
import { PrismaClient, SourceCategorization, SourceStageProgress } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Development/test credentials only. These are NOT production accounts,
// they are not embedded in application logic, and this file must never
// be treated as a source of real employee data (spec sections 12, 26, 59).
// Every seeded user shares this password for convenience in Phase 1
// manual/automated testing.
const DEV_PASSWORD = 'ChangeMe123!';

async function hash(password: string) {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('Seeding MSME Utkarsh Phase 1 development data...');

  // Wipe in FK-safe order for repeatable seeding in dev. Phase 2 tables
  // must be cleared before the org/user tables they reference.
  await prisma.followUpTarget.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.region.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.centralOffice.deleteMany();

  const centralOffice = await prisma.centralOffice.create({
    data: { name: 'Central Bank of India — Central Office' },
  });

  const zoneA = await prisma.zone.create({
    data: { name: 'Zone A', centralOfficeId: centralOffice.id },
  });
  const zoneB = await prisma.zone.create({
    data: { name: 'Zone B', centralOfficeId: centralOffice.id },
  });

  const regionA1 = await prisma.region.create({ data: { name: 'Region A1', zoneId: zoneA.id } });
  const regionA2 = await prisma.region.create({ data: { name: 'Region A2', zoneId: zoneA.id } });
  const regionB1 = await prisma.region.create({ data: { name: 'Region B1', zoneId: zoneB.id } });

  const branchA101 = await prisma.branch.create({ data: { name: 'Branch A101', regionId: regionA1.id } });
  const branchA102 = await prisma.branch.create({ data: { name: 'Branch A102', regionId: regionA1.id } });
  const branchA201 = await prisma.branch.create({ data: { name: 'Branch A201', regionId: regionA2.id } });
  const branchB101 = await prisma.branch.create({ data: { name: 'Branch B101', regionId: regionB1.id } });

  const passwordHash = await hash(DEV_PASSWORD);

  const rmA1 = await prisma.user.create({
    data: {
      username: 'rm.a1',
      passwordHash,
      name: 'Asha Verma',
      role: 'RM',
      regionId: regionA1.id,
    },
  });
  const rmA2 = await prisma.user.create({
    data: {
      username: 'rm.a2',
      passwordHash,
      name: 'Karan Mehta',
      role: 'RM',
      regionId: regionA2.id,
    },
  });
  const rmB1 = await prisma.user.create({
    data: {
      username: 'rm.b1',
      passwordHash,
      name: 'Rina Das',
      role: 'RM',
      regionId: regionB1.id,
    },
  });

  const bmA101 = await prisma.user.create({
    data: {
      username: 'bm.a101',
      passwordHash,
      name: 'Sanjay Rao',
      role: 'BM',
      branchId: branchA101.id,
      // Phase 2 follow-up contact info. Synthetic development values only
      // — never real customer/employee PII (spec section 51).
      phoneNumber: '+911234500101',
      email: 'sanjay.rao.bm101@example-dev.cbipes.local',
    },
  });
  const bmA102 = await prisma.user.create({
    data: {
      username: 'bm.a102',
      passwordHash,
      name: 'Priya Nair',
      role: 'BM',
      branchId: branchA102.id,
      phoneNumber: '+911234500102',
      email: 'priya.nair.bm102@example-dev.cbipes.local',
    },
  });
  const bmA201 = await prisma.user.create({
    data: {
      username: 'bm.a201',
      passwordHash,
      name: 'Vikram Shah',
      role: 'BM',
      branchId: branchA201.id,
      phoneNumber: '+911234500201',
      email: 'vikram.shah.bm201@example-dev.cbipes.local',
    },
  });
  // Deliberately left WITHOUT contact info, to exercise and demonstrate
  // the "branch head has no phone/email on file" failure path in the
  // Phase 2 follow-up flow rather than only ever exercising the happy path.
  const bmB101 = await prisma.user.create({
    data: {
      username: 'bm.b101',
      passwordHash,
      name: 'Neha Joshi',
      role: 'BM',
      branchId: branchB101.id,
    },
  });

  // --- Leads -----------------------------------------------------------
  //
  // IMPORTANT DOCUMENTED ASSUMPTION (spec section 18/53): there is no
  // provided business rule mapping source LMS status/categorization/
  // progress onto the MSME Utkarsh five-stage pipeline. For seed/demo purposes
  // only, this script assigns a plausible-looking but ARBITRARY
  // cbiPesStage to each seed lead so the pipeline field is exercised by
  // Phase 1's read APIs. This is not a real mapping and must not be
  // relied upon by later phases without an explicit business rule.

  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  const leadSeedRows: Array<{
    sourceSrNo: string;
    customerName: string;
    customerPrimaryPhone: string;
    subProductName: string;
    amount: number;
    sourceLeadStatus: string;
    sourceCategorization: SourceCategorization;
    sourceStageProgress: SourceStageProgress;
    cbiPesStage: 'INTERESTED' | 'CONTACTED' | 'APPLICATION' | 'APPROVAL' | 'CONVERSION';
    branchId?: string;
    regionId?: string;
    updatedAt?: Date;
  }> = [
    // --- Branch A101: deliberately RECENTLY_UPDATED (spec section 16) --
    // Customer names double as the Phase 4 AI voice-demo fixture — these
    // are the same names used in the spec's own example utterance, so a
    // demo can literally read that example transcript into the voice
    // update screen against real seeded leads.
    {
      sourceSrNo: '101',
      customerName: 'Anil Sharma',
      customerPrimaryPhone: '9800000001',
      subProductName: 'Personal Loan',
      amount: 250000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      branchId: branchA101.id,
      updatedAt: daysAgo(1),
    },
    {
      sourceSrNo: '102',
      customerName: 'Rakesh Verma',
      customerPrimaryPhone: '9800000002',
      subProductName: 'Home Loan',
      amount: 3200000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'A',
      sourceStageProgress: 'SANCTIONED',
      cbiPesStage: 'CONTACTED',
      branchId: branchA101.id,
      updatedAt: daysAgo(2),
    },
    {
      sourceSrNo: '103',
      customerName: 'Sunita Singh',
      customerPrimaryPhone: '9800000003',
      subProductName: 'Gold Loan',
      amount: 150000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'C',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'APPLICATION',
      branchId: branchA101.id,
      updatedAt: daysAgo(1),
    },
    {
      sourceSrNo: '104',
      customerName: 'Meena Kapoor',
      customerPrimaryPhone: '9800000004',
      subProductName: 'Vehicle Loan',
      amount: 900000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'DOC_NOT_EXECUTED',
      cbiPesStage: 'APPROVAL',
      branchId: branchA101.id,
      updatedAt: daysAgo(3),
    },
    // --- Branch A102: deliberately UPDATE_REQUIRED (spec section 16) ---
    // No recent lead activity and no follow-up ever sent to this branch.
    {
      sourceSrNo: '105',
      customerName: 'Deepak Joshi',
      customerPrimaryPhone: '9800000005',
      subProductName: 'Education Loan',
      amount: 500000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'PENDING_AT_RAC',
      cbiPesStage: 'CONTACTED',
      branchId: branchA102.id,
      updatedAt: daysAgo(21),
    },
    {
      sourceSrNo: '106',
      customerName: 'Kavita Reddy',
      customerPrimaryPhone: '9800000006',
      subProductName: 'Gold Loan',
      amount: 220000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'C',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      branchId: branchA102.id,
      updatedAt: daysAgo(30),
    },
    {
      sourceSrNo: '107',
      customerName: 'Ramesh Iyer',
      customerPrimaryPhone: '9800000007',
      subProductName: 'Vehicle Loan',
      amount: 700000,
      sourceLeadStatus: 'Closed',
      sourceCategorization: 'D',
      sourceStageProgress: 'DOC_NOT_EXECUTED',
      cbiPesStage: 'CONTACTED',
      branchId: branchA102.id,
      updatedAt: daysAgo(45),
    },
    // --- Branch A201 (Region A2) ---
    {
      sourceSrNo: '108',
      customerName: 'Pooja Malhotra',
      customerPrimaryPhone: '9800000008',
      subProductName: 'Education Loan',
      amount: 500000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'PENDING_AT_RAC',
      cbiPesStage: 'APPLICATION',
      branchId: branchA201.id,
      updatedAt: daysAgo(4),
    },
    {
      sourceSrNo: '109',
      customerName: 'Arjun Nair',
      customerPrimaryPhone: '9800000009',
      subProductName: 'Home Loan',
      amount: 4100000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'A',
      sourceStageProgress: 'DISBURSED',
      cbiPesStage: 'CONVERSION',
      branchId: branchA201.id,
      updatedAt: daysAgo(10),
    },
    // --- Branch B101 (Region B1) ---
    {
      sourceSrNo: '110',
      customerName: 'Neha Bhat',
      customerPrimaryPhone: '9800000010',
      subProductName: 'Personal Loan',
      amount: 180000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'C',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      branchId: branchB101.id,
      updatedAt: daysAgo(15),
    },
    {
      sourceSrNo: '111',
      customerName: 'Suresh Pillai',
      customerPrimaryPhone: '9800000011',
      subProductName: 'Mortgage Loan',
      amount: 2200000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'SANCTIONED',
      cbiPesStage: 'APPROVAL',
      branchId: branchB101.id,
      updatedAt: daysAgo(18),
    },
    // Region-level leads (spec section 8/21): not yet assigned to a
    // specific branch, only to the region. These exercise the model's
    // support for region-level ownership.
    {
      sourceSrNo: '112',
      customerName: 'Vinay Chawla',
      customerPrimaryPhone: '9800000012',
      subProductName: 'MSME Loan',
      amount: 1500000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'C',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      regionId: regionA1.id,
      updatedAt: daysAgo(6),
    },
    {
      sourceSrNo: '113',
      customerName: 'Farah Sheikh',
      customerPrimaryPhone: '9800000013',
      subProductName: 'MSME Loan',
      amount: 800000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'PENDING_AT_RAC',
      cbiPesStage: 'CONTACTED',
      regionId: regionB1.id,
      updatedAt: daysAgo(12),
    },
  ];

  for (const row of leadSeedRows) {
    await prisma.lead.create({ data: row });
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Development credentials (all share the same password):');
  console.log(`  Password: ${DEV_PASSWORD}`);
  console.table(
    [rmA1, rmA2, rmB1, bmA101, bmA102, bmA201, bmB101].map((u) => ({
      username: u.username,
      name: u.name,
      role: u.role,
    }))
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
