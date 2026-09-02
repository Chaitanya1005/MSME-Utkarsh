import { deriveBranchUpdateStatus, PENDING_UPDATE_WINDOW_DAYS } from '../../src/services/branchUpdateStatus';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('deriveBranchUpdateStatus', () => {
  it('is RECENTLY_UPDATED when a lead was updated within the pending-update window', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(1),
      latestFollowUpSentAt: null,
      now: NOW,
    });
    expect(status).toBe('RECENTLY_UPDATED');
  });

  it('is RECENTLY_UPDATED exactly at the window boundary', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(PENDING_UPDATE_WINDOW_DAYS),
      latestFollowUpSentAt: null,
      now: NOW,
    });
    expect(status).toBe('RECENTLY_UPDATED');
  });

  it('is UPDATE_REQUIRED when there is no lead activity and no follow-up at all', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: null,
      latestFollowUpSentAt: null,
      now: NOW,
    });
    expect(status).toBe('UPDATE_REQUIRED');
  });

  it('is UPDATE_REQUIRED when lead activity is stale and no follow-up has been sent since', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(PENDING_UPDATE_WINDOW_DAYS + 5),
      latestFollowUpSentAt: null,
      now: NOW,
    });
    expect(status).toBe('UPDATE_REQUIRED');
  });

  it('is FOLLOW_UP_INITIATED when a follow-up was sent more recently than the last (stale) lead update', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(PENDING_UPDATE_WINDOW_DAYS + 5),
      latestFollowUpSentAt: daysAgo(1),
      now: NOW,
    });
    expect(status).toBe('FOLLOW_UP_INITIATED');
  });

  it('is FOLLOW_UP_INITIATED when there is no lead activity at all but a follow-up was sent', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: null,
      latestFollowUpSentAt: daysAgo(2),
      now: NOW,
    });
    expect(status).toBe('FOLLOW_UP_INITIATED');
  });

  it('prefers RECENTLY_UPDATED over FOLLOW_UP_INITIATED when the lead was updated after the follow-up (BM responded)', () => {
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(1),
      latestFollowUpSentAt: daysAgo(3),
      now: NOW,
    });
    expect(status).toBe('RECENTLY_UPDATED');
  });

  it('is UPDATE_REQUIRED when an old follow-up predates an even-older-but-still-stale lead update window', () => {
    // Both signals are stale, but the lead update is MORE recent than the
    // follow-up — a stale follow-up that predates the last real activity
    // should not keep masking a genuinely-requires-attention branch.
    const status = deriveBranchUpdateStatus({
      lastLeadUpdateAt: daysAgo(PENDING_UPDATE_WINDOW_DAYS + 10),
      latestFollowUpSentAt: daysAgo(PENDING_UPDATE_WINDOW_DAYS + 20),
      now: NOW,
    });
    expect(status).toBe('UPDATE_REQUIRED');
  });
});
