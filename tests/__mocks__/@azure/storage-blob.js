/**
 * tests/__mocks__/@azure/storage-blob.js
 * ─────────────────────────────────────────────────────────────
 * Manual Jest mock for the @azure/storage-blob package.
 *
 * Why this file exists:
 *   @azure/storage-blob ships as an ESM-only package in recent
 *   versions which confuses Jest's CommonJS transform.  By
 *   providing a manual stub we keep tests fast (no real HTTP
 *   calls) and avoid transform errors.
 *
 * Usage:
 *   The jest.config.js moduleNameMapper points any import of
 *   '@azure/storage-blob' here automatically.  Individual tests
 *   can override specific methods with jest.fn() as needed.
 */

'use strict';

// ─── Minimal Block-Blob client ────────────────────────────────
const mockBlockBlobClient = {
  url: 'https://fakeaccount.blob.core.windows.net/biobeats-audio/track.mp3',
  uploadData:   jest.fn().mockResolvedValue({ requestId: 'mock-req-1' }),
  uploadFile:   jest.fn().mockResolvedValue({ requestId: 'mock-req-2' }),
  download:     jest.fn().mockResolvedValue({
    readableStreamBody: { pipe: jest.fn() },
    contentType:        'audio/mpeg',
    contentLength:      5_000_000,
  }),
  deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
};

// ─── Minimal Blob client (for download/delete by name) ────────
const mockBlobClient = {
  download:       jest.fn().mockResolvedValue({
    readableStreamBody: { pipe: jest.fn() },
    contentType:        'audio/mpeg',
    contentLength:      5_000_000,
  }),
  deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
};

// ─── Container client ─────────────────────────────────────────
const mockContainerClient = {
  createIfNotExists:  jest.fn().mockResolvedValue({ succeeded: true }),
  getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
  getBlobClient:      jest.fn().mockReturnValue(mockBlobClient),
};

// ─── BlobServiceClient ────────────────────────────────────────
const mockBlobServiceClient = {
  getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
};

const BlobServiceClient = {
  fromConnectionString: jest.fn().mockReturnValue(mockBlobServiceClient),
};

// ─── SAS helpers ──────────────────────────────────────────────
const BlobSASPermissions = {
  parse: jest.fn().mockReturnValue({ read: true, write: true, create: true }),
};

const generateBlobSASQueryParameters = jest.fn().mockReturnValue({
  toString: () => 'sv=2021-12-02&spr=https&st=start&se=end&spr=https&sig=fakesig',
});

// StorageSharedKeyCredential just needs to be constructable
function StorageSharedKeyCredential(accountName, accountKey) {
  this.accountName = accountName;
  this.accountKey  = accountKey;
}

// ─── Exports (mirrors the real package's named exports) ───────
module.exports = {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,

  // Expose internal mock handles so tests can inspect calls
  __mocks__: {
    mockBlobServiceClient,
    mockContainerClient,
    mockBlockBlobClient,
    mockBlobClient,
  },
};
