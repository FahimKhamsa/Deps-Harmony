import * as vscode from "vscode";
import { Conflict } from "../models";
import { ConflictTreeItem } from "../models/conflictTreeItem";
import { SolutionTreeItem } from "../models/solutionTreeItem";

export class ConflictsListDataProvider
  implements vscode.TreeDataProvider<ConflictTreeItem | SolutionTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ConflictTreeItem | SolutionTreeItem | undefined | null | void
  > = new vscode.EventEmitter<
    ConflictTreeItem | SolutionTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    ConflictTreeItem | SolutionTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private conflicts: Conflict[] = [];

  constructor() {}

  /**
   * Update the conflicts list
   */
  public updateConflicts(conflicts: Conflict[]): void {
    this.conflicts = conflicts;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear the conflicts list
   */
  public clearConflicts(): void {
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
  getTreeItem(element: ConflictTreeItem | SolutionTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item
   */
  getChildren(
    element?: ConflictTreeItem | SolutionTreeItem
  ): Thenable<(ConflictTreeItem | SolutionTreeItem)[]> {
    if (!element) {
      // Return root level conflicts
      const conflictItems = this.conflicts.map((conflict) => {
        return new ConflictTreeItem(
          conflict,
          conflict.solutions.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
      });

      // Sort conflicts by type and then by package name
      conflictItems.sort((a, b) => {
        if (a.conflict.type !== b.conflict.type) {
          return a.conflict.type.localeCompare(b.conflict.type);
        }
        return a.conflict.packageName.localeCompare(b.conflict.packageName);
      });

      return Promise.resolve(conflictItems);
    }

    if (element instanceof ConflictTreeItem) {
      // Return solutions for this conflict
      const solutionItems = element.conflict.solutions.map((solution) => {
        return new SolutionTreeItem(solution, element.conflict);
      });

      return Promise.resolve(solutionItems);
    }

    // SolutionTreeItem has no children
    return Promise.resolve([]);
  }

  /**
   * Get parent of a tree item
   */
  getParent(
    element: ConflictTreeItem | SolutionTreeItem
  ): vscode.ProviderResult<ConflictTreeItem | SolutionTreeItem> {
    if (element instanceof SolutionTreeItem) {
      // Find the parent conflict
      const parentConflict = this.conflicts.find(
        (conflict) => conflict === element.conflict
      );
      if (parentConflict) {
        return new ConflictTreeItem(parentConflict);
      }
    }

    // ConflictTreeItem has no parent (it's at root level)
    return null;
  }

  /**
   * Get statistics about the conflicts
   */
  public getConflictStats(): {
    totalConflicts: number;
    conflictsWithSolutions: number;
    totalSolutions: number;
  } {
    const totalConflicts = this.conflicts.length;
    const conflictsWithSolutions = this.conflicts.filter(
      (conflict) => conflict.solutions.length > 0
    ).length;
    const totalSolutions = this.conflicts.reduce(
      (sum, conflict) => sum + conflict.solutions.length,
      0
    );

    return {
      totalConflicts,
      conflictsWithSolutions,
      totalSolutions,
    };
  }

  /**
   * Get conflicts by type
   */
  public getConflictsByType(): Map<string, Conflict[]> {
    const conflictsByType = new Map<string, Conflict[]>();

    this.conflicts.forEach((conflict) => {
      const type = conflict.type;
      if (!conflictsByType.has(type)) {
        conflictsByType.set(type, []);
      }
      conflictsByType.get(type)!.push(conflict);
    });

    return conflictsByType;
  }

  /**
   * Find conflict by package name
   */
  public findConflictByPackage(packageName: string): Conflict | null {
    return (
      this.conflicts.find((conflict) => conflict.packageName === packageName) ||
      null
    );
  }
}
