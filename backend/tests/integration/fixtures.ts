import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

export const TEST_PASSWORD = 'TestPass123!';

// Builds the exact organizational structure the spec's authorization test
// matrix (section 49) requires: two regions in one zone (A1, A2) plus a
// third region in a second zone (B1), each with the branches/users named
// in the spec, so cross-region and cross-branch denial can be asserted
// precisely against IDs the tests know about.
export async function seedTestFixtures(prisma: PrismaClient) {
await prisma.followUpTarget.deleteMany();
await prisma.followUp.deleteMany();
await prisma.lead.deleteMany();
await prisma.user.deleteMany();
await prisma.branch.deleteMany();
await prisma.region.deleteMany();
await prisma.zone.deleteMany();
await prisma.centralOffice.deleteMany();

  const centralOffice = await prisma.centralOffice.create({ data: { name: 'Test Central Office' } });
  const zoneA = await prisma.zone.create({ data: { name: 'Zone A', centralOfficeId: centralOffice.id } });
  const zoneB = await prisma.zone.create({ data: { name: 'Zone B', centralOfficeId: centralOffice.id } });

  const regionA1 = await prisma.region.create({ data: { name: 'Region A1', zoneId: zoneA.id } });
  const regionA2 = await prisma.region.create({ data: { name: 'Region A2', zoneId: zoneA.id } });
  const regionB1 = await prisma.region.create({ data: { name: 'Region B1', zoneId: zoneB.id } });

  const branchA101 = await prisma.branch.create({ data: { name: 'Branch A101', regionId: regionA1.id } });
  const branchA102 = await prisma.branch.create({ data: { name: 'Branch A102', regionId: regionA1.id } });
  const branchA201 = await prisma.branch.create({ data: { name: 'Branch A201', regionId: regionA2.id } });
  const branchB101 = await prisma.branch.create({ data: { name: 'Branch B101', regionId: regionB1.id } });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // low cost factor: faster tests only

  const rmA1 = await prisma.user.create({
    data: { username: 'rm.a1', passwordHash, name: 'RM A1', role: 'RM', regionId: regionA1.id },
  });
  const rmA2 = await prisma.user.create({
    data: { username: 'rm.a2', passwordHash, name: 'RM A2', role: 'RM', regionId: regionA2.id },
  });
  const rmB1 = await prisma.user.create({
    data: { username: 'rm.b1', passwordHash, name: 'RM B1', role: 'RM', regionId: regionB1.id },
  });
  const bmA101 = await prisma.user.create({
    data: { username: 'bm.a101', passwordHash, name: 'BM A101', role: 'BM', branchId: branchA101.id },
  });
  const bmA102 = await prisma.user.create({
    data: { username: 'bm.a102', passwordHash, name: 'BM A102', role: 'BM', branchId: branchA102.id },
  });
  const bmB101 = await prisma.user.create({
    data: { username: 'bm.b101', passwordHash, name: 'BM B101', role: 'BM', branchId: branchB101.id },
  });

  const leadA101 = await prisma.lead.create({
    data: {
      sourceSrNo: '201',
      customerName: 'Test Customer A101',
      customerPrimaryPhone: '9000000001',
      subProductName: 'Personal Loan',
      amount: 100000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'B',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      branchId: branchA101.id,
    },
  });
  const leadB101 = await prisma.lead.create({
    data: {
      sourceSrNo: '202',
      customerName: 'Test Customer B101',
      customerPrimaryPhone: '9000000002',
      subProductName: 'Home Loan',
      amount: 2000000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'A',
      sourceStageProgress: 'SANCTIONED',
      cbiPesStage: 'APPROVAL',
      branchId: branchB101.id,
    },
  });
  const leadRegionA1 = await prisma.lead.create({
    data: {
      sourceSrNo: '203',
      customerName: 'Test Customer Region A1',
      customerPrimaryPhone: '9000000003',
      subProductName: 'MSME Loan',
      amount: 500000,
      sourceLeadStatus: 'Open',
      sourceCategorization: 'C',
      sourceStageProgress: 'UNDER_PROCESS',
      cbiPesStage: 'INTERESTED',
      regionId: regionA1.id,
    },
  });

  return {
    centralOffice,
    zoneA,
    zoneB,
    regionA1,
    regionA2,
    regionB1,
    branchA101,
    branchA102,
    branchA201,
    branchB101,
    rmA1,
    rmA2,
    rmB1,
    bmA101,
    bmA102,
    bmB101,
    leadA101,
    leadB101,
    leadRegionA1,
  };
}
