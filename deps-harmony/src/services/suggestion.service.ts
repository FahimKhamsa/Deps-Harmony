import * as semver from "semver";
import { NpmService } from "./npm.service";

export interface PackageSuggestion {
  packageName: string;
  suggestedVersion: string;
  reason: string;
  peerDependencies: { [name: string]: string };
}

export interface CompatibilityResult {
  compatible: boolean;
  suggestions: PackageSuggestion[];
  conflicts: string[];
  installCommand: string;
}

export class SuggestionService {
  /**
   * Suggest compatible package versions for a list of packages
   */
  public static async suggestCompatiblePackages(
    packageNames: string[]
  ): Promise<CompatibilityResult> {
    try {
      const suggestions: PackageSuggestion[] = [];
      const conflicts: string[] = [];
      const peerDependencyMap = new Map<string, Set<string>>();

      // Step 1: Get package info and peer dependencies for each package
      for (const packageName of packageNames) {
        const packageInfo = await NpmService.getPackageInfo(packageName);
        if (!packageInfo) {
          conflicts.push(`Package ${packageName} not found in npm registry`);
          continue;
        }

        const latestVersion = packageInfo["dist-tags"].latest;
        if (!latestVersion) {
          conflicts.push(`No latest version found for ${packageName}`);
          continue;
        }

        // Get peer dependencies for the latest version
        const versionInfo = packageInfo.versions[latestVersion];
        const peerDeps = versionInfo?.peerDependencies || {};

        // Add to peer dependency map
        Object.keys(peerDeps).forEach((peerName) => {
          if (!peerDependencyMap.has(peerName)) {
            peerDependencyMap.set(peerName, new Set());
          }
          peerDependencyMap.get(peerName)!.add(peerDeps[peerName]);
        });

        suggestions.push({
          packageName,
          suggestedVersion: latestVersion,
          reason: "Latest stable version",
          peerDependencies: peerDeps,
        });
      }

      // Step 2: Check for peer dependency conflicts
      const peerConflicts: string[] = [];
      for (const [peerName, versionRanges] of peerDependencyMap) {
        if (versionRanges.size > 1) {
          const rangesArray = Array.from(versionRanges);
          const compatibleVersion = await this.findCompatibleVersion(
            peerName,
            rangesArray
          );

          if (!compatibleVersion) {
            peerConflicts.push(
              `Conflicting peer dependency requirements for ${peerName}: ${rangesArray.join(
                ", "
              )}`
            );
          } else {
            // Add peer dependency to suggestions if not already included
            if (!suggestions.some((s) => s.packageName === peerName)) {
              suggestions.push({
                packageName: peerName,
                suggestedVersion: compatibleVersion,
                reason: "Required peer dependency",
                peerDependencies: {},
              });
            }
          }
        }
      }

      conflicts.push(...peerConflicts);

      // Step 3: Generate install command
      const installCommand = this.generateInstallCommand(suggestions);

      return {
        compatible: conflicts.length === 0,
        suggestions,
        conflicts,
        installCommand,
      };
    } catch (error) {
      return {
        compatible: false,
        suggestions: [],
        conflicts: [
          `Error analyzing packages: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
        installCommand: "",
      };
    }
  }

  /**
   * Find a version that satisfies all given version ranges
   */
  private static async findCompatibleVersion(
    packageName: string,
    versionRanges: string[]
  ): Promise<string | null> {
    try {
      const availableVersions = await NpmService.getAvailableVersions(
        packageName
      );

      // Find a version that satisfies all ranges
      for (const version of availableVersions) {
        const satisfiesAll = versionRanges.every((range) =>
          semver.satisfies(version, range)
        );

        if (satisfiesAll) {
          return version;
        }
      }

      return null;
    } catch (error) {
      console.error(
        `Error finding compatible version for ${packageName}:`,
        error
      );
      return null;
    }
  }

  /**
   * Generate npm install command from suggestions
   */
  private static generateInstallCommand(
    suggestions: PackageSuggestion[]
  ): string {
    if (suggestions.length === 0) {
      return "";
    }

    const packages = suggestions
      .map((s) => `${s.packageName}@${s.suggestedVersion}`)
      .join(" ");

    return `npm install ${packages}`;
  }

  /**
   * Analyze existing package.json for compatibility issues
   */
  public static async analyzeExistingPackages(packageJson: any): Promise<{
    issues: string[];
    recommendations: PackageSuggestion[];
  }> {
    const issues: string[] = [];
    const recommendations: PackageSuggestion[] = [];

    try {
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [packageName, currentVersion] of Object.entries(
        dependencies
      )) {
        const packageInfo = await NpmService.getPackageInfo(packageName);
        if (!packageInfo) {
          continue;
        }

        const latestVersion = packageInfo["dist-tags"].latest;
        if (!latestVersion) {
          continue;
        }

        // Check if current version is outdated
        const cleanCurrentVersion = semver.coerce(currentVersion as string);
        if (
          cleanCurrentVersion &&
          semver.lt(cleanCurrentVersion, latestVersion)
        ) {
          const majorDiff =
            semver.major(latestVersion) - semver.major(cleanCurrentVersion);

          if (majorDiff > 0) {
            issues.push(
              `${packageName} is ${majorDiff} major version(s) behind (current: ${cleanCurrentVersion}, latest: ${latestVersion})`
            );

            recommendations.push({
              packageName,
              suggestedVersion: latestVersion,
              reason: `Update from ${cleanCurrentVersion} to latest version`,
              peerDependencies:
                packageInfo.versions[latestVersion]?.peerDependencies || {},
            });
          }
        }
      }
    } catch (error) {
      issues.push(
        `Error analyzing existing packages: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return { issues, recommendations };
  }

  /**
   * Parse comma-separated package list from user input
   */
  public static parsePackageList(input: string): string[] {
    return input
      .split(",")
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg.length > 0)
      .map((pkg) => {
        // Remove version specifiers if present (e.g., "react@18.0.0" -> "react")
        return pkg.split("@")[0];
      });
  }
}
