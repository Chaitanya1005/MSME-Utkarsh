import { apiRequest } from './client';
import { Call } from '../types/api';

// RM initiates a call to a branch's BM. The RM never supplies a phone
// number — it's resolved entirely server-side from the branch/BM
// relationship (spec Phase 5 section 12).
export function initiateCall(branchId: string): Promise<Call> {
  return apiRequest<Call>(`/rm/branches/${branchId}/call`, { method: 'POST' });
}

export function fetchMyInitiatedCalls(): Promise<Call[]> {
  return apiRequest<Call[]>('/rm/calls');
}

export function fetchMyReceivedCalls(): Promise<Call[]> {
  return apiRequest<Call[]>('/bm/calls');
}
