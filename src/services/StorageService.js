// 100% Pure Mock Storage Service
export const StorageService = {
  /**
   * Simulates a local file upload for demo purposes
   */
  async uploadFile(file, path) {
    console.log(`Mock: Simulating upload of ${file.name} to ${path}`);
    // Simulate short network delay
    await new Promise(resolve => setTimeout(resolve, 600));
    return `mock-storage-path/${file.name}`;
  },

  /**
   * Simulates generating a public URL for a mock file
   */
  async getFileUrl(path) {
    // Return a transparent 1x1 pixel data URI for mock purposes to avoid network errors
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  },

  /**
   * Simulates file deletion in mock state
   */
  async deleteFile(path) {
    console.log(`Mock: Simulating deletion of ${path}`);
    return Promise.resolve();
  }
};
