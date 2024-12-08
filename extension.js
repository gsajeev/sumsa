const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

let decorationMap = new Map();  // Store decorations per file
let activeDecorationType = null; // To store the active decoration type

function activate(context) {
    let activeEditor = vscode.window.activeTextEditor;

    // Decoration type creation function
    function createDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255,165,0,0.3)',
            isWholeLine: true,
            overviewRulerColor: 'rgba(255, 0, 0, 0.8)', // Red color in overview ruler
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
    }

    // Function to apply decorations to the active editor
    function applyDecorations(editor, decorations) {
        if (!editor) return;

        if (!activeDecorationType) {
            activeDecorationType = createDecorationType(); // Create and store the decoration type
        }

        editor.setDecorations(activeDecorationType, decorations);
        decorationMap.set(editor.document.uri.fsPath, decorations);  // Store decorations for this file
    }

    // Function to clear decorations on user input
    function clearDecorationsOnUserInput() {
        const clearDecorationsListener = vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document.uri.fsPath === editor.document.uri.fsPath) {
                // Remove decorations after user input (e.g., typing or editing content)
                const uri = editor.document.uri.fsPath;
                if (decorationMap.has(uri)) {
                    const decorations = decorationMap.get(uri);
                    if (decorations && decorations.length > 0) {
                        editor.setDecorations(activeDecorationType, []); // Clear decorations
                        decorationMap.delete(uri); // Remove from map
                    }
                }
            }
        });
        return clearDecorationsListener;
    }

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        activeEditor = editor;
        if (editor) {
            // Reapply decorations when the active editor changes
            const uri = editor.document.uri.fsPath;
            if (decorationMap.has(uri)) {
                const storedDecorations = decorationMap.get(uri);
                applyDecorations(editor, storedDecorations);
            }
        }
    });

    let disposable = vscode.commands.registerCommand('xmlAnnotator.annotateFiles', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor detected.');
            return;
        }

        const document = editor.document;
        const xmlFilePath = document.uri.fsPath;

        // Parse the XML file
        const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');

        const parser = new xml2js.Parser({ explicitArray: false });
        parser.parseString(xmlContent, async (err, result) => {
            if (err) {
                vscode.window.showErrorMessage('Failed to parse XML.');
                return;
            }

            const files = result.checkstyle.file;
            if (!files) {
                vscode.window.showErrorMessage('No files found in XML.');
                return;
            }

            const fileEntries = Array.isArray(files) ? files : [files];

            for (const fileEntry of fileEntries) {
                const filePath = fileEntry.$.name;
                const errors = Array.isArray(fileEntry.error) ? fileEntry.error : [fileEntry.error];

                try {
                    // Open the file in the editor
                    const fileUri = vscode.Uri.file(path.resolve(path.dirname(xmlFilePath) + "../../../../..", filePath));
                    const openedDocument = await vscode.workspace.openTextDocument(fileUri);
                    const openedEditor = await vscode.window.showTextDocument(openedDocument);

                    // Prepare decorations
                    let decorations = []; // Reset the decorations
                    for (const error of errors) {
                        if (!error) continue;
                        const line = parseInt(error.$.line, 10) - 1;
                        const severity = error.$.severity;
                        const message = error.$.message;

                        const range = new vscode.Range(
                            line,
                            0,
                            line,
                            openedDocument.lineAt(line).range.end.character
                        );

                        // Define hover message with a well-formatted string
                        const hoverMessage = new vscode.MarkdownString();
                        hoverMessage.appendMarkdown(`**Severity**: ${severity.toUpperCase()}  \n`);
                        hoverMessage.appendMarkdown(`**Message**: ${message}  \n`);
                        hoverMessage.appendMarkdown(`**Line**: ${line + 1}`);

                        // Decoration options without inline text
                        let decorationOptions = {
                            range,
                            hoverMessage, // Use the markdown string for hover
                        };

                        // Differentiate background color and border for severity levels
                        if (severity === 'error') {
                            decorationOptions = {
                                ...decorationOptions,
                                backgroundColor: '#ffdddd',
                                border: '1px solid #ff0000',
                            };
                        } else if (severity === 'warning') {
                            decorationOptions = {
                                ...decorationOptions,
                                backgroundColor: '#fff3cd',
                                border: '1px solid #ff9900',
                            };
                        } else {
                            decorationOptions = {
                                ...decorationOptions,
                                backgroundColor: '#cce5ff',
                                border: '1px solid #0056b3',
                            };
                        }

                        decorations.push(decorationOptions);
                    }

                    // Apply decorations to the newly opened file
                    applyDecorations(openedEditor, decorations);

                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to process file: ${filePath}. Error: ${e.message}`);
                }
            }
        });
    });

    // New command to remove all decorations
    let removeDecorationsDisposable = vscode.commands.registerCommand('xmlAnnotator.removeDecorations', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor detected.');
            return;
        }

        // Clear inline decorations and overview ruler decorations
        const uri = editor.document.uri.fsPath;
        if (decorationMap.has(uri)) {
            decorationMap.delete(uri);
            if (activeDecorationType) {
                editor.setDecorations(activeDecorationType, []); // Clear all decorations
            }
            vscode.window.showInformationMessage('Decorations removed.');
        } else {
            vscode.window.showInformationMessage('No decorations to remove.');
        }
    });

    // Initialize listener to clear decorations on user input
    const clearDecorationsListener = clearDecorationsOnUserInput();

    context.subscriptions.push(disposable, removeDecorationsDisposable, clearDecorationsListener);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate,
};
