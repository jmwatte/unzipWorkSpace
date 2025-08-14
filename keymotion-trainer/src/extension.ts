import * as vscode from 'vscode';

let training = false;
let pending: string[] = [];
let statusItem: vscode.StatusBarItem | undefined;
let countBuffer: string = '';
let insertMode = false;

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
    insertMode = false;
  vscode.commands.executeCommand('setContext', 'keymotion.insert', false);
    pending = [];
    countBuffer = '';
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
  const moveWordForwardEnd = (p: vscode.Position): vscode.Position => {
    const lineEnd = doc.lineAt(p.line).range.end;
    const text = doc.getText(new vscode.Range(p, lineEnd));
    const m = /\w+\W*/.exec(text);
    if (m) return p.with(p.line, p.character + m[0].length);
    return p;
  };
  const moveWordForward = (p: vscode.Position): vscode.Position => {
    const lineEnd = doc.lineAt(p.line).range.end;
    const text = doc.getText(new vscode.Range(p, lineEnd));
    const m = /\W*\w+/.exec(text);
    if (m) return p.with(p.line, p.character + m[0].length);
    return p;
  };
  const moveWordBackward = (p: vscode.Position): vscode.Position => {
    const lineStart = new vscode.Position(p.line, 0);
    const text = doc.getText(new vscode.Range(lineStart, p));
    const m = /\w+\W*$/.exec(text);
    if (m) return p.with(p.line, p.character - m[0].length + (/\W+$/.exec(m[0])?.[0].length ?? 0));
    return p.with(p.line, 0);
  };
  switch (key) {
    case 'h': newPos = clampPos(pos.line, pos.character - 1); break; // left
    case 'l': newPos = clampPos(pos.line, pos.character + 1); break; // right
    case 'j': newPos = clampPos(pos.line + 1, pos.character); break; // down
    case 'k': newPos = clampPos(pos.line - 1, pos.character); break; // up
  case '0': newPos = clampPos(pos.line, 0); break; // line start
  case '$': newPos = doc.lineAt(pos.line).range.end; break; // line end
  case 'w': newPos = moveWordForward(pos); break;
  case 'e': newPos = moveWordForwardEnd(pos); break;
  case 'b': newPos = moveWordBackward(pos); break;
  }
  editor.selections = [new vscode.Selection(newPos, newPos)];
}

async function operator(editor: vscode.TextEditor, op: string) {
  pending.push(op);
  if (statusItem) statusItem.text = `KeyMotion: ${op} …`; // waiting for motion
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
      case 'i': { // support 'iw' as inner word
        const next = pending.shift();
        if (next === 'w') {
          const line = doc.lineAt(pos.line);
          const text = line.text;
          const left = text.slice(0, pos.character);
          const right = text.slice(pos.character);
          const leftMatch = /\w+$/.exec(left)?.[0].length ?? 0;
          const rightMatch = /^\w+/.exec(right)?.[0].length ?? 0;
          const start = new vscode.Position(pos.line, pos.character - leftMatch);
          const end = new vscode.Position(pos.line, pos.character + rightMatch);
          if (start.isBefore(end)) return new vscode.Range(start, end);
        }
        return undefined;
      }
      case '$': {
        const end = doc.lineAt(pos.line).range.end;
        return new vscode.Range(pos, end);
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
    await editor.edit((b) => b.delete(r));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
  }
  else if (op === 'y') {
    await vscode.env.clipboard.writeText(editor.document.getText(r));
    editor.selections = [new vscode.Selection(r.start, r.start)];
    if (statusItem) statusItem.text = 'KeyMotion: ON';
  }
  else if (op === 'c') {
    await editor.edit((b) => b.delete(r));
    insertMode = true;
  vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
    if (statusItem) statusItem.text = 'INSERT';
  }
  else if (op === 'C') {
    const end = doc.lineAt(pos.line).range.end;
    const r2 = new vscode.Range(pos, end);
    await editor.edit((b) => b.delete(r2));
    insertMode = true;
  vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
    if (statusItem) statusItem.text = 'INSERT';
  }
  else if (op === 'D') {
    const end = doc.lineAt(pos.line).range.end;
    const r2 = new vscode.Range(pos, end);
    await editor.edit((b) => b.delete(r2));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
  }
  else if (op === 'Y') {
    const lineRange = doc.lineAt(pos.line).rangeIncludingLineBreak;
    await vscode.env.clipboard.writeText(doc.getText(lineRange));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
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
      if (key === 'Escape') {
  if (insertMode) { insertMode = false; vscode.commands.executeCommand('setContext', 'keymotion.insert', false); }
        pending = [];
        countBuffer = '';
        if (statusItem) { statusItem.text = 'KeyMotion: ON'; }
        return;
      }

      // INSERT mode: forward characters to the editor
      if (insertMode) {
        if (statusItem) statusItem.text = 'INSERT';
        // Prefer arg.text when available (from 'type')
        const text = (typeof arg === 'object' && typeof (arg as any).text === 'string') ? (arg as any).text : undefined;
        if (typeof text === 'string' && text.length > 0) {
          await vscode.commands.executeCommand('type', { text });
          return;
        }
        // Handle a few control keys
        if (key === 'Backspace') { await vscode.commands.executeCommand('deleteLeft'); return; }
        if (key === 'Tab') { await vscode.commands.executeCommand('type', { text: '\t' }); return; }
        if (key === 'Enter') { await vscode.commands.executeCommand('type', { text: '\n' }); return; }
  return; // swallow anything else
      }
  if (statusItem) { statusItem.text = `KeyMotion: ${countBuffer ? countBuffer + ' ' : ''}${pending[0] ? pending[0] + ' … ' : ''}${key}`; }

      // Counts
  if (/^[1-9]$/.test(key)) { countBuffer += key; if (statusItem) statusItem.text = `KeyMotion: ${countBuffer}`; return; }

      const count = Math.max(1, parseInt(countBuffer || '1', 10));
      countBuffer = '';

      // If an operator is pending, treat this as range
      if (pending.length > 0) {
        for (let i = 0; i < count; i++) { await applyOperatorRange(editor, key); }
        return;
      }

      // Operators
  if (key === 'd') { await operator(editor, 'd'); return; }
  if (key === 'y') { await operator(editor, 'y'); return; }
  if (key === 'c') { await operator(editor, 'c'); return; }
  if (key === 'C') { await operator(editor, 'C'); return; }
  if (key === 'D') { await operator(editor, 'D'); return; }
  if (key === 'Y') { await operator(editor, 'Y'); return; }

      // Motions
      for (let i = 0; i < count; i++) { await motion(editor, key); }
    })
  );
}

export function deactivate() {
  training = false;
  pending = [];
  if (statusItem) { statusItem.dispose(); statusItem = undefined; }
}
