import * as vscode from "vscode";
import { Conflict, ConflictType } from "../models";

export class ConflictTreeItem extends vscode.TreeItem {
  public readonly conflict: Conflict;

  constructor(
    conflict: Conflict,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.Collapsed
  ) {
    super(conflict.packageName, collapsibleState);

    this.conflict = conflict;

    // Set the label with conflict type
    this.label = `${conflict.packageName} (${conflict.type})`;

    // Set description with brief message
    this.description = this.getShortMessage();

    // Set tooltip with full details
    this.tooltip = this.buildTooltip();

    // Set context value for right-click menus
    this.contextValue = "conflict-item";

    // Set icon and color based on conflict type
    this.setIconAndColor();

    // Set collapsible state based on solutions
    if (conflict.solutions.length === 0) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  private getShortMessage(): string {
    // Truncate long messages for the description
    const maxLength = 50;
    if (this.conflict.message.length <= maxLength) {
      return this.conflict.message;
    }
    return this.conflict.message.substring(0, maxLength) + "...";
  }

  private buildTooltip(): string {
    const lines = [
      `Conflict Type: ${this.conflict.type}`,
      `Package: ${this.conflict.packageName}`,
      "",
      `Problem: ${this.conflict.message}`,
      "",
      `Affected Packages:`,
    ];

    this.conflict.nodes.forEach((node) => {
      lines.push(`• ${node.name}@${node.version} (${node.path || "root"})`);
    });

    if (this.conflict.solutions.length > 0) {
      lines.push("", `Available Solutions: ${this.conflict.solutions.length}`);
      this.conflict.solutions.forEach((solution, index) => {
        lines.push(`${index + 1}. ${solution.description}`);
      });
    } else {
      lines.push("", "No automated solutions available");
    }

    return lines.join("\n");
  }

  private setIconAndColor(): void {
    switch (this.conflict.type) {
      case ConflictType.PeerDependency:
        this.iconPath = new vscode.ThemeIcon(
          "link-external",
          new vscode.ThemeColor("errorForeground")
        );
        break;
      case ConflictType.DuplicateSingleton:
        this.iconPath = new vscode.ThemeIcon(
          "copy",
          new vscode.ThemeColor("warningForeground")
        );
        break;
      default:
        this.iconPath = new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("errorForeground")
        );
    }
  }

  /**
   * Get the number of solutions available
   */
  public get solutionCount(): number {
    return this.conflict.solutions.length;
  }

  /**
   * Check if this conflict has solutions
   */
  public get hasSolutions(): boolean {
    return this.conflict.solutions.length > 0;
  }
}
