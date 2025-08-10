// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ParserService } from "./services/parser.service";
import { GraphService } from "./services/graph.service";
import { AnalyzerService } from "./services/analyzer.service";
import { DependencyTreeDataProvider } from "./providers/dependencyTree.provider";
import { ConflictsListDataProvider } from "./providers/conflictsList.provider";
import { SolutionsListDataProvider } from "./providers/solutionsList.provider";
import { DependencyTreeItem } from "./models/dependencyTreeItem";
import { SolutionTreeItem } from "./models/solutionTreeItem";
import { FixService } from "./services/fix.service";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "deps-harmony" is now active!');

  // Create and register all tree data providers
  const treeDataProvider = new DependencyTreeDataProvider();
  const conflictsListProvider = new ConflictsListDataProvider();
  const solutionsListProvider = new SolutionsListDataProvider();

  const treeView = vscode.window.createTreeView("depsHarmony.dependencyTree", {
    treeDataProvider,
    showCollapseAll: true,
  });

  const conflictsView = vscode.window.createTreeView(
    "depsHarmony.conflictsList",
    {
      treeDataProvider: conflictsListProvider,
      showCollapseAll: true,
    }
  );

  const solutionsView = vscode.window.createTreeView(
    "depsHarmony.solutionsList",
    {
      treeDataProvider: solutionsListProvider,
      showCollapseAll: true,
    }
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const helloWorldDisposable = vscode.commands.registerCommand(
    "deps-harmony.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from deps-harmony!");
    }
  );

  // Register the scanProject command
  const scanProjectDisposable = vscode.commands.registerCommand(
    "deps-harmony.scanProject",
    async () => {
      try {
        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Scanning project dependencies...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 0,
              message: "Parsing project files...",
            });

            // Parse project files
            const parsedFiles = await ParserService.parseProjectFiles();
            if (!parsedFiles) {
              return; // Error already shown by ParserService
            }

            progress.report({
              increment: 30,
              message: "Building dependency graph...",
            });

            // Build dependency graph
            const graph = GraphService.buildGraph(
              parsedFiles.packageJson,
              parsedFiles.packageLockJson
            );

            progress.report({
              increment: 60,
              message: "Analyzing conflicts...",
            });

            // Analyze conflicts
            const conflicts = await AnalyzerService.findConflicts(graph);

            progress.report({ increment: 100, message: "Analysis complete!" });

            // Get statistics
            const stats = GraphService.getGraphStats(graph);

            // Log results to console
            console.log("=== Dependency Graph Analysis ===");
            console.log(`Project: ${graph.root.name} v${graph.root.version}`);
            console.log(`Total nodes found: ${stats.totalNodes}`);
            console.log(`Direct dependencies: ${stats.directDependencies}`);
            console.log(`Dev dependencies: ${stats.devDependencies}`);
            console.log(`Maximum dependency depth: ${stats.maxDepth}`);

            // Log conflict analysis
            console.log("\n=== Conflict Analysis ===");
            if (conflicts.length === 0) {
              console.log("✅ No conflicts detected!");
            } else {
              console.log(`⚠️  Found ${conflicts.length} conflict(s):`);

              conflicts.forEach((conflict, index) => {
                console.log(
                  `\n${index + 1}. ${conflict.type} - ${conflict.packageName}`
                );
                console.log(`   Message: ${conflict.message}`);
                console.log(
                  `   Affected nodes: ${conflict.nodes
                    .map((n) => `${n.name}@${n.version}`)
                    .join(", ")}`
                );

                if (conflict.solutions.length > 0) {
                  console.log(`   Suggested solutions:`);
                  conflict.solutions.forEach((solution, sIndex) => {
                    console.log(`     ${sIndex + 1}. ${solution.description}`);
                  });
                } else {
                  console.log(`   No automated solutions available.`);
                }
              });
            }
            console.log("=== End Analysis ===");

            // Update all tree views with the dependency graph and conflicts
            treeDataProvider.updateTree(graph, conflicts);
            conflictsListProvider.updateConflicts(conflicts);
            solutionsListProvider.updateSolutions(conflicts);

            // Show success message to user with conflict info
            const conflictSummary =
              conflicts.length > 0
                ? ` Found ${conflicts.length} conflict(s).`
                : " No conflicts detected.";

            vscode.window.showInformationMessage(
              `Dependency scan complete! Found ${stats.totalNodes} total packages (${stats.directDependencies} direct, ${stats.devDependencies} dev).${conflictSummary} Check console and tree views for details.`
            );
          }
        );
      } catch (error) {
        console.error("Error during dependency scan:", error);
        vscode.window.showErrorMessage(
          `Failed to scan dependencies: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );

  // Register additional commands
  const viewProblemDisposable = vscode.commands.registerCommand(
    "deps-harmony.viewProblem",
    (item: DependencyTreeItem) => {
      if (item.conflicts.length > 0) {
        const conflict = item.conflicts[0]; // Show first conflict
        vscode.window.showInformationMessage(`Problem: ${conflict.message}`, {
          modal: true,
        });
      }
    }
  );

  const viewSolutionDisposable = vscode.commands.registerCommand(
    "deps-harmony.viewSolution",
    (item: DependencyTreeItem) => {
      if (item.conflicts.length > 0 && item.conflicts[0].solutions.length > 0) {
        const solutions = item.conflicts[0].solutions;
        const solutionText = solutions
          .map((sol, index) => `${index + 1}. ${sol.description}`)
          .join("\n");

        vscode.window.showInformationMessage(
          `Available Solutions:\n${solutionText}`,
          { modal: true }
        );
      } else {
        vscode.window.showInformationMessage(
          "No solutions available for this conflict."
        );
      }
    }
  );

  const executeSolutionDisposable = vscode.commands.registerCommand(
    "deps-harmony.executeSolution",
    async (item: SolutionTreeItem) => {
      try {
        const result = await vscode.window.showWarningMessage(
          `Execute solution: ${item.solution.description}?`,
          { modal: true },
          "Execute",
          "Cancel"
        );

        if (result === "Execute") {
          await item.execute();
          vscode.window.showInformationMessage(
            `Solution executed successfully: ${item.solution.description}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to execute solution: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );

  const applySolutionDisposable = vscode.commands.registerCommand(
    "deps-harmony.applySolution",
    async (item: SolutionTreeItem) => {
      try {
        // Parse the solution description to extract package details
        const solutionDetails = FixService.parseSolutionDescription(
          item.solution.description
        );

        if (!solutionDetails) {
          vscode.window.showErrorMessage(
            "Unable to parse solution details. Please try manual installation."
          );
          return;
        }

        // Show detailed confirmation dialog
        const confirmationMessage = [
          `Apply Solution: ${item.solution.description}`,
          "",
          `This will:`,
          `• Create a backup of package.json`,
          `• Update ${solutionDetails.packageName} to version ${solutionDetails.newVersion}`,
          `• Run npm install to update dependencies`,
          "",
          `Do you want to proceed?`,
        ].join("\n");

        const result = await vscode.window.showWarningMessage(
          confirmationMessage,
          { modal: true },
          "Apply Fix",
          "Cancel"
        );

        if (result !== "Apply Fix") {
          return;
        }

        // Show progress while applying the fix
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Applying dependency fix...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: "Creating backup..." });

            // Apply the fix
            const fixResult = await FixService.applyDependencyFix(
              solutionDetails.packageName,
              solutionDetails.newVersion,
              solutionDetails.isDev
            );

            progress.report({
              increment: 50,
              message: "Updating package.json...",
            });

            if (fixResult.success) {
              progress.report({
                increment: 80,
                message: "Running npm install...",
              });

              // Wait a bit for npm install to start
              await new Promise((resolve) => setTimeout(resolve, 2000));

              progress.report({
                increment: 100,
                message: "Fix applied successfully!",
              });

              // Show success message
              vscode.window
                .showInformationMessage(
                  `✅ ${fixResult.message}\n\nBackup created at: ${fixResult.backupPath}\n\nPlease check the terminal for npm install results.`,
                  "Re-scan Project"
                )
                .then((selection) => {
                  if (selection === "Re-scan Project") {
                    // Trigger a re-scan after the fix
                    vscode.commands.executeCommand("deps-harmony.scanProject");
                  }
                });
            } else {
              throw new Error(fixResult.error || fixResult.message);
            }
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to apply solution: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );

  const refreshTreeDisposable = vscode.commands.registerCommand(
    "deps-harmony.refreshTree",
    () => {
      treeDataProvider.refresh();
      conflictsListProvider.refresh();
      solutionsListProvider.refresh();
      vscode.window.showInformationMessage("Tree views refreshed!");
    }
  );

  context.subscriptions.push(
    helloWorldDisposable,
    scanProjectDisposable,
    viewProblemDisposable,
    viewSolutionDisposable,
    executeSolutionDisposable,
    applySolutionDisposable,
    refreshTreeDisposable,
    treeView,
    conflictsView,
    solutionsView
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
