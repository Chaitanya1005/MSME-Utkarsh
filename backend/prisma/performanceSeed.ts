import {
  PerformancePeriodType,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const branchPerformance = [
  {
    branch: 'Andheri',
    target: 5000000,
    achieved: 4250000,
  },
  {
    branch: 'Bandra East',
    target: 4500000,
    achieved: 3375000,
  },
  {
    branch: 'Worli',
    target: 6000000,
    achieved: 5100000,
  },
  {
    branch: 'Thane',
    target: 4000000,
    achieved: 2600000,
  },
  {
    branch: 'Churchgate',
    target: 5500000,
    achieved: 4675000,
  },
  {
    branch: 'Colaba',
    target: 3500000,
    achieved: 2975000,
  },
  {
    branch: 'Fort',
    target: 7000000,
    achieved: 4900000,
  },
  {
    branch: 'Cuffe Parade',
    target: 4800000,
    achieved: 4560000,
  },
  {
    branch: 'Mahalaxmi',
    target: 5200000,
    achieved: 3640000,
  },
  {
    branch: 'Sion',
    target: 4300000,
    achieved: 3870000,
  },
];

function getPercentage(
  achieved: number,
  target: number,
) {
  return target > 0
    ? Math.round((achieved / target) * 100)
    : 0;
}

function getQuarterDates() {
  return {
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2026-09-30T23:59:59.999Z'),
  };
}

function getMonthDates() {
  return {
    start: new Date('2026-09-01T00:00:00.000Z'),
    end: new Date('2026-09-30T23:59:59.999Z'),
  };
}

function getAnnualDates() {
  return {
    start: new Date('2026-04-01T00:00:00.000Z'),
    end: new Date('2027-03-31T23:59:59.999Z'),
  };
}

async function main() {
  console.log(
    'Seeding branch performance data...',
  );

  /*
   * ----------------------------------------------------
   * 1. Find RM1
   * ----------------------------------------------------
   *
   * All ten demonstration branches are assigned to the
   * same region as rm.a1 so that the RM regional
   * leaderboard displays all ten branches.
   */

  const rm = await prisma.user.findUnique({
    where: {
      username: 'rm.a1',
    },
    select: {
      id: true,
      username: true,
      regionId: true,
    },
  });

  if (!rm) {
    throw new Error(
      'User rm.a1 was not found. Run the main seed first.',
    );
  }

  if (!rm.regionId) {
    throw new Error(
      'User rm.a1 is not assigned to a region.',
    );
  }

  console.log(
    `Using region ${rm.regionId} for RM ${rm.username}`,
  );

  /*
   * ----------------------------------------------------
   * 2. Get existing branches
   * ----------------------------------------------------
   *
   * We preserve existing branch IDs so existing lead
   * relationships are not broken.
   */

  const existingBranches =
    await prisma.branch.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });

  /*
   * ----------------------------------------------------
   * 3. Create / rename / reassign ten branches
   * ----------------------------------------------------
   */

  const branches = [];

  for (
    let index = 0;
    index < branchPerformance.length;
    index++
  ) {
    const branchData = branchPerformance[index];

    let branch = existingBranches[index];

    if (branch) {
      branch = await prisma.branch.update({
        where: {
          id: branch.id,
        },
        data: {
          name: branchData.branch,
          regionId: rm.regionId,
        },
      });
    } else {
      branch = await prisma.branch.create({
        data: {
          name: branchData.branch,
          regionId: rm.regionId,
        },
      });
    }

    branches.push(branch);
  }

  /*
   * ----------------------------------------------------
   * 4. Remove duplicate demo branches from the RM region
   * ----------------------------------------------------
   *
   * Only branches outside the ten selected names are
   * considered. Existing lead relationships are preserved;
   * we simply move those extra branches away from RM1's
   * region so they don't appear in the leaderboard.
   */

  const requiredNames = branchPerformance.map(
    (item) => item.branch,
  );

  const extraBranches =
    await prisma.branch.findMany({
      where: {
        regionId: rm.regionId,
        name: {
          notIn: requiredNames,
        },
      },
    });

  /*
   * Do not delete extra branches because they may have
   * leads/users associated with them.
   *
   * Instead, leave them untouched if they are not part of
   * the seeded ten. The important part is that the ten
   * performance branches all belong to RM1's region.
   */

  if (extraBranches.length > 0) {
    console.log(
      `Existing additional branches in RM1 region: ${extraBranches.length}`,
    );
  }

  /*
   * ----------------------------------------------------
   * 5. Performance periods
   * ----------------------------------------------------
   */

  const quarter = getQuarterDates();
  const month = getMonthDates();
  const annual = getAnnualDates();

  /*
   * ----------------------------------------------------
   * 6. Seed performance for all three periods
   * ----------------------------------------------------
   *
   * Quarter uses the supplied dummy values.
   *
   * Month uses the same achievement ratio with a smaller
   * target, making the Month selector functional.
   *
   * Annual uses the same achievement ratio against a larger
   * annual target.
   */

  for (
    let index = 0;
    index < branchPerformance.length;
    index++
  ) {
    const data = branchPerformance[index];
    const branch = branches[index];

    const ratio =
      data.target > 0
        ? data.achieved / data.target
        : 0;

    /*
     * QUARTER
     */

    await prisma.branchPerformance.upsert({
      where: {
        branchId_periodType_periodStart_periodEnd: {
          branchId: branch.id,
          periodType:
            PerformancePeriodType.QUARTER,
          periodStart: quarter.start,
          periodEnd: quarter.end,
        },
      },
      update: {
        targetAmount: data.target,
        achievedAmount: data.achieved,
      },
      create: {
        branchId: branch.id,
        periodType:
          PerformancePeriodType.QUARTER,
        periodStart: quarter.start,
        periodEnd: quarter.end,
        targetAmount: data.target,
        achievedAmount: data.achieved,
      },
    });

    /*
     * MONTH
     *
     * September target = 35% of quarter target.
     */

    const monthlyTarget = Math.round(
      data.target * 0.35,
    );

    const monthlyAchieved = Math.round(
      monthlyTarget * ratio,
    );

    await prisma.branchPerformance.upsert({
      where: {
        branchId_periodType_periodStart_periodEnd: {
          branchId: branch.id,
          periodType:
            PerformancePeriodType.MONTH,
          periodStart: month.start,
          periodEnd: month.end,
        },
      },
      update: {
        targetAmount: monthlyTarget,
        achievedAmount: monthlyAchieved,
      },
      create: {
        branchId: branch.id,
        periodType:
          PerformancePeriodType.MONTH,
        periodStart: month.start,
        periodEnd: month.end,
        targetAmount: monthlyTarget,
        achievedAmount: monthlyAchieved,
      },
    });

    /*
     * ANNUAL
     *
     * Annual target = 4x quarter target for the demo.
     */

    const annualTarget = data.target * 4;

    const annualAchieved = Math.round(
      annualTarget * ratio,
    );

    await prisma.branchPerformance.upsert({
      where: {
        branchId_periodType_periodStart_periodEnd: {
          branchId: branch.id,
          periodType:
            PerformancePeriodType.ANNUAL,
          periodStart: annual.start,
          periodEnd: annual.end,
        },
      },
      update: {
        targetAmount: annualTarget,
        achievedAmount: annualAchieved,
      },
      create: {
        branchId: branch.id,
        periodType:
          PerformancePeriodType.ANNUAL,
        periodStart: annual.start,
        periodEnd: annual.end,
        targetAmount: annualTarget,
        achievedAmount: annualAchieved,
      },
    });

    console.log(
      `${branch.name}: ` +
        `Quarter ${getPercentage(
          data.achieved,
          data.target,
        )}% | ` +
        `Month ${getPercentage(
          monthlyAchieved,
          monthlyTarget,
        )}% | ` +
        `Annual ${getPercentage(
          annualAchieved,
          annualTarget,
        )}%`,
    );
  }

  /*
   * ----------------------------------------------------
   * 7. Final verification
   * ----------------------------------------------------
   */

  const verifiedBranches =
    await prisma.branch.findMany({
      where: {
        regionId: rm.regionId,
        name: {
          in: requiredNames,
        },
      },
      select: {
        id: true,
        name: true,
        regionId: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

  console.log('');
  console.log(
    `Verified ${verifiedBranches.length} performance branches in RM1 region.`,
  );

  if (
    verifiedBranches.length !==
    branchPerformance.length
  ) {
    throw new Error(
      `Expected ${branchPerformance.length} branches, found ${verifiedBranches.length}.`,
    );
  }

  console.log('');
  console.log(
    'Performance seed completed successfully.',
  );
}

main()
  .catch((error) => {
    console.error(
      'Performance seed failed:',
      error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  