import { apiRequest } from './client';
import {
  CreateFollowUpRequest,
  CreateFollowUpResult,
  FollowUpHistoryItem,
  FollowUpAccessResult,
  FollowUpCandidates,
} from '../types/api';

// Role-agnostic path — reachable by RM, ZM, and CO alike (Full-Hierarchy
// Expansion plan). The legacy /rm/follow-ups mount still exists on the
// backend for compatibility but the mobile app always uses this one now.
export function fetchFollowUpCandidates(): Promise<FollowUpCandidates> {
  return apiRequest<FollowUpCandidates>('/follow-ups/candidates');
}

export function createFollowUp(request: CreateFollowUpRequest): Promise<CreateFollowUpResult> {
  return apiRequest<CreateFollowUpResult>('/follow-ups', {
    method: 'POST',
    body: request,
  });
}

export function fetchMyFollowUps(): Promise<FollowUpHistoryItem[]> {
  return apiRequest<FollowUpHistoryItem[]>('/follow-ups');
}

export function confirmWhatsAppSent(targetId: string): Promise<unknown> {
  return apiRequest(`/follow-ups/targets/${targetId}/confirm-sent`, { method: 'POST' });
}

// Public endpoint — deliberately does NOT go through the authenticated
// apiRequest helper's usual assumptions about an existing session; it IS
// the mechanism that creates a session (see auth/AuthContext.tsx's
// exchangeFollowUpAccessToken usage).
export function exchangeFollowUpAccessToken(rawToken: string): Promise<FollowUpAccessResult> {
  return apiRequest<FollowUpAccessResult>(`/follow-up-access/${encodeURIComponent(rawToken)}`);
}
