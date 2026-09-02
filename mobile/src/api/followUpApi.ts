import { apiRequest } from './client';
import {
  CreateFollowUpRequest,
  CreateFollowUpResult,
  FollowUpHistoryItem,
  FollowUpAccessResult,
} from '../types/api';

export function createFollowUp(request: CreateFollowUpRequest): Promise<CreateFollowUpResult> {
  return apiRequest<CreateFollowUpResult>('/rm/follow-ups', {
    method: 'POST',
    body: request,
  });
}

export function fetchMyFollowUps(): Promise<FollowUpHistoryItem[]> {
  return apiRequest<FollowUpHistoryItem[]>('/rm/follow-ups');
}

export function confirmWhatsAppSent(targetId: string): Promise<unknown> {
  return apiRequest(`/rm/follow-ups/targets/${targetId}/confirm-sent`, { method: 'POST' });
}

// Public endpoint — deliberately does NOT go through the authenticated
// apiRequest helper's usual assumptions about an existing session; it IS
// the mechanism that creates a session (see auth/AuthContext.tsx's
// exchangeFollowUpAccessToken usage).
export function exchangeFollowUpAccessToken(rawToken: string): Promise<FollowUpAccessResult> {
  return apiRequest<FollowUpAccessResult>(`/follow-up-access/${encodeURIComponent(rawToken)}`);
}
