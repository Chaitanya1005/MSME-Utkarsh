import { findBranchById } from '../repositories/org.repository';
import { createCall, findCallsInitiatedByUser, findCallsReceivedByUser } from '../repositories/call.repository';
import { AuthTokenPayload } from '../types/domain';
import { canAccessBranch } from './authorization';
import { AppError, AuthorizationError, NotFoundError } from '../utils/AppError';
import { callingProvider } from './providers';

// Spec section 12: "The RM should not manually enter the BM's phone
// number. The existing branch/BM relationship and phone data should be
// used." The only input from the client is a branchId — everything else
// (which BM, their phone number) is derived server-side, and the branch
// must actually be in the caller's authorized region (spec section 23:
// "the calling endpoint must also verify that the RM is authorized to
// call the selected BM" — reusing the exact same canAccessBranch check
// every other branch-scoped endpoint in this codebase uses).
export async function initiateCallToBranchBm(user: AuthTokenPayload, branchId: string) {
  if (user.role !== 'RM') {
    throw new AuthorizationError('Only a Regional head can initiate a call from this endpoint');
  }

  const branch = await findBranchById(branchId);
  if (!branch) throw new NotFoundError('Branch');

  if (!canAccessBranch(user, branchId, branch.regionId)) {
    throw new AuthorizationError('You are not authorized to call this branch');
  }

  if (!branch.bm) {
    throw new AppError(409, 'BRANCH_HAS_NO_BM', 'This branch currently has no assigned branch head');
  }
  if (!branch.bm.phoneNumber) {
    throw new AppError(409, 'BM_HAS_NO_PHONE', 'The branch head has no phone number on file');
  }

  const result = await callingProvider.placeCall(branch.bm.phoneNumber);

  const call = await createCall({
    initiatedByUserId: user.userId,
    branchId: branch.id,
    calledUserId: branch.bm.id,
    calledPhoneNumber: branch.bm.phoneNumber,
    status: result.accepted ? 'INITIATED' : 'FAILED',
    providerCallId: result.providerCallId ?? null,
    failureReason: result.accepted ? null : result.failureReason ?? 'Call could not be initiated',
  });

  return call;
}

export async function listMyInitiatedCalls(user: AuthTokenPayload) {
  return findCallsInitiatedByUser(user.userId);
}

// BM-side calling foundation (spec section 13): the current product
// workflow only has the RM initiating calls to a BM — there is no
// BM-initiates-a-call requirement anywhere in the existing spec/roadmap.
// Rather than invent a call-placing UX for the BM that isn't part of the
// actual application design, the BM-side foundation is read visibility
// into calls placed to them, which is genuinely useful (spec section
// 25's manual verification checklist implies the BM should be able to
// see calling activity) without fabricating a new workflow.
export async function listMyReceivedCalls(user: AuthTokenPayload) {
  if (user.role !== 'BM') {
    throw new AuthorizationError('Only a Branch Head has a received-calls list');
  }
  return findCallsReceivedByUser(user.userId);
}
