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