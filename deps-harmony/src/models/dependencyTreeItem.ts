import * as vscode from "vscode";
import { PackageNode, Conflict } from "../models";

export class DependencyTreeItem extends vscode.TreeItem {
  public readonly packageNode: PackageNode;
  public readonly conflicts: Conflict[];

  constructor(
    packageNode: PackageNode,
    conflicts: Conflict[] = [],
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.Collapsed
  ) {
    super(packageNode.name, collapsibleState);

    this.packageNode = packageNode;
    this.conflicts = conflicts;

    // Set the label with version
    this.label = `${packageNode.name}@${packageNode.version}`;

    // Set description (additional info shown in gray)
    if (packageNode.isDev) {
      this.description = "(dev)";
    }

    // Set tooltip with detailed information
    this.tooltip = this.buildTooltip();

    // Set context value for right-click menus
    this.contextValue = this.getContextValue();

    // Set icon and color based on conflicts
    this.setIconAndColor();

    // Set collapsible state based on children
    if (packageNode.children.length === 0) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  private buildTooltip(): string {
    const lines = [
      `Package: ${this.packageNode.name}`,
      `Version: ${this.packageNode.version}`,
      `Path: ${this.packageNode.path || "root"}`,
    ];

    if (this.packageNode.isDev) {
      lines.push("Type: Development dependency");
    }

    if (this.packageNode.resolved) {
      lines.push(`Resolved: ${this.packageNode.resolved}`);
    }

    if (Object.keys(this.packageNode.dependencies).length > 0) {
      lines.push(
        `Dependencies: ${Object.keys(this.packageNode.dependencies).length}`
      );
    }

    if (Object.keys(this.packageNode.peerDependencies).length > 0) {
      lines.push(
        `Peer Dependencies: ${
          Object.keys(this.packageNode.peerDependencies).length
        }`
      );
    }

    if (this.conflicts.length > 0) {
      lines.push("", "⚠️ CONFLICTS:");
      this.conflicts.forEach((conflict) => {
        lines.push(`• ${conflict.type}: ${conflict.message}`);
      });
    }

    return lines.join("\n");
  }

  private getContextValue(): string {
    if (this.conflicts.length > 0) {
      return "dependency-conflict";
    }

    if (this.packageNode.path === "") {
      return "dependency-root";
    }

    if (this.packageNode.isDev) {
      return "dependency-dev";
    }

    return "dependency-normal";
  }

  private setIconAndColor(): void {
    if (this.conflicts.length > 0) {
      // Red color for conflicting packages
      this.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("errorForeground")
      );
    } else if (this.packageNode.path === "") {
      // Root package icon
      this.iconPath = new vscode.ThemeIcon("package");
    } else if (this.packageNode.isDev) {
      // Dev dependency icon
      this.iconPath = new vscode.ThemeIcon(
        "tools",
        new vscode.ThemeColor("testing.iconUnset")
      );
    } else {
      // Normal dependency icon
      this.iconPath = new vscode.ThemeIcon("symbol-package");
    }
  }

  /**
   * Check if this item has conflicts
   */
  public get hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  /**
   * Get conflict count
   */
  public get conflictCount(): number {
    return this.conflicts.length;
  }
}
