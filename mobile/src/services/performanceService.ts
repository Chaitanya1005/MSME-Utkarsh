import { apiRequest } from '../api/client';

export type PerformancePeriodType =
  | 'MONTH'
  | 'QUARTER'
  | 'ANNUAL';

export interface BranchPerformance {
  rank?: number;
  branchId: string;
  branchName: string;
  target: number;
  achieved: number;
  percentage: number;
  remaining: number;
}

export interface BranchPerformanceDetail {
  branch: {
    id: string;
    name: string;
  };

  period: {
    type: PerformancePeriodType;
    start: string;
    end: string;
  };

  target: number;
  achieved: number;
  percentage: number;
  remaining: number;

  updates: Array<{
    id: string;
    previousAmount: number;
    newAmount: number;
    remarks?: string | null;
    updatedByUserId: string;
    createdAt: string;
  }>;

  canUpdate: boolean;
}

export async function getRegionalPerformance(
  periodType: PerformancePeriodType = 'QUARTER',
) {
  return apiRequest<BranchPerformance[]>(
    `/performance/regional?periodType=${periodType}`,
  );
}

export async function getBranchPerformance(
  branchId: string,
  periodType: PerformancePeriodType = 'QUARTER',
) {
  return apiRequest<BranchPerformanceDetail>(
    `/performance/branches/${branchId}?periodType=${periodType}`,
  );
}

export async function updateBranchPerformance(
  branchId: string,
  achievedAmount: number,
  remarks?: string,
) {
  return apiRequest<{
    target: number;
    achieved: number;
    percentage: number;
    remaining: number;
    achievedAmount: number;
  }>(`/performance/branches/${branchId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      achievedAmount,
      remarks,
    }),
  });
}