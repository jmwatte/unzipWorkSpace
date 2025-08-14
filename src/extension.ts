import * as vscode from 'vscode';

let training = false;
let pending: string[] = [];
let statusItem: vscode.StatusBarItem | undefined;

function setTraining(on: boolean) {
  training = on;
  vscode.commands.executeCommand('setContext', 'keymotion.training', training);
  if (training) {
    if (!statusItem) {
      statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      statusItem.name = 'KeyMotion Trainer';
      statusItem.text = 'KeyMotion: ON';
      statusItem.show();
    } else {
      statusItem.text = 'KeyMotion: ON';
      statusItem.show();
    }
    // Open a sandbox buffer
    vscode.workspace.openTextDocument({ content: 'KeyMotion Training — sandbox buffer\n\nPractice safely here. Press Esc to return to Normal mode.\n', language: 'plaintext' })
        .then((doc: vscode.TextDocument) => vscode.window.showTextDocument(doc, { preview: false }));
  } else {
    if (statusItem) { statusItem.text = 'KeyMotion: OFF'; statusItem.hide(); }
  }
}

function normalizeKey(arg: any): string | undefined {
  if (!arg) { return undefined; }
  // If bound via 'type', VS Code sends { text: 'x' }
  if (typeof arg === 'object' && typeof (arg as any).text === 'string') {
    return (arg as any).text;
  }
  const k = typeof arg === 'string' ? arg : arg.key;
  if (!k) { return undefined; }
  return k;
}

async function motion(editor: vscode.TextEditor, key: string) {
  const doc = editor.document;
  const sel = editor.selections[0];
  const pos = sel.active;
  let newPos = pos;
  const clampPos = (line: number, ch: number): vscode.Position => {
    const clampedLine = Math.max(0, Math.min(doc.lineCount - 1, line));
    const lineEnd = doc.lineAt(clampedLine).range.end.character;
    const clampedCh = Math.max(0, Math.min(lineEnd, ch));
    return new vscode.Position(clampedLine, clampedCh);
  };
  switch (key) {
    case 'h': newPos = clampPos(pos.line, pos.character - 1); break; // left
    case 'l': newPos = clampPos(pos.line, pos.character + 1); break; // right
    case 'j': newPos = clampPos(pos.line + 1, pos.character); break; // down
    case 'k': newPos = clampPos(pos.line - 1, pos.character); break; // up
    case 'w': {
      const text = doc.getText(new vscode.Range(pos, doc.lineAt(pos.line).range.end));
      const m = /\w+\W*/.exec(text);
      if (m) newPos = pos.with(pos.line, pos.character + m[0].length);
      break;
    }
  }
  editor.selections = [new vscode.Selection(newPos, newPos)];
}

async function operator(editor: vscode.TextEditor, op: string) {
  pending.push(op);
  // status could be displayed via status bar later
}

async function applyOperatorRange(editor: vscode.TextEditor, rangeKey: string) {
  const op = pending.shift();
  if (!op) { return; }
  const doc = editor.document;
  const sel = editor.selections[0];
  const pos = sel.active;

  function rangeFor(key: string): vscode.Range | undefined {
    switch (key) {
      case 'w': {
        const lineEnd = doc.lineAt(pos.line).range.end;
        const text = doc.getText(new vscode.Range(pos, lineEnd));
        const m = /\w+\W*/.exec(text);
        if (m) return new vscode.Range(pos, pos.with(pos.line, pos.character + m[0].length));
        return undefined;
      }
      case 'l': {
        const end = pos.with(pos.line, pos.character + 1);
        return new vscode.Range(pos, end);
      }
    }
    return undefined;
  }

  const r = rangeFor(rangeKey);
  if (!r) { return; }

  if (op === 'd') {
  await editor.edit((b: vscode.TextEditorEdit) => b.delete(r));
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('keymotion.startTraining', () => setTraining(true)),
    vscode.commands.registerCommand('keymotion.stopTraining', () => setTraining(false)),
    vscode.commands.registerCommand('keymotion.toggleTraining', () => setTraining(!training)),
    vscode.commands.registerCommand('keymotion.calibrate', () => vscode.window.showInformationMessage('Calibration coming soon.')),
  vscode.commands.registerCommand('keymotion.type', async (arg: any) => {
  if (!training) { return; }
      const key = normalizeKey(arg);
      const editor = vscode.window.activeTextEditor;
      if (!key || !editor) { return; }
  if (key === 'Escape') { pending = []; if (statusItem) { statusItem.text = 'KeyMotion: ON'; } return; }
      if (statusItem) { statusItem.text = `KeyMotion: ${key}`; }

      // If an operator is pending, treat this as range
      if (pending.length > 0) {
        await applyOperatorRange(editor, key);
        return;
      }

  // Operators
  if (key === 'd') { await operator(editor, 'd'); return; }

      // Motions
      await motion(editor, key);
    })
  );
}

export function deactivate() {
  training = false;
  pending = [];
  if (statusItem) { statusItem.dispose(); statusItem = undefined; }
}
