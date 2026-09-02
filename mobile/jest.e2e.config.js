/**
 * Opt-in end-to-end config. These tests talk to a REAL backend on :4000, so
 * they are deliberately excluded from `npm test` (which stays hermetic and
 * needs no server). Run them with `npm run test:e2e`.
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/e2e/**/*.e2e.test.(ts|tsx)'],
};
