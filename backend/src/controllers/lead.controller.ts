import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as leadService from '../services/lead.service';
import { getLeadActivityForViewer } from '../services/leadUpdate.service';
import { AuthenticationError } from '../utils/AppError';

export const listLeadsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const query = req.query as unknown as {
    page: number;
    pageSize: number;
    branchId?: string;
    regionId?: string;
    cbiPesStage?: 'INTERESTED' | 'CONTACTED' | 'APPLICATION' | 'APPROVAL' | 'CONVERSION';
  };

  const pagination = { page: query.page, pageSize: query.pageSize };
  leadService.assertValidPagination(pagination);

  const result = await leadService.listAuthorizedLeads(
    req.user,
    {
      branchId: query.branchId,
      regionId: query.regionId,
      cbiPesStage: query.cbiPesStage,
    },
    pagination
  );
  sendSuccess(res, result);
});

export const getLeadHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { leadId } = req.params;
  const lead = await leadService.getAuthorizedLead(req.user, leadId);
  sendSuccess(res, lead);
});

export const getLeadActivityHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { leadId } = req.params;
  const activity = await getLeadActivityForViewer(req.user, leadId);
  sendSuccess(res, activity);
});
