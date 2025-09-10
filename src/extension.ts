import * as vscode from 'vscode';
import * as path from 'path';

// 拡張機能が有効化されたときに実行されるメイン関数
export function activate(context: vscode.ExtensionContext) {
  // サイドバーに表示するビューの提供者（Provider）を作成し、VS Codeに登録します。
  // "combine-opened-files-view" というIDは、package.jsonで定義したものと一致させる必要があります。
  const provider = new CombineFilesViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("combine-opened-files-view", provider)
  );
}

class CombineFilesViewProvider implements vscode.WebviewViewProvider {

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // このメソッドが、ビューが表示されるたびにVS Codeから呼び出されます。
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // Webviewでスクリプトを有効にし、ローカルリソースへのアクセスを許可します。
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Webviewに表示するHTMLコンテンツを設定します。
    webviewView.webview.html = this._getWebviewContent(webviewView.webview);

    // Webview内のUI（JavaScript）からのメッセージを受け取るためのリスナーを設定します。
    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        // UIから「ファイルリストをください」と要求された場合の処理
        case 'getFiles': {
          const files = await getOpenedFiles();
          // 取得したファイルリストをUIに送り返します。
          webviewView.webview.postMessage({ command: 'updateFiles', files: files });
          return;
        }
        // UIから「この内容でファイルを生成してください」と要求された場合の処理
        case 'generateFile': {
          // 新しい無題のドキュメントを作成
          const newDocument = await vscode.workspace.openTextDocument({
            content: message.text, // UIから送られてきた結合済みのテキスト
            language: 'text'     // ファイルタイプをプレーンテキストに設定
          });

          // 作成したドキュメントをエディタで表示
          await vscode.window.showTextDocument(newDocument);

          return;
        }
      }
    });
  }

// CombineFilesViewProvider クラス内のメソッド

  private _getWebviewContent(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Combine Opened Files</title>
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
      color: var(--vscode-textLink-foreground); /* 基本の色を指定 */
      cursor: pointer;
      padding: 0;
      font-size: 0.9em;
      text-decoration: none; /* 通常は下線なし */
    }
  </style>
</head>
<body>
  <h1>Combine Opened Files</h1>

  <div class="selection-controls">
    <button id="select-all-button" class="link-button">Select All</button>
    <button id="unselect-all-button" class="link-button">Unselect All</button>
  </div>

  <div id="file-list" class="file-list">
    <p id="loading">Loading open files...</p>
  </div>
  <button id="combine-button" style="display: none;">Combine & Generate File</button>

  <script>
    // JavaScript部分は変更ありません
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

// 現在開かれているテキストファイルの情報を取得する非同期関数
async function getOpenedFiles(): Promise<{ name: string; path: string; content: string }[]> {
  const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
  const filePromises = tabs.map(async tab => {
    if (tab.input instanceof vscode.TabInputText) {
      const uri = tab.input.uri;
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        return {
          name: path.basename(uri.fsPath),
          // vscode.workspace.asRelativePath でワークスペースからの相対パスを取得
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
  // 読み込めなかったファイル（null）を除外して返す
  return files.filter((f): f is { name: string; path: string; content: string } => f !== null);
}

// 拡張機能が無効化されるときに呼ばれる関数（今回は何もしない）
export function deactivate() {}
