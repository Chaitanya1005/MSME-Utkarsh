import { hashPassword, verifyPassword } from '../../src/utils/password';

describe('password hashing', () => {
  it('never stores the plaintext password in the hash', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple1!');
    expect(hash).not.toContain('CorrectHorseBatteryStaple1!');
  });

  it('produces a bcrypt-formatted hash', async () => {
    const hash = await hashPassword('SomePassword123!');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('SomePassword123!');
    await expect(verifyPassword('SomePassword123!', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('SomePassword123!');
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hashOne = await hashPassword('SamePassword');
    const hashTwo = await hashPassword('SamePassword');
    expect(hashOne).not.toEqual(hashTwo);
  });
});
