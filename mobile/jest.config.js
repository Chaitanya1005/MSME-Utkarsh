module.exports = {
  preset: 'react-native',
  // e2e/ requires a running backend; it is opt-in via `npm run test:e2e`
  // so that `npm test` stays hermetic.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFilesAfterEnv: [],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@tanstack|react-native-.*)/)',
  ],
};
