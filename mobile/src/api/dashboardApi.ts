import { apiRequest } from './client';
import { RmDashboard } from '../types/api';

export function fetchRmDashboard(): Promise<RmDashboard> {
  return apiRequest<RmDashboard>('/rm/dashboard');
}
