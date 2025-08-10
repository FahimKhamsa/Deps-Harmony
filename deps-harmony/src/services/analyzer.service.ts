import * as semver from "semver";
import {
  DependencyGraph,
  PackageNode,
  Conflict,
  ConflictType,
  Solution,
} from "../models";
import { NpmService } from "./npm.service";

export class AnalyzerService {
  // Configurable list of singleton packages that should only have one major version
  private static readonly SINGLETON_PACKAGES = [
    "react",
    "vue",
    "angular",
    "@angular/core",
    "jquery",
    "lodash",
    "moment",
    "axios",
  ];

  /**
   * Find all conflicts in the dependency graph
   */
  public static async findConflicts(
    graph: DependencyGraph
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Find peer dependency conflicts
    const peerConflicts = await this.findPeerDependencyConflicts(graph);
    conflicts.push(...peerConflicts);

    // Find duplicate singleton conflicts
    const singletonConflicts = await this.findDuplicateSingletonConflicts(
      graph
    );
    conflicts.push(...singletonConflicts);

    return conflicts;
  }

  /**
   * Find peer dependency conflicts
   */
  private static async findPeerDependencyConflicts(
    graph: DependencyGraph
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    for (const [path, node] of graph.allNodes) {
      // Skip root node
      if (path === "") {
        continue;
      }

      // Check each peer dependency
      for (const [peerName, peerVersionRange] of Object.entries(
        node.peerDependencies
      )) {
        const installedPeerNode = this.findInstalledPeerDependency(
          graph,
          peerName
        );

        if (!installedPeerNode) {
          // Peer dependency is missing entirely
          const conflict: Conflict = {
            type: ConflictType.PeerDependency,
            packageName: peerName,
            message: `${node.name}@${node.version} requires peer dependency ${peerName}@${peerVersionRange}, but it is not installed.`,
            nodes: [node],
            solutions: await this.generateMissingPeerSolutions(
              peerName,
              peerVersionRange
            ),
          };
          conflicts.push(conflict);
        } else {
          // Check if installed version satisfies the peer dependency requirement
          if (!semver.satisfies(installedPeerNode.version, peerVersionRange)) {
            const conflict: Conflict = {
              type: ConflictType.PeerDependency,
              packageName: peerName,
              message: `${node.name}@${node.version} requires peer dependency ${peerName}@${peerVersionRange}, but ${peerName}@${installedPeerNode.version} is installed.`,
              nodes: [node, installedPeerNode],
              solutions: await this.generatePeerVersionConflictSolutions(
                peerName,
                peerVersionRange,
                installedPeerNode.version
              ),
            };
            conflicts.push(conflict);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find duplicate singleton package conflicts
   */
  private static async findDuplicateSingletonConflicts(
    graph: DependencyGraph
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    for (const singletonPackage of this.SINGLETON_PACKAGES) {
      const installedVersions = this.findAllVersionsOfPackage(
        graph,
        singletonPackage
      );

      if (installedVersions.length > 1) {
        // Check if multiple major versions exist
        const majorVersions = new Set(
          installedVersions.map((node) => semver.major(node.version))
        );

        if (majorVersions.size > 1) {
          const conflict: Conflict = {
            type: ConflictType.DuplicateSingleton,
            packageName: singletonPackage,
            message: `Multiple incompatible versions of ${singletonPackage} detected: ${installedVersions
              .map((n) => `${n.version} (${n.path})`)
              .join(", ")}. This may cause runtime issues.`,
            nodes: installedVersions,
            solutions: await this.generateSingletonConflictSolutions(
              singletonPackage,
              installedVersions
            ),
          };
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Find the installed peer dependency in the graph
   */
  private static findInstalledPeerDependency(
    graph: DependencyGraph,
    peerName: string
  ): PackageNode | null {
    // Look for the peer dependency at the root level first
    const rootLevelPath = `node_modules/${peerName}`;
    const rootLevelNode = graph.allNodes.get(rootLevelPath);
    if (rootLevelNode) {
      return rootLevelNode;
    }

    // If not found at root, look for any installation of this package
    for (const [path, node] of graph.allNodes) {
      if (node.name === peerName) {
        return node;
      }
    }

    return null;
  }

  /**
   * Find all versions of a specific package in the graph
   */
  private static findAllVersionsOfPackage(
    graph: DependencyGraph,
    packageName: string
  ): PackageNode[] {
    const versions: PackageNode[] = [];

    for (const [path, node] of graph.allNodes) {
      if (node.name === packageName) {
        versions.push(node);
      }
    }

    return versions;
  }

  /**
   * Generate solutions for missing peer dependencies
   */
  private static async generateMissingPeerSolutions(
    peerName: string,
    peerVersionRange: string
  ): Promise<Solution[]> {
    const solutions: Solution[] = [];

    try {
      const availableVersions = await NpmService.getAvailableVersions(peerName);
      const compatibleVersions = availableVersions.filter((version) =>
        semver.satisfies(version, peerVersionRange)
      );

      if (compatibleVersions.length > 0) {
        const latestCompatible = compatibleVersions[0]; // Already sorted newest first
        solutions.push({
          description: `Install ${peerName}@${latestCompatible} (latest compatible version)`,
          action: async () => {
            console.log(
              `Would install: npm install ${peerName}@${latestCompatible}`
            );
            // TODO: Implement actual npm install logic
          },
        });
      }

      // Fallback: suggest installing the latest version
      const latestVersion = await NpmService.getLatestVersion(peerName);
      if (latestVersion && !compatibleVersions.includes(latestVersion)) {
        solutions.push({
          description: `Install ${peerName}@${latestVersion} (latest version - may require updating dependent packages)`,
          action: async () => {
            console.log(
              `Would install: npm install ${peerName}@${latestVersion}`
            );
            // TODO: Implement actual npm install logic
          },
        });
      }
    } catch (error) {
      console.error(`Failed to generate solutions for ${peerName}:`, error);
    }

    return solutions;
  }

  /**
   * Generate solutions for peer dependency version conflicts
   */
  private static async generatePeerVersionConflictSolutions(
    peerName: string,
    requiredRange: string,
    installedVersion: string
  ): Promise<Solution[]> {
    const solutions: Solution[] = [];

    try {
      const availableVersions = await NpmService.getAvailableVersions(peerName);
      const compatibleVersions = availableVersions.filter((version) =>
        semver.satisfies(version, requiredRange)
      );

      if (compatibleVersions.length > 0) {
        const latestCompatible = compatibleVersions[0];

        if (semver.gt(latestCompatible, installedVersion)) {
          solutions.push({
            description: `Upgrade ${peerName} from ${installedVersion} to ${latestCompatible}`,
            action: async () => {
              console.log(
                `Would upgrade: npm install ${peerName}@${latestCompatible}`
              );
              // TODO: Implement actual npm install logic
            },
          });
        } else if (semver.lt(latestCompatible, installedVersion)) {
          solutions.push({
            description: `Downgrade ${peerName} from ${installedVersion} to ${latestCompatible}`,
            action: async () => {
              console.log(
                `Would downgrade: npm install ${peerName}@${latestCompatible}`
              );
              // TODO: Implement actual npm install logic
            },
          });
        }
      }
    } catch (error) {
      console.error(`Failed to generate solutions for ${peerName}:`, error);
    }

    return solutions;
  }

  /**
   * Generate solutions for singleton package conflicts
   */
  private static async generateSingletonConflictSolutions(
    packageName: string,
    conflictingNodes: PackageNode[]
  ): Promise<Solution[]> {
    const solutions: Solution[] = [];

    // Find the most recent version
    const sortedNodes = conflictingNodes.sort((a, b) =>
      semver.compare(b.version, a.version)
    );
    const latestVersion = sortedNodes[0];

    solutions.push({
      description: `Consolidate to ${packageName}@${latestVersion.version} (remove duplicates)`,
      action: async () => {
        console.log(
          `Would consolidate ${packageName} to version ${latestVersion.version}`
        );
        // TODO: Implement logic to remove duplicate versions
      },
    });

    // Suggest upgrading to the latest available version
    try {
      const latestAvailable = await NpmService.getLatestVersion(packageName);
      if (
        latestAvailable &&
        semver.gt(latestAvailable, latestVersion.version)
      ) {
        solutions.push({
          description: `Upgrade all instances to ${packageName}@${latestAvailable} (latest available)`,
          action: async () => {
            console.log(
              `Would upgrade all to: npm install ${packageName}@${latestAvailable}`
            );
            // TODO: Implement actual upgrade logic
          },
        });
      }
    } catch (error) {
      console.error(`Failed to get latest version for ${packageName}:`, error);
    }

    return solutions;
  }
}
