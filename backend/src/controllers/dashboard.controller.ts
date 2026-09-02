import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as dashboardService from '../services/dashboard.service';
import { AuthenticationError } from '../utils/AppError';

export const getRmDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const dashboard = await dashboardService.getRmDashboard(req.user);
  sendSuccess(res, dashboard);
});
