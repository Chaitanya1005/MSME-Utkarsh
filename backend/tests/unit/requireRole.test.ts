import { requireRole } from '../../src/middleware/requireRole';
import { AuthenticationError, AuthorizationError } from '../../src/utils/AppError';
import { AuthTokenPayload } from '../../src/types/domain';

function makeReq(user?: AuthTokenPayload) {
  return { user } as unknown as Parameters<ReturnType<typeof requireRole>>[0];
}

describe('requireRole', () => {
  it('calls next() when the user has an allowed role', () => {
    const middleware = requireRole('RM');
    const req = makeReq({ userId: 'u1', username: 'rm.a1', role: 'RM', regionId: 'r1' });
    const next = jest.fn();
    middleware(req, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws AuthorizationError when the user has a disallowed role', () => {
    const middleware = requireRole('RM');
    const req = makeReq({ userId: 'u2', username: 'bm.a101', role: 'BM', branchId: 'b1' });
    const next = jest.fn();
    expect(() => middleware(req, {} as never, next)).toThrow(AuthorizationError);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws AuthenticationError when there is no authenticated user at all', () => {
    const middleware = requireRole('RM');
    const req = makeReq(undefined);
    const next = jest.fn();
    expect(() => middleware(req, {} as never, next)).toThrow(AuthenticationError);
  });

  it('allows any of multiple permitted roles', () => {
    const middleware = requireRole('RM', 'BM');
    const req = makeReq({ userId: 'u3', username: 'bm.b101', role: 'BM', branchId: 'b2' });
    const next = jest.fn();
    middleware(req, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });
});
