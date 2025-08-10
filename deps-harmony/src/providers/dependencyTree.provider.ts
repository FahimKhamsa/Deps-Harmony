import * as vscode from "vscode";
import { DependencyGraph, PackageNode, Conflict } from "../models";
import { DependencyTreeItem } from "../models/dependencyTreeItem";

export class DependencyTreeDataProvider
  implements vscode.TreeDataProvider<DependencyTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    DependencyTreeItem | undefined | null | void
  > = new vscode.EventEmitter<DependencyTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    DependencyTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private dependencyGraph: DependencyGraph | null = null;
  private conflicts: Conflict[] = [];

  constructor() {}

  /**
   * Update the tree with new dependency graph and conflicts
   */
  public updateTree(graph: DependencyGraph, conflicts: Conflict[]): void {
    this.dependencyGraph = graph;
    this.conflicts = conflicts;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear the tree
   */
  public clearTree(): void {
    this.dependencyGraph = null;
    this.conflicts = [];
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh the tree
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: DependencyTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item
   */
  getChildren(element?: DependencyTreeItem): Thenable<DependencyTreeItem[]> {
    if (!this.dependencyGraph) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Return root node
      const rootConflicts = this.getConflictsForNode(this.dependencyGraph.root);
      const rootItem = new DependencyTreeItem(
        this.dependencyGraph.root,
        rootConflicts,
        vscode.TreeItemCollapsibleState.Expanded
      );
      return Promise.resolve([rootItem]);
    }

    // Return children of the current element
    const children = element.packageNode.children.map((childNode) => {
      const childConflicts = this.getConflictsForNode(childNode);
      return new DependencyTreeItem(
        childNode,
        childConflicts,
        childNode.children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
    });

    // Sort children: conflicted items first, then alphabetically
    children.sort((a, b) => {
      if (a.hasConflicts && !b.hasConflicts) {
        return -1;
      }
      if (!a.hasConflicts && b.hasConflicts) {
        return 1;
      }
      return a.packageNode.name.localeCompare(b.packageNode.name);
    });

    return Promise.resolve(children);
  }

  /**
   * Get conflicts that involve a specific package node
   */
  private getConflictsForNode(node: PackageNode): Conflict[] {
    return this.conflicts.filter((conflict) =>
      conflict.nodes.some((conflictNode) => conflictNode.path === node.path)
    );
  }

  /**
   * Get parent of a tree item (optional method for better navigation)
   */
  getParent(
    element: DependencyTreeItem
  ): vscode.ProviderResult<DependencyTreeItem> {
    if (!this.dependencyGraph || element.packageNode.path === "") {
      return null; // Root has no parent
    }

    // Find parent by looking for a node that has this element as a child
    for (const [path, node] of this.dependencyGraph.allNodes) {
      if (
        node.children.some((child) => child.path === element.packageNode.path)
      ) {
        const parentConflicts = this.getConflictsForNode(node);
        return new DependencyTreeItem(node, parentConflicts);
      }
    }

    return null;
  }

  /**
   * Get statistics about the current tree
   */
  public getTreeStats(): {
    totalNodes: number;
    conflictedNodes: number;
    hasData: boolean;
  } {
    if (!this.dependencyGraph) {
      return {
        totalNodes: 0,
        conflictedNodes: 0,
        hasData: false,
      };
    }

    const conflictedNodePaths = new Set<string>();
    this.conflicts.forEach((conflict) => {
      conflict.nodes.forEach((node) => {
        conflictedNodePaths.add(node.path);
      });
    });

    return {
      totalNodes: this.dependencyGraph.allNodes.size,
      conflictedNodes: conflictedNodePaths.size,
      hasData: true,
    };
  }

  /**
   * Find a tree item by package name
   */
  public findNodeByName(packageName: string): PackageNode | null {
    if (!this.dependencyGraph) {
      return null;
    }

    for (const [path, node] of this.dependencyGraph.allNodes) {
      if (node.name === packageName) {
        return node;
      }
    }

    return null;
  }

  /**
   * Get all conflicted nodes
   */
  public getConflictedNodes(): DependencyTreeItem[] {
    if (!this.dependencyGraph) {
      return [];
    }

    const conflictedItems: DependencyTreeItem[] = [];
    const processedPaths = new Set<string>();

    this.conflicts.forEach((conflict) => {
      conflict.nodes.forEach((node) => {
        if (!processedPaths.has(node.path)) {
          processedPaths.add(node.path);
          const nodeConflicts = this.getConflictsForNode(node);
          conflictedItems.push(new DependencyTreeItem(node, nodeConflicts));
        }
      });
    });

    return conflictedItems;
  }
}
