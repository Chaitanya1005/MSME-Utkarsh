import { prisma } from '../config/prisma';
import {
  AuthorizationError,
  NotFoundError,
} from '../utils/AppError';
import {
  AuthTokenPayload,
} from '../types/domain';
import {
  PerformancePeriodType,
  Prisma,
} from '@prisma/client';
import {
  getCurrentFiscalYearWindow,
  getPreviousFiscalYearWindow,
  getNextMonthWindow,
  getNextQuarterWindow,
  DateWindow,
} from './fiscalYear';

function calculatePerformance(
  targetAmount: Prisma.Decimal | number,
  achievedAmount: Prisma.Decimal | number,
) {
  const target = Number(targetAmount);
  const achieved = Number(achievedAmount);

  const percentage =
    target > 0
      ? Math.round((achieved / target) * 100)
      : 0;

  return {
    target,
    achieved,
    percentage,
    remaining: Math.max(
      target - achieved,
      0,
    ),
  };
}

function validatePeriodType(
  periodType: PerformancePeriodType,
) {
  if (
    !Object.values(
      PerformancePeriodType,
    ).includes(periodType)
  ) {
    throw new Error(
      'Invalid performance period type',
    );
  }
}

export async function getRegionalPerformance(
  user: AuthTokenPayload,
  periodType: PerformancePeriodType = PerformancePeriodType.QUARTER,
) {
  if (!user.regionId) {
    throw new AuthorizationError(
      'You are not assigned to a region',
    );
  }

  validatePeriodType(periodType);

  const branches =
    await prisma.branch.findMany({
      where: {
        regionId: user.regionId,
      },
      select: {
        id: true,
        name: true,
      },
    });

  const performances =
    await prisma.branchPerformance.findMany({
      where: {
        periodType,
        branchId: {
          in: branches.map(
            (branch) => branch.id,
          ),
        },
      },
      orderBy: [
        {
          achievedAmount: 'desc',
        },
      ],
    });

  const performanceByBranch =
    new Map(
      performances.map((item) => [
        item.branchId,
        item,
      ]),
    );

  const result = branches.map(
    (branch) => {
      const performance =
        performanceByBranch.get(
          branch.id,
        );

      const calculated = performance
        ? calculatePerformance(
            performance.targetAmount,
            performance.achievedAmount,
          )
        : {
            target: 0,
            achieved: 0,
            percentage: 0,
            remaining: 0,
          };

      return {
        branchId: branch.id,
        branchName: branch.name,
        ...calculated,
      };
    },
  );

  result.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }

    if (b.achieved !== a.achieved) {
      return b.achieved - a.achieved;
    }

    return a.branchName.localeCompare(
      b.branchName,
    );
  });

  return result.map(
    (branch, index) => ({
      rank: index + 1,
      ...branch,
    }),
  );
}

export async function getBranchPerformance(
  user: AuthTokenPayload,
  branchId: string,
  periodType: PerformancePeriodType = PerformancePeriodType.QUARTER,
) {
  validatePeriodType(periodType);

  const branch =
    await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

  if (!branch) {
    throw new NotFoundError(
      'Branch',
    );
  }

  const allowed =
    user.role === 'BM'
      ? user.branchId === branchId
      : user.role === 'RM'
        ? user.regionId ===
          branch.regionId
        : false;

  if (!allowed) {
    throw new AuthorizationError(
      'You are not authorized to access this branch',
    );
  }

  const performance =
    await prisma.branchPerformance.findFirst({
      where: {
        branchId,
        periodType,
      },
      orderBy: {
        periodStart: 'desc',
      },
    });

  if (!performance) {
    throw new NotFoundError(
      'Branch performance',
    );
  }

  const calculated =
    calculatePerformance(
      performance.targetAmount,
      performance.achievedAmount,
    );

  const updates =
    await prisma.performanceUpdate.findMany({
      where: {
        branchPerformanceId:
          performance.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

  return {
    branch: {
      id: branch.id,
      name: branch.name,
    },

    period: {
      type: performance.periodType,
      start: performance.periodStart,
      end: performance.periodEnd,
    },

    ...calculated,

    updates,

    canUpdate:
      user.role === 'BM' &&
      user.branchId === branchId,
  };
}

export async function updateBranchPerformance(
  user: AuthTokenPayload,
  branchId: string,
  achievedAmount: number,
  remarks?: string,
  periodType: PerformancePeriodType = PerformancePeriodType.QUARTER,
) {
  if (
    user.role !== 'BM' ||
    user.branchId !== branchId
  ) {
    throw new AuthorizationError(
      'Only the Branch Manager can update this branch performance',
    );
  }

  validatePeriodType(periodType);

  if (
    !Number.isFinite(achievedAmount) ||
    achievedAmount < 0
  ) {
    throw new Error(
      'Invalid achieved amount',
    );
  }

  const performance =
    await prisma.branchPerformance.findFirst({
      where: {
        branchId,
        periodType,
      },
      orderBy: {
        periodStart: 'desc',
      },
    });

  if (!performance) {
    throw new NotFoundError(
      'Branch performance',
    );
  }

  const previousAmount =
    Number(
      performance.achievedAmount,
    );

  if (achievedAmount < previousAmount) {
    throw new Error(
      'Achieved amount cannot be lower than the current amount',
    );
  }

  const updated =
    await prisma.$transaction(
      async (tx) => {
        const result =
          await tx.branchPerformance.update({
            where: {
              id: performance.id,
            },
            data: {
              achievedAmount,
            },
          });

        await tx.performanceUpdate.create({
          data: {
            branchPerformanceId:
              performance.id,
            previousAmount,
            newAmount:
              achievedAmount,
            remarks:
              remarks?.trim() ||
              undefined,
            updatedByUserId:
              user.userId,
          },
        });

        return result;
      },
    );

  return {
    ...calculatePerformance(
      updated.targetAmount,
      updated.achievedAmount,
    ),

    achievedAmount:
      Number(
        updated.achievedAmount,
      ),
  };
}

export interface PerformanceEvaluationMetric {
  label: string;
  asOf: string; // ISO date (yyyy-mm-dd)
  value: number | null; // null when no BranchPerformance row exists for this window yet
}

export interface PerformanceEvaluationBranch {
  branchId: string;
  branchName: string;
  businessAsOfToday: number | null;
  comparisons: PerformanceEvaluationMetric[]; // always exactly 4, in cycle order
}

type PerformanceRecord = {
  branchId: string;
  periodType: PerformancePeriodType;
  periodStart: Date;
  targetAmount: Prisma.Decimal;
  achievedAmount: Prisma.Decimal;
};

function findRecord(
  records: PerformanceRecord[],
  periodType: PerformancePeriodType,
  window: DateWindow,
): PerformanceRecord | undefined {
  return records.find(
    (r) =>
      r.periodType === periodType &&
      r.periodStart.getTime() === window.start.getTime(),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The RM-facing "Performance Evaluation" screen (renamed from "My
// Branches"): per branch, a live "business done as of today" figure
// plus four comparison points the UI cycles through one at a time on
// tap rather than showing all at once:
//   1. Actual business as on 31 March of the previous fiscal year
//   2. Target for next month-end
//   3. Target for next quarter-end
//   4. Target for this fiscal year's year-end (the FY currently in progress)
// "Business as of today" and metric 4 both read off the SAME current-FY
// ANNUAL record (achievedAmount vs targetAmount respectively) — the
// exact record every BM already keeps current via updateBranchPerformance.
export async function getPerformanceEvaluation(
  user: AuthTokenPayload,
): Promise<PerformanceEvaluationBranch[]> {
  if (!user.regionId) {
    throw new AuthorizationError(
      'You are not assigned to a region',
    );
  }

  const branches = await prisma.branch.findMany({
    where: { regionId: user.regionId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const branchIds = branches.map((b) => b.id);

  const allRecords: PerformanceRecord[] =
    await prisma.branchPerformance.findMany({
      where: { branchId: { in: branchIds } },
      select: {
        branchId: true,
        periodType: true,
        periodStart: true,
        periodEnd: true,
        targetAmount: true,
        achievedAmount: true,
      },
    });

  const recordsByBranch = new Map<string, PerformanceRecord[]>();
  for (const record of allRecords) {
    const list = recordsByBranch.get(record.branchId) ?? [];
    list.push(record);
    recordsByBranch.set(record.branchId, list);
  }

  const now = new Date();
  const currentFY = getCurrentFiscalYearWindow(now);
  const previousFY = getPreviousFiscalYearWindow(now);
  const nextMonth = getNextMonthWindow(now);
  const nextQuarter = getNextQuarterWindow(now);

  return branches.map((branch) => {
    const records = recordsByBranch.get(branch.id) ?? [];

    const currentFYRecord = findRecord(records, 'ANNUAL', currentFY);
    const previousFYRecord = findRecord(records, 'ANNUAL', previousFY);
    const nextMonthRecord = findRecord(records, 'MONTH', nextMonth);
    const nextQuarterRecord = findRecord(records, 'QUARTER', nextQuarter);

    const comparisons: PerformanceEvaluationMetric[] = [
      {
        label: 'Business as on 31 March (last FY)',
        asOf: isoDate(previousFY.end),
        value: previousFYRecord
          ? Number(previousFYRecord.achievedAmount)
          : null,
      },
      {
        label: 'Target for next month',
        asOf: isoDate(nextMonth.end),
        value: nextMonthRecord
          ? Number(nextMonthRecord.targetAmount)
          : null,
      },
      {
        label: 'Target for next quarter',
        asOf: isoDate(nextQuarter.end),
        value: nextQuarterRecord
          ? Number(nextQuarterRecord.targetAmount)
          : null,
      },
      {
        label: 'Target for this fiscal year',
        asOf: isoDate(currentFY.end),
        value: currentFYRecord
          ? Number(currentFYRecord.targetAmount)
          : null,
      },
    ];

    return {
      branchId: branch.id,
      branchName: branch.name,
      businessAsOfToday: currentFYRecord
        ? Number(currentFYRecord.achievedAmount)
        : null,
      comparisons,
    };
  });
}