import { isScanStale } from './scan-health';

describe('scan health', () => {
  it('treats a missing heartbeat as stale', () => {
    expect(isScanStale(undefined)).toBeTrue();
    expect(isScanStale(null)).toBeTrue();
  });

  it('treats a recent heartbeat as fresh and an old one as stale', () => {
    const now = Date.now();
    expect(
      isScanStale(new Date(now - 5 * 60 * 1000), now),
    ).toBeFalse();
    expect(
      isScanStale(new Date(now - 20 * 60 * 1000), now),
    ).toBeTrue();
  });

  it('accepts a Firestore timestamp-like object', () => {
    const now = Date.now();
    expect(
      isScanStale({ toDate: () => new Date(now - 60 * 1000) }, now),
    ).toBeFalse();
  });
});
