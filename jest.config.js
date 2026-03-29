'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.test.js',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/workers/**',
    '!src/config/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches:   60,
      functions:  65,
      lines:      65,
      statements: 65,
    },
  },
  moduleNameMapper: {
    '^@azure/storage-blob$': '<rootDir>/tests/__mocks__/@azure/storage-blob.js',
  },
  clearMocks: false,
  restoreMocks: false,
  testTimeout: 10_000,
  verbose: true,
};
