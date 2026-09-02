import { apiRequest } from './client';
import { CurrentUser, LoginResponse } from '../types/api';

export function loginRequest(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/me');
}

export function logoutRequest(): Promise<{ loggedOut: boolean }> {
  return apiRequest('/auth/logout', { method: 'POST' });
}
