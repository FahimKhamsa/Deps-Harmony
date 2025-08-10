import { PackageNode, DependencyGraph } from "../models";

export class GraphService {
  /**
   * Build a dependency graph from the parsed package-lock.json
   */
  public static buildGraph(
    packageJson: any,
    packageLockJson: any
  ): DependencyGraph {
    const allNodes = new Map<string, PackageNode>();

    // Handle different lockfile versions
    const packages = packageLockJson.packages || {};
    const lockfileVersion = packageLockJson.lockfileVersion || 1;

    if (lockfileVersion < 2) {
      throw new Error(
        "Lockfile version 1 is not supported. Please upgrade to npm 7+ to generate a v2/v3 lockfile."
      );
    }

    // First pass: Create all PackageNode instances
    for (const [packagePath, packageData] of Object.entries(packages)) {
      const typedPackageData = packageData as any;

      // Handle root package (empty string key)
      if (packagePath === "") {
        const rootNode: PackageNode = {
          name: packageJson.name || "root",
          version: packageJson.version || "0.0.0",
          path: "",
          resolved: typedPackageData.resolved || "",
          integrity: typedPackageData.integrity || "",
          isDev: false, // Root is never a dev dependency
          dependencies: typedPackageData.dependencies || {},
          peerDependencies: typedPackageData.peerDependencies || {},
          children: [],
        };
        allNodes.set(packagePath, rootNode);
        continue;
      }

      // Extract package name from path
      const pathParts = packagePath.split("/");
      const packageName = pathParts[pathParts.length - 1];

      // Determine if this is a dev dependency
      const isDev = this.isDevDependency(packageName, packageJson, packagePath);

      const node: PackageNode = {
        name: packageName,
        version: typedPackageData.version || "unknown",
        path: packagePath,
        resolved: typedPackageData.resolved || "",
        integrity: typedPackageData.integrity || "",
        isDev,
        dependencies: typedPackageData.dependencies || {},
        peerDependencies: typedPackageData.peerDependencies || {},
        children: [],
      };

      allNodes.set(packagePath, node);
    }

    // Second pass: Build parent-child relationships
    for (const [packagePath, node] of allNodes) {
      // For each dependency of this node, find the corresponding child node
      for (const depName of Object.keys(node.dependencies)) {
        const childNode = this.findChildNode(packagePath, depName, allNodes);
        if (childNode) {
          node.children.push(childNode);
        }
      }
    }

    // Get the root node
    const rootNode = allNodes.get("");
    if (!rootNode) {
      throw new Error("Root package not found in lockfile");
    }

    return {
      root: rootNode,
      allNodes,
    };
  }

  /**
   * Determine if a package is a dev dependency
   */
  private static isDevDependency(
    packageName: string,
    packageJson: any,
    packagePath: string
  ): boolean {
    // If it's a direct dependency, check if it's in devDependencies
    if (packagePath.split("/").length === 2) {
      // Direct dependency (node_modules/package-name)
      return !!(
        packageJson.devDependencies && packageJson.devDependencies[packageName]
      );
    }

    // For nested dependencies, they inherit the dev status from their parent
    // This is a simplified approach - in reality, it's more complex
    return false;
  }

  /**
   * Find the child node for a given dependency
   */
  private static findChildNode(
    parentPath: string,
    depName: string,
    allNodes: Map<string, PackageNode>
  ): PackageNode | null {
    // Construct the expected path for the child dependency
    let expectedPath: string;

    if (parentPath === "") {
      // Root package
      expectedPath = `node_modules/${depName}`;
    } else {
      // Nested dependency
      expectedPath = `${parentPath}/node_modules/${depName}`;
    }

    // First, try the direct path
    let childNode = allNodes.get(expectedPath);
    if (childNode) {
      return childNode;
    }

    // If not found, look for hoisted dependencies
    // npm hoists dependencies to the highest possible level
    const pathParts = parentPath.split("/");

    // Try each level up the tree
    for (let i = pathParts.length - 2; i >= 0; i -= 2) {
      const hoistedPath =
        pathParts.slice(0, i + 1).join("/") + `/node_modules/${depName}`;
      childNode = allNodes.get(hoistedPath);
      if (childNode) {
        return childNode;
      }
    }

    // Finally, try the root level
    childNode = allNodes.get(`node_modules/${depName}`);
    if (childNode) {
      return childNode;
    }

    // If still not found, the dependency might not be installed
    console.warn(`Dependency ${depName} not found for parent ${parentPath}`);
    return null;
  }

  /**
   * Get statistics about the dependency graph
   */
  public static getGraphStats(graph: DependencyGraph): {
    totalNodes: number;
    directDependencies: number;
    devDependencies: number;
    maxDepth: number;
  } {
    const totalNodes = graph.allNodes.size;
    let directDependencies = 0;
    let devDependencies = 0;

    // Count direct dependencies and dev dependencies
    for (const [path, node] of graph.allNodes) {
      if (path !== "" && path.split("/").length === 2) {
        // Direct dependency
        directDependencies++;
        if (node.isDev) {
          devDependencies++;
        }
      }
    }

    // Calculate max depth
    const maxDepth = this.calculateMaxDepth(graph.root);

    return {
      totalNodes,
      directDependencies,
      devDependencies,
      maxDepth,
    };
  }

  /**
   * Calculate the maximum depth of the dependency tree
   */
  private static calculateMaxDepth(
    node: PackageNode,
    currentDepth = 0
  ): number {
    if (node.children.length === 0) {
      return currentDepth;
    }

    let maxChildDepth = currentDepth;
    for (const child of node.children) {
      const childDepth = this.calculateMaxDepth(child, currentDepth + 1);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    return maxChildDepth;
  }
}
