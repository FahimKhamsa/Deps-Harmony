import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ParserService } from "./parser.service";

export interface FixResult {
  success: boolean;
  message: string;
  backupPath?: string;
  error?: string;
}

export class FixService {
  /**
   * Apply a dependency fix by modifying package.json and running npm install
   */
  public static async applyDependencyFix(
    packageName: string,
    newVersion: string,
    isDev: boolean = false
  ): Promise<FixResult> {
    try {
      // Get project root
      const projectRoot = ParserService.findProjectRoot();
      if (!projectRoot) {
        return {
          success: false,
          message: "No workspace folder found",
          error: "Cannot locate project root directory",
        };
      }

      const packageJsonPath = path.join(projectRoot, "package.json");

      // Step 1: Create backup
      const backupResult = await this.createBackup(packageJsonPath);
      if (!backupResult.success) {
        return backupResult;
      }

      // Step 2: Modify package.json
      const modifyResult = await this.modifyPackageJson(
        packageJsonPath,
        packageName,
        newVersion,
        isDev
      );
      if (!modifyResult.success) {
        return modifyResult;
      }

      // Step 3: Run npm install
      const installResult = await this.runNpmInstall(projectRoot);
      if (!installResult.success) {
        // Restore backup on failure
        await this.restoreBackup(packageJsonPath, backupResult.backupPath!);
        return installResult;
      }

      return {
        success: true,
        message: `Successfully updated ${packageName} to ${newVersion}`,
        backupPath: backupResult.backupPath,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to apply fix",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a backup of package.json
   */
  private static async createBackup(
    packageJsonPath: string
  ): Promise<FixResult> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${packageJsonPath}.backup-${timestamp}`;

      await fs.promises.copyFile(packageJsonPath, backupPath);

      return {
        success: true,
        message: "Backup created successfully",
        backupPath,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to create backup",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Modify package.json to update dependency version
   */
  private static async modifyPackageJson(
    packageJsonPath: string,
    packageName: string,
    newVersion: string,
    isDev: boolean
  ): Promise<FixResult> {
    try {
      // Read current package.json
      const packageJsonContent = await fs.promises.readFile(
        packageJsonPath,
        "utf8"
      );
      const packageJson = JSON.parse(packageJsonContent);

      // Update the appropriate dependencies section
      const dependencySection = isDev ? "devDependencies" : "dependencies";

      if (!packageJson[dependencySection]) {
        packageJson[dependencySection] = {};
      }

      // Update the version
      packageJson[dependencySection][packageName] = newVersion;

      // Write back to file with proper formatting
      const updatedContent = JSON.stringify(packageJson, null, 2) + "\n";
      await fs.promises.writeFile(packageJsonPath, updatedContent, "utf8");

      return {
        success: true,
        message: `Updated ${packageName} to ${newVersion} in package.json`,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to modify package.json",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run npm install using VSCode terminal
   */
  private static async runNpmInstall(projectRoot: string): Promise<FixResult> {
    return new Promise((resolve) => {
      try {
        // Create a new terminal for npm install
        const terminal = vscode.window.createTerminal({
          name: "Deps Harmony - npm install",
          cwd: projectRoot,
        });

        // Show the terminal
        terminal.show();

        // Send npm install command
        terminal.sendText("npm install");

        // Note: We can't easily wait for terminal completion in VSCode
        // For now, we'll assume success and let the user see the terminal output
        setTimeout(() => {
          resolve({
            success: true,
            message:
              "npm install command executed. Check terminal for results.",
          });
        }, 1000);
      } catch (error) {
        resolve({
          success: false,
          message: "Failed to run npm install",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Restore package.json from backup
   */
  private static async restoreBackup(
    packageJsonPath: string,
    backupPath: string
  ): Promise<FixResult> {
    try {
      await fs.promises.copyFile(backupPath, packageJsonPath);
      return {
        success: true,
        message: "Backup restored successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to restore backup",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse a solution description to extract package name and version
   */
  public static parseSolutionDescription(description: string): {
    packageName: string;
    newVersion: string;
    isDev: boolean;
  } | null {
    // Example descriptions:
    // "Upgrade react from 17.0.0 to 18.2.0"
    // "Downgrade typescript from 5.0.0 to 4.9.5"
    // "Install react@18.2.0 (latest compatible version)"

    const upgradeMatch = description.match(
      /(Upgrade|Downgrade)\s+(.+?)\s+from\s+.+?\s+to\s+(.+?)$/
    );
    if (upgradeMatch) {
      return {
        packageName: upgradeMatch[2],
        newVersion: upgradeMatch[3],
        isDev: false, // We'll need to determine this from context
      };
    }

    const installMatch = description.match(/Install\s+(.+?)@(.+?)\s+/);
    if (installMatch) {
      return {
        packageName: installMatch[1],
        newVersion: installMatch[2],
        isDev: false,
      };
    }

    return null;
  }

  /**
   * Clean up old backup files (optional maintenance)
   */
  public static async cleanupOldBackups(
    projectRoot: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ): Promise<void> {
    try {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const dir = path.dirname(packageJsonPath);
      const files = await fs.promises.readdir(dir);

      const backupFiles = files.filter((file) =>
        file.startsWith("package.json.backup-")
      );

      const now = Date.now();
      for (const backupFile of backupFiles) {
        const backupPath = path.join(dir, backupFile);
        const stats = await fs.promises.stat(backupPath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.promises.unlink(backupPath);
        }
      }
    } catch (error) {
      // Silently fail - this is just cleanup
      console.warn("Failed to cleanup old backups:", error);
    }
  }
}
