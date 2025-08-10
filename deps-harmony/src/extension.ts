// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ParserService } from "./services/parser.service";
import { GraphService } from "./services/graph.service";
import { AnalyzerService } from "./services/analyzer.service";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "deps-harmony" is now active!');

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

            // Show success message to user with conflict info
            const conflictSummary =
              conflicts.length > 0
                ? ` Found ${conflicts.length} conflict(s).`
                : " No conflicts detected.";

            vscode.window.showInformationMessage(
              `Dependency scan complete! Found ${stats.totalNodes} total packages (${stats.directDependencies} direct, ${stats.devDependencies} dev).${conflictSummary} Check console for details.`
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

  context.subscriptions.push(helloWorldDisposable, scanProjectDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
