import { findUserByUsername, findUserById } from '../repositories/user.repository';
import { verifyPassword } from '../utils/password';
import { signAuthToken } from '../utils/jwt';
import { InvalidCredentialsError, AuthenticationError } from '../utils/AppError';
import { AuthTokenPayload, Role } from '../types/domain';

interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: Role;
    regionId: string | null;
    branchId: string | null;
  };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await findUserByUsername(username);

  // Deliberately identical error for "no such user" and "wrong password"
  // so the API never confirms whether a given username exists.
  if (!user || !user.isActive) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  const payload: AuthTokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as Role,
    regionId: user.regionId ?? undefined,
    branchId: user.branchId ?? undefined,
  };

  const token = signAuthToken(payload);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as Role,
      regionId: user.regionId,
      branchId: user.branchId,
    },
  };
}

export async function getCurrentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user || !user.isActive) {
    // The token was valid but the underlying account is gone/disabled —
    // treat this the same as an invalid session (spec section 13).
    throw new AuthenticationError('Session is no longer valid');
  }
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as Role,
    region: user.region ? { id: user.region.id, name: user.region.name } : null,
    branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
  };
}
