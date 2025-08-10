export interface PackageNode {
  name: string;
  version: string;
  path: string; // e.g., 'node_modules/express'
  resolved: string; // URL from lockfile
  integrity: string;
  isDev: boolean;
  dependencies: { [name: string]: string }; // name: requiredVersion;
  peerDependencies: { [name: string]: string };
  children: PackageNode[]; // Populated during graph construction
}

export interface DependencyGraph {
  root: PackageNode;
  allNodes: Map<string, PackageNode>; // Map path to node for easy lookup;
}

export enum ConflictType {
  PeerDependency = "PeerDependency",
  DuplicateSingleton = "DuplicateSingleton",
}

export interface Conflict {
  type: ConflictType;
  packageName: string;
  message: string;
  nodes: PackageNode[]; // The nodes involved in the conflict
  solutions: Solution[];
}

export interface Solution {
  description: string;
  action: () => Promise<void>; // The function to execute the fix
}
