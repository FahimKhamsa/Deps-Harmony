import * as vscode from "vscode";
import { Solution, Conflict } from "../models";

export class SolutionTreeItem extends vscode.TreeItem {
  public readonly solution: Solution;
  public readonly conflict: Conflict;

  constructor(
    solution: Solution,
    conflict: Conflict,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    super(solution.description, collapsibleState);

    this.solution = solution;
    this.conflict = conflict;

    // Set the label as the solution description
    this.label = solution.description;

    // Set description with conflict package name
    this.description = `for ${conflict.packageName}`;

    // Set tooltip with detailed information
    this.tooltip = this.buildTooltip();

    // Set context value for right-click menus
    this.contextValue = "solution-item";

    // Set icon
    this.iconPath = new vscode.ThemeIcon(
      "lightbulb",
      new vscode.ThemeColor("charts.green")
    );

    // Make it a command that can be clicked to execute
    this.command = {
      command: "deps-harmony.applySolution",
      title: "Apply Solution",
      arguments: [this],
    };
  }

  private buildTooltip(): string {
    const lines = [
      `Solution: ${this.solution.description}`,
      "",
      `For Conflict: ${this.conflict.type}`,
      `Package: ${this.conflict.packageName}`,
      "",
      `Problem: ${this.conflict.message}`,
      "",
      "Click to execute this solution",
    ];

    return lines.join("\n");
  }

  /**
   * Execute the solution
   */
  public async execute(): Promise<void> {
    try {
      await this.solution.action();
    } catch (error) {
      throw new Error(`Failed to execute solution: ${error}`);
    }
  }

  /**
   * Get the conflict type this solution addresses
   */
  public get conflictType(): string {
    return this.conflict.type;
  }

  /**
   * Get the package name this solution is for
   */
  public get packageName(): string {
    return this.conflict.packageName;
  }
}
