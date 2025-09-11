import * as vscode from 'vscode';
import * as path from 'path';

// Main function executed when the extension is activated
export function activate(context: vscode.ExtensionContext) {
  // Create and register the provider for the view shown in the sidebar.
  // The ID "combine-selected-open-files-view" must match the one defined in package.json.
  const provider = new CombineFilesViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("combine-selected-open-files-view", provider)
  );
}

class CombineFilesViewProvider implements vscode.WebviewViewProvider {

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Called by VS Code each time the view is revealed.
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // Enable scripts in the Webview and allow access to local resources.
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Set the HTML content that the Webview will display.
    webviewView.webview.html = this._getWebviewContent(webviewView.webview);

    // Set up a listener to receive messages from the Webview UI (JavaScript).
    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        // When the UI requests the list of files
        case 'getFiles': {
          const files = await getOpenFiles();
          // Send the retrieved file list back to the UI.
          webviewView.webview.postMessage({ command: 'updateFiles', files: files });
          return;
        }
        // When the UI asks to generate a file from the provided combined text
        case 'generateFile': {
          // Create a new untitled document
          const newDocument = await vscode.workspace.openTextDocument({
            content: message.text, // Combined text sent from the UI
            language: 'text'       // Set the file type to plain text
          });

          // Show the created document in the editor
          await vscode.window.showTextDocument(newDocument);

          return;
        }
      }
    });
  }

  // Method inside CombineFilesViewProvider class
  private _getWebviewContent(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Combine Selected Open Files</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 1rem;
    }
    .file-item {
      display: flex;
      align-items: flex-start;
      padding: 0.4rem 0.25rem;
      border-radius: 2px;
    }
    .file-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .file-item input {
      margin-top: 0.2rem;
      margin-right: 0.5rem;
    }
    .file-info {
      cursor: pointer;
    }
    .file-path {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid var(--vscode-button-border, transparent);
      padding: 0.5rem 1rem;
      margin-top: 1rem;
      cursor: pointer;
      border-radius: 2px;
      width: 100%;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .selection-controls {
      display: flex;
      gap: 1rem;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .link-button {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground); /* Set the base color */
      cursor: pointer;
      padding: 0;
      font-size: 0.9em;
      text-decoration: none; /* No underline by default */
    }
  </style>
</head>
<body>
  <h1>Combine Selected Open Files</h1>

  <div class="selection-controls">
    <button id="select-all-button" class="link-button">Select All</button>
    <button id="unselect-all-button" class="link-button">Unselect All</button>
  </div>

  <div id="file-list" class="file-list">
    <p id="loading">Loading open files...</p>
  </div>
  <button id="combine-button" style="display: none;">Combine & Generate File</button>

  <script>
    // The JavaScript section is unchanged
    const vscode = acquireVsCodeApi();
    const fileListDiv = document.getElementById('file-list');
    const combineButton = document.getElementById('combine-button');
    const loadingMessage = document.getElementById('loading');
    const selectAllButton = document.getElementById('select-all-button');
    const unselectAllButton = document.getElementById('unselect-all-button');

    let fileData = [];

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateFiles') {
        fileData = message.files;
        renderFileList();
      }
    });

    function renderFileList() {
      if (fileData.length === 0) {
        loadingMessage.textContent = 'No text files are open.';
        combineButton.style.display = 'none';
        document.querySelector('.selection-controls').style.display = 'none';
        return;
      }

      document.querySelector('.selection-controls').style.display = 'flex';
      fileListDiv.innerHTML = '';
      fileData.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = \`
          <input type="checkbox" id="file-\${index}" data-index="\${index}" checked>
          <div class="file-info" onclick="document.getElementById('file-\${index}').click()">
            <label for="file-\${index}">\${escapeHtml(file.name)}</label>
            <div class="file-path">\${escapeHtml(file.path)}</div>
          </div>
        \`;
        fileListDiv.appendChild(item);
      });

      loadingMessage.style.display = 'none';
      combineButton.style.display = 'block';
    }

    selectAllButton.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#file-list input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
    });

    unselectAllButton.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#file-list input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    });

    combineButton.addEventListener('click', () => {
      const selectedContents = [];
      const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');

      checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index, 10);
        const file = fileData[index];
        if (file) {
          const header = \`// ===== File: \${file.path} =====\\n\\n\`;
          selectedContents.push(header + file.content);
        }
      });

      vscode.postMessage({
        command: 'generateFile',
        text: selectedContents.join('\\n\\n')
      });
    });

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, function(match) {
        return {
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match];
      });
    }

    vscode.postMessage({ command: 'getFiles' });
  </script>
</body>
</html>`;
  }
}

// Async function to retrieve information about currently opened text files
async function getOpenFiles(): Promise<{ name: string; path: string; content: string }[]> {
  const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
  const filePromises = tabs.map(async tab => {
    if (tab.input instanceof vscode.TabInputText) {
      const uri = tab.input.uri;
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        return {
          name: path.basename(uri.fsPath),
          // Get the relative path from the workspace
          path: vscode.workspace.asRelativePath(uri.fsPath),
          content: document.getText()
        };
      } catch (e) {
        console.error(`Could not read file: ${uri.fsPath}`, e);
        return null;
      }
    }
    return null;
  });

  const files = await Promise.all(filePromises);
  // Filter out files that couldn't be read (null)
  return files.filter((f): f is { name: string; path: string; content: string } => f !== null);
}

// Called when the extension is deactivated (no-op for now)
export function deactivate() {}
