import * as vscode from "vscode";
import { Conflict } from "../models";
import { SolutionTreeItem } from "../models/solutionTreeItem";

export class SolutionsListDataProvider
  implements vscode.TreeDataProvider<SolutionTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SolutionTreeItem | undefined | null | void
  > = new vscode.EventEmitter<SolutionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SolutionTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private conflicts: Conflict[] = [];

  constructor() {}

  /**
   * Update the solutions list with conflicts
   */
  public updateSolutions(conflicts: Conflict[]): void {
    this.conflicts = conflicts;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear the solutions list
   */
  public clearSolutions(): void {
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
  getTreeItem(element: SolutionTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item
   */
  getChildren(element?: SolutionTreeItem): Thenable<SolutionTreeItem[]> {
    if (!element) {
      // Return all solutions from all conflicts
      const allSolutions: SolutionTreeItem[] = [];

      this.conflicts.forEach((conflict) => {
        conflict.solutions.forEach((solution) => {
          allSolutions.push(new SolutionTreeItem(solution, conflict));
        });
      });

      // Sort solutions by conflict type, then by package name
      allSolutions.sort((a, b) => {
        if (a.conflictType !== b.conflictType) {
          return a.conflictType.localeCompare(b.conflictType);
        }
        return a.packageName.localeCompare(b.packageName);
      });

      return Promise.resolve(allSolutions);
    }

    // SolutionTreeItem has no children
    return Promise.resolve([]);
  }

  /**
   * Get parent of a tree item
   */
  getParent(
    element: SolutionTreeItem
  ): vscode.ProviderResult<SolutionTreeItem> {
    // Solutions are at root level, no parent
    return null;
  }

  /**
   * Get statistics about the solutions
   */
  public getSolutionStats(): {
    totalSolutions: number;
    solutionsByType: Map<string, number>;
    conflictsWithSolutions: number;
  } {
    const solutionsByType = new Map<string, number>();
    let totalSolutions = 0;
    let conflictsWithSolutions = 0;

    this.conflicts.forEach((conflict) => {
      if (conflict.solutions.length > 0) {
        conflictsWithSolutions++;
        totalSolutions += conflict.solutions.length;

        const currentCount = solutionsByType.get(conflict.type) || 0;
        solutionsByType.set(
          conflict.type,
          currentCount + conflict.solutions.length
        );
      }
    });

    return {
      totalSolutions,
      solutionsByType,
      conflictsWithSolutions,
    };
  }

  /**
   * Get solutions for a specific conflict type
   */
  public getSolutionsByType(conflictType: string): SolutionTreeItem[] {
    const solutions: SolutionTreeItem[] = [];

    this.conflicts
      .filter((conflict) => conflict.type === conflictType)
      .forEach((conflict) => {
        conflict.solutions.forEach((solution) => {
          solutions.push(new SolutionTreeItem(solution, conflict));
        });
      });

    return solutions;
  }

  /**
   * Get solutions for a specific package
   */
  public getSolutionsForPackage(packageName: string): SolutionTreeItem[] {
    const solutions: SolutionTreeItem[] = [];

    this.conflicts
      .filter((conflict) => conflict.packageName === packageName)
      .forEach((conflict) => {
        conflict.solutions.forEach((solution) => {
          solutions.push(new SolutionTreeItem(solution, conflict));
        });
      });

    return solutions;
  }

  /**
   * Check if there are any solutions available
   */
  public hasSolutions(): boolean {
    return this.conflicts.some((conflict) => conflict.solutions.length > 0);
  }

  /**
   * Get all executable solutions
   */
  public getAllSolutions(): SolutionTreeItem[] {
    const allSolutions: SolutionTreeItem[] = [];

    this.conflicts.forEach((conflict) => {
      conflict.solutions.forEach((solution) => {
        allSolutions.push(new SolutionTreeItem(solution, conflict));
      });
    });

    return allSolutions;
  }
}
