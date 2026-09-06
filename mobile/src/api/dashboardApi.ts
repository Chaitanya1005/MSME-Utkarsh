import { apiRequest } from './client';
import { RmDashboard, ZmDashboard, GmDashboard, RegionDetail, ZoneDetail } from '../types/api';

export function fetchRmDashboard(): Promise<RmDashboard> {
  return apiRequest<RmDashboard>('/rm/dashboard');
}

export function fetchZmDashboard(): Promise<ZmDashboard> {
  return apiRequest<ZmDashboard>('/zm/dashboard');
}

export function fetchGmDashboard(): Promise<GmDashboard> {
  return apiRequest<GmDashboard>('/gm/dashboard');
}

export function fetchRegionDetail(regionId: string): Promise<RegionDetail> {
  return apiRequest<RegionDetail>(`/regions/${regionId}/detail`);
}

export function fetchZoneDetail(zoneId: string): Promise<ZoneDetail> {
  return apiRequest<ZoneDetail>(`/zones/${zoneId}/detail`);
}
