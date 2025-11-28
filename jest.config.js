/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: [
    '**/__tests__/**/*.+(js)',
    '**/?(*.)+(spec|test).+(js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^\\.\\/rate-limiter\\.js$': '<rootDir>/src/utils/rate-limiter.ts',
    '^\\.\\.\\/types/meta-api\\.js$': '<rootDir>/src/types/meta-api.ts',
    '^\\.\\/utils/auth\\.js$': '<rootDir>/src/utils/auth.ts',
    '^\\.\\/utils/rate-limiter\\.js$': '<rootDir>/src/utils/rate-limiter.ts',
    '^\\.\\/utils/error-handler\\.js$': '<rootDir>/src/utils/error-handler.ts',
    '^\\.\\/utils/pagination\\.js$': '<rootDir>/src/utils/pagination.ts',
    '^\\.\\/meta-client\\.js$': '<rootDir>/src/meta-client.ts'
  },
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ['<rootDir>/__tests__/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testTimeout: 10000,
  verbose: true
};
