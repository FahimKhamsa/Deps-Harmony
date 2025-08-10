import * as vscode from "vscode";
import { Conflict } from "../models";

export class DecorationService {
  private static conflictDecorationType: vscode.TextEditorDecorationType;
  private static warningDecorationType: vscode.TextEditorDecorationType;

  /**
   * Initialize decoration types
   */
  public static initialize(): void {
    // Decoration for conflicting dependencies (red)
    this.conflictDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("errorBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("errorForeground"),
      overviewRulerColor: new vscode.ThemeColor("errorForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
    });

    // Decoration for potential issues (yellow)
    this.warningDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("warningBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("warningForeground"),
      overviewRulerColor: new vscode.ThemeColor("warningForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: false,
    });
  }

  /**
   * Apply decorations to package.json files based on conflicts
   */
  public static applyDecorations(conflicts: Conflict[]): void {
    const config = vscode.workspace.getConfiguration("deps-harmony");
    if (!config.get("highlightConflicts", true)) {
      return;
    }

    // Get all visible text editors
    const editors = vscode.window.visibleTextEditors;

    for (const editor of editors) {
      if (this.isPackageJsonFile(editor.document)) {
        this.decoratePackageJson(editor, conflicts);
      }
    }
  }

  /**
   * Clear all decorations
   */
  public static clearDecorations(): void {
    const editors = vscode.window.visibleTextEditors;

    for (const editor of editors) {
      if (this.isPackageJsonFile(editor.document)) {
        editor.setDecorations(this.conflictDecorationType, []);
        editor.setDecorations(this.warningDecorationType, []);
      }
    }
  }

  /**
   * Check if the document is a package.json file
   */
  private static isPackageJsonFile(document: vscode.TextDocument): boolean {
    return document.fileName.endsWith("package.json");
  }

  /**
   * Decorate a package.json file with conflict highlights
   */
  private static decoratePackageJson(
    editor: vscode.TextEditor,
    conflicts: Conflict[]
  ): void {
    const document = editor.document;
    const text = document.getText();
    const conflictDecorations: vscode.DecorationOptions[] = [];
    const warningDecorations: vscode.DecorationOptions[] = [];

    // Extract package names from conflicts
    const conflictPackages = new Set(conflicts.map((c) => c.packageName));

    try {
      // Parse the package.json to find dependency sections
      const packageJson = JSON.parse(text);
      const dependencySections = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ];

      for (const section of dependencySections) {
        if (packageJson[section]) {
          const sectionStart = this.findSectionStart(text, section);
          if (sectionStart === -1) {
            continue;
          }

          // Find each dependency line within this section
          for (const [packageName, version] of Object.entries(
            packageJson[section]
          )) {
            const lineInfo = this.findDependencyLine(
              text,
              packageName,
              version as string,
              sectionStart
            );

            if (lineInfo) {
              const range = new vscode.Range(
                lineInfo.line,
                lineInfo.startChar,
                lineInfo.line,
                lineInfo.endChar
              );

              const isConflicted = conflictPackages.has(packageName);
              const conflict = conflicts.find(
                (c) => c.packageName === packageName
              );

              const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage:
                  isConflicted && conflict
                    ? new vscode.MarkdownString(
                        `**Dependency Conflict**\n\n${
                          conflict.message
                        }\n\n**Solutions:**\n${conflict.solutions
                          .map((s, i) => `${i + 1}. ${s.description}`)
                          .join("\n")}`
                      )
                    : new vscode.MarkdownString(
                        `**${packageName}**: ${version}`
                      ),
              };

              if (isConflicted) {
                conflictDecorations.push(decoration);
              } else {
                // Check for potential issues (outdated versions, etc.)
                if (this.isPotentialIssue(version as string)) {
                  warningDecorations.push(decoration);
                }
              }
            }
          }
        }
      }

      // Apply decorations
      editor.setDecorations(this.conflictDecorationType, conflictDecorations);
      editor.setDecorations(this.warningDecorationType, warningDecorations);
    } catch (error) {
      console.error("Error decorating package.json:", error);
    }
  }

  /**
   * Find the start position of a dependency section
   */
  private static findSectionStart(text: string, sectionName: string): number {
    const regex = new RegExp(`"${sectionName}"\\s*:\\s*{`, "g");
    const match = regex.exec(text);
    return match ? match.index : -1;
  }

  /**
   * Find the line and character positions for a specific dependency
   */
  private static findDependencyLine(
    text: string,
    packageName: string,
    version: string,
    sectionStart: number
  ): { line: number; startChar: number; endChar: number } | null {
    // Look for the dependency line after the section start
    const searchText = text.substring(sectionStart);
    const regex = new RegExp(
      `"${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"[^"]*"`,
      "g"
    );
    const match = regex.exec(searchText);

    if (!match) {
      return null;
    }

    const absolutePosition = sectionStart + match.index;
    const lines = text.substring(0, absolutePosition).split("\n");
    const line = lines.length - 1;
    const startChar = lines[line].length;
    const endChar = startChar + match[0].length;

    return { line, startChar, endChar };
  }

  /**
   * Check if a version string indicates a potential issue
   */
  private static isPotentialIssue(version: string): boolean {
    // Check for very old version patterns or wildcards
    return (
      version.includes("*") ||
      version.includes("x") ||
      version.startsWith("~0.") ||
      version.startsWith("^0.0.")
    );
  }

  /**
   * Dispose of decoration types
   */
  public static dispose(): void {
    if (this.conflictDecorationType) {
      this.conflictDecorationType.dispose();
    }
    if (this.warningDecorationType) {
      this.warningDecorationType.dispose();
    }
  }

  /**
   * Update decorations when the active editor changes
   */
  public static onActiveEditorChanged(
    editor: vscode.TextEditor | undefined,
    conflicts: Conflict[]
  ): void {
    if (editor && this.isPackageJsonFile(editor.document)) {
      this.decoratePackageJson(editor, conflicts);
    }
  }

  /**
   * Update decorations when document content changes
   */
  public static onDocumentChanged(
    document: vscode.TextDocument,
    conflicts: Conflict[]
  ): void {
    if (this.isPackageJsonFile(document)) {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === document
      );
      if (editor) {
        this.decoratePackageJson(editor, conflicts);
      }
    }
  }
}
