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

export const getZmDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const dashboard = await dashboardService.getZmDashboard(req.user);
  sendSuccess(res, dashboard);
});

export const getGmDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const dashboard = await dashboardService.getGmDashboard(req.user);
  sendSuccess(res, dashboard);
});

export const getRegionDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { regionId } = req.params;
  const detail = await dashboardService.getRegionDetail(req.user, regionId);
  sendSuccess(res, detail);
});

export const getZoneDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { zoneId } = req.params;
  const detail = await dashboardService.getZoneDetail(req.user, zoneId);
  sendSuccess(res, detail);
});

export const getMyLeadsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const result = await dashboardService.getMyLeads(req.user);
  sendSuccess(res, result);
});
