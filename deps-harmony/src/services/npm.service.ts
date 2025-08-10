export interface NpmPackageInfo {
  name: string;
  versions: { [version: string]: any };
  "dist-tags": { [tag: string]: string };
  time: { [version: string]: string };
}

export class NpmService {
  private static cache = new Map<string, NpmPackageInfo>();
  private static readonly REGISTRY_URL = "https://registry.npmjs.org";

  /**
   * Get package information from npm registry with caching
   */
  public static async getPackageInfo(
    packageName: string
  ): Promise<NpmPackageInfo | null> {
    // Check cache first
    if (this.cache.has(packageName)) {
      return this.cache.get(packageName)!;
    }

    try {
      const url = `${this.REGISTRY_URL}/${encodeURIComponent(packageName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Package ${packageName} not found in npm registry`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const packageInfo = (await response.json()) as NpmPackageInfo;

      // Cache the result
      this.cache.set(packageName, packageInfo);

      return packageInfo;
    } catch (error) {
      console.error(`Failed to fetch package info for ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Get all available versions for a package
   */
  public static async getAvailableVersions(
    packageName: string
  ): Promise<string[]> {
    const packageInfo = await this.getPackageInfo(packageName);
    if (!packageInfo) {
      return [];
    }

    return Object.keys(packageInfo.versions).sort((a, b) => {
      // Sort versions in descending order (newest first)
      // This is a simple string comparison - for production, use semver.compare
      return b.localeCompare(a, undefined, { numeric: true });
    });
  }

  /**
   * Get the latest version for a package
   */
  public static async getLatestVersion(
    packageName: string
  ): Promise<string | null> {
    const packageInfo = await this.getPackageInfo(packageName);
    if (!packageInfo) {
      return null;
    }

    return packageInfo["dist-tags"].latest || null;
  }

  /**
   * Clear the cache (useful for testing or memory management)
   */
  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public static getCacheStats(): { size: number; packages: string[] } {
    return {
      size: this.cache.size,
      packages: Array.from(this.cache.keys()),
    };
  }
}
