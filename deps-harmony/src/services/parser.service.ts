import * as vscode from "vscode";
import * as path from "path";

export interface ParsedProjectFiles {
  packageJson: any;
  packageLockJson: any;
  projectRoot: string;
}

export class ParserService {
  /**
   * Find the project root using VSCode workspace folders
   */
  public static findProjectRoot(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // Return the first workspace folder as the project root
    return workspaceFolders[0].uri.fsPath;
  }

  /**
   * Parse package.json and package-lock.json files from the project root
   */
  public static async parseProjectFiles(): Promise<ParsedProjectFiles | null> {
    const projectRoot = this.findProjectRoot();
    if (!projectRoot) {
      vscode.window.showErrorMessage(
        "No workspace folder found. Please open a project folder."
      );
      return null;
    }

    try {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageLockPath = path.join(projectRoot, "package-lock.json");

      // Read package.json
      let packageJson: any = null;
      try {
        const packageJsonUri = vscode.Uri.file(packageJsonPath);
        const packageJsonContent = await vscode.workspace.fs.readFile(
          packageJsonUri
        );
        packageJson = JSON.parse(
          Buffer.from(packageJsonContent).toString("utf8")
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to read or parse package.json: ${error}`
        );
        return null;
      }

      // Read package-lock.json
      let packageLockJson: any = null;
      try {
        const packageLockUri = vscode.Uri.file(packageLockPath);
        const packageLockContent = await vscode.workspace.fs.readFile(
          packageLockUri
        );
        packageLockJson = JSON.parse(
          Buffer.from(packageLockContent).toString("utf8")
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to read or parse package-lock.json: ${error}`
        );
        return null;
      }

      return {
        packageJson,
        packageLockJson,
        projectRoot,
      };
    } catch (error) {
      vscode.window.showErrorMessage(`Error parsing project files: ${error}`);
      return null;
    }
  }
}
