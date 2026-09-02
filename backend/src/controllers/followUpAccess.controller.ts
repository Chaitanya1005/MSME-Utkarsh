import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as followUpService from '../services/followUp.service';

// Deliberately NOT behind the `authenticate` middleware — the whole point
// is that the BM does not have a session yet when they tap this link.
// Authorization here comes entirely from possessing the correct opaque
// token, exchanged for a real session inside the service layer.
export const exchangeAccessTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const result = await followUpService.exchangeAccessToken(token);
  sendSuccess(res, result);
});
