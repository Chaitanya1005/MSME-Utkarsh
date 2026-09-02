import { Request, Response } from 'express';
import { PerformancePeriodType } from '@prisma/client';

import {
  getRegionalPerformance,
  getBranchPerformance,
  updateBranchPerformance,
} from '../services/performance.service';

import {
  AuthenticationError,
} from '../utils/AppError';

export const getRegionalPerformanceHandler = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    throw new AuthenticationError(
      'Authentication required',
    );
  }

  const periodType =
    (req.query.periodType as PerformancePeriodType) ||
    PerformancePeriodType.QUARTER;

  const performance =
    await getRegionalPerformance(
      req.user,
      periodType,
    );

  return res.status(200).json({
    success: true,
    data: performance,
  });
};

export const getBranchPerformanceHandler = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    throw new AuthenticationError(
      'Authentication required',
    );
  }

  const { branchId } = req.params;

  const periodType =
    (req.query.periodType as PerformancePeriodType) ||
    PerformancePeriodType.QUARTER;

  const performance =
    await getBranchPerformance(
      req.user,
      branchId,
      periodType,
    );

  return res.status(200).json({
    success: true,
    data: performance,
  });
};

export const updateBranchPerformanceHandler = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    throw new AuthenticationError(
      'Authentication required',
    );
  }

  const { branchId } = req.params;

  const {
    achievedAmount,
    remarks,
    periodType,
  } = req.body;

  const selectedPeriod =
    periodType || PerformancePeriodType.QUARTER;

  const performance =
    await updateBranchPerformance(
      req.user,
      branchId,
      Number(achievedAmount),
      remarks,
      selectedPeriod,
    );

  return res.status(200).json({
    success: true,
    data: performance,
  });
};