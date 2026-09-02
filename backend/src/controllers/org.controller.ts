import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as orgService from '../services/org.service';
import { AuthenticationError } from '../utils/AppError';

export const myScopeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const scope = await orgService.getMyScope(req.user);
  sendSuccess(res, scope);
});

export const getRegionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { regionId } = req.params;
  const region = await orgService.getRegion(req.user, regionId);
  sendSuccess(res, region);
});

export const listBranchesForRegionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { regionId } = req.params;
  const branches = await orgService.getBranchesForRegion(req.user, regionId);
  sendSuccess(res, branches);
});

export const getBranchHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { branchId } = req.params;
  const branch = await orgService.getBranch(req.user, branchId);
  sendSuccess(res, branch);
});
