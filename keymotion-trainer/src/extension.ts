import * as vscode from 'vscode';

let training = false;
let pending: string[] = [];
let statusItem: vscode.StatusBarItem | undefined;
let countBuffer: string = '';
let insertMode = false;
let rangePrefix: string | undefined;
let opCount: number | undefined;
type FindType = 'f' | 'F' | 't' | 'T';
let findPending: FindType | undefined;
let lastFind: { type: FindType, ch: string } | undefined;
let lastFindOp: 'd' | 'y' | 'c' | 'r' | undefined;

function setTraining(on: boolean) {
  training = on;
  vscode.commands.executeCommand('setContext', 'keymotion.training', training);
  if (training) {
  // Fresh state when turning training on
  insertMode = false;
  vscode.commands.executeCommand('setContext', 'keymotion.insert', false);
  pending = [];
  countBuffer = '';
  rangePrefix = undefined;
  opCount = undefined;
  findPending = undefined;
  lastFind = undefined;
  lastFindOp = undefined;
  if (statusItem) { statusItem.color = undefined; }
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
  rangePrefix = undefined;
  opCount = undefined;
  findPending = undefined;
  lastFind = undefined;
  lastFindOp = undefined;
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
  const moveWORDForwardEnd = (p: vscode.Position): vscode.Position => {
    const lineEnd = doc.lineAt(p.line).range.end;
    const text = doc.getText(new vscode.Range(p, lineEnd));
    const m = /\S+\s*/.exec(text);
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
  const moveWORDForward = (p: vscode.Position): vscode.Position => {
    const lineEnd = doc.lineAt(p.line).range.end;
    const text = doc.getText(new vscode.Range(p, lineEnd));
    const m = /\s*\S+/.exec(text);
    if (m) return p.with(p.line, p.character + m[0].length);
    return p;
  };
  const moveWordBackward = (p: vscode.Position): vscode.Position => {
  const lineStart = new vscode.Position(p.line, 0);
  const left = doc.getText(new vscode.Range(lineStart, p));
  // Skip any trailing non-word characters before the word
  const trailingNonWord = /\W+$/.exec(left)?.[0].length ?? 0;
  const i = left.length - trailingNonWord;
  const before = left.slice(0, Math.max(0, i));
  const wordLen = /\w+$/.exec(before)?.[0].length ?? 0;
  const startCh = Math.max(0, i - wordLen);
  return new vscode.Position(p.line, startCh);
  };
  const moveWORDBackward = (p: vscode.Position): vscode.Position => {
    const lineStart = new vscode.Position(p.line, 0);
    const left = doc.getText(new vscode.Range(lineStart, p));
    const trailingSpaces = /\s+$/.exec(left)?.[0].length ?? 0;
    const i = left.length - trailingSpaces;
    const before = left.slice(0, Math.max(0, i));
    const segLen = /\S+$/.exec(before)?.[0].length ?? 0;
    const startCh = Math.max(0, i - segLen);
    return new vscode.Position(p.line, startCh);
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
  case 'W': newPos = moveWORDForward(pos); break;
  case 'E': newPos = moveWORDForwardEnd(pos); break;
  case 'B': newPos = moveWORDBackward(pos); break;
  }
  editor.selections = [new vscode.Selection(newPos, newPos)];
}

async function operator(editor: vscode.TextEditor, op: string) {
  pending.push(op);
  if (statusItem) statusItem.text = `KeyMotion: ${op} …`; // waiting for motion
}

async function applyOperatorRange(editor: vscode.TextEditor, rangeKey: string, prefix?: string, count: number = 1) {
  const op = pending.shift();
  if (!op) { return; }
  const doc = editor.document;
  const sel = editor.selections[0];
  const pos = sel.active;

  function rangeFor(key: string, n: number): vscode.Range | undefined {
    // Text object: inner word (iw/iW, aw/aW) has priority over motion keys
    if (prefix === 'i' && key === 'w') {
      const line = doc.lineAt(pos.line);
      const text = line.text;
      const left = text.slice(0, pos.character);
      const right = text.slice(pos.character);
      const leftMatch = /\w+$/.exec(left)?.[0].length ?? 0;
      const rightMatch = /^\w+/.exec(right)?.[0].length ?? 0;
      const start = new vscode.Position(pos.line, pos.character - leftMatch);
      const end = new vscode.Position(pos.line, pos.character + rightMatch);
      if (start.isBefore(end)) return new vscode.Range(start, end);
      return undefined;
    }
    if (prefix === 'i' && key === 'W') {
      const line = doc.lineAt(pos.line);
      const text = line.text;
      const left = text.slice(0, pos.character);
      const right = text.slice(pos.character);
      const leftMatch = /\S+$/.exec(left)?.[0].length ?? 0;
      const rightMatch = /^\S+/.exec(right)?.[0].length ?? 0;
      const start = new vscode.Position(pos.line, pos.character - leftMatch);
      const end = new vscode.Position(pos.line, pos.character + rightMatch);
      if (start.isBefore(end)) return new vscode.Range(start, end);
      return undefined;
    }
    if (prefix === 'a' && key === 'w') {
      const line = doc.lineAt(pos.line);
      const text = line.text;
      const left = text.slice(0, pos.character);
      const right = text.slice(pos.character);
      const leftMatch = /\w+$/.exec(left)?.[0].length ?? 0;
      const rightMatch = /^\w+/.exec(right)?.[0].length ?? 0;
      const start = new vscode.Position(pos.line, pos.character - leftMatch);
      let end = new vscode.Position(pos.line, pos.character + rightMatch);
      // include trailing spaces after the word
      const after = text.slice(end.character);
      const spaces = /^\s+/.exec(after)?.[0].length ?? 0;
      end = new vscode.Position(pos.line, end.character + spaces);
      if (start.isBefore(end)) return new vscode.Range(start, end);
      return undefined;
    }
    if (prefix === 'a' && key === 'W') {
      const line = doc.lineAt(pos.line);
      const text = line.text;
      const left = text.slice(0, pos.character);
      const right = text.slice(pos.character);
      const leftMatch = /\S+$/.exec(left)?.[0].length ?? 0;
      const rightMatch = /^\S+/.exec(right)?.[0].length ?? 0;
      const start = new vscode.Position(pos.line, pos.character - leftMatch);
      let end = new vscode.Position(pos.line, pos.character + rightMatch);
      // include trailing spaces after the WORD
      const after = text.slice(end.character);
      const spaces = /^\s+/.exec(after)?.[0].length ?? 0;
      end = new vscode.Position(pos.line, end.character + spaces);
      if (start.isBefore(end)) return new vscode.Range(start, end);
      return undefined;
    }
    switch (key) {
      case 'w': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineEnd = doc.lineAt(cur.line).range.end;
          const text = doc.getText(new vscode.Range(cur, lineEnd));
          const m = /\w+\W*/.exec(text);
          if (m) cur = cur.with(cur.line, cur.character + m[0].length);
        }
        if (cur.isAfter(pos)) return new vscode.Range(pos, cur);
        return undefined;
      }
      case 'W': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineEnd = doc.lineAt(cur.line).range.end;
          const text = doc.getText(new vscode.Range(cur, lineEnd));
          const m = /\S+/.exec(text);
          if (m) cur = cur.with(cur.line, cur.character + m[0].length);
        }
        if (cur.isAfter(pos)) return new vscode.Range(pos, cur);
        return undefined;
      }
      case 'e': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineEnd = doc.lineAt(cur.line).range.end;
          const text = doc.getText(new vscode.Range(cur, lineEnd));
          const m = /\w+/.exec(text);
          if (m) cur = cur.with(cur.line, cur.character + m[0].length);
        }
        if (cur.isAfter(pos)) return new vscode.Range(pos, cur);
        return undefined;
      }
      case 'E': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineEnd = doc.lineAt(cur.line).range.end;
          const text = doc.getText(new vscode.Range(cur, lineEnd));
          const m = /\S+/.exec(text);
          if (m) cur = cur.with(cur.line, cur.character + m[0].length);
        }
        if (cur.isAfter(pos)) return new vscode.Range(pos, cur);
        return undefined;
      }
      case 'b': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineStart = new vscode.Position(cur.line, 0);
          const left = doc.getText(new vscode.Range(lineStart, cur));
          const trailingNonWord = /\W+$/.exec(left)?.[0].length ?? 0;
          const idx = left.length - trailingNonWord;
          const before = left.slice(0, Math.max(0, idx));
          const wordLen = /\w+$/.exec(before)?.[0].length ?? 0;
          const startCh = Math.max(0, idx - wordLen);
          cur = new vscode.Position(cur.line, startCh);
        }
        if (cur.isBefore(pos)) return new vscode.Range(cur, pos);
        return undefined;
      }
      case 'B': {
        let cur = pos;
        for (let i = 0; i < Math.max(1, n); i++) {
          const lineStart = new vscode.Position(cur.line, 0);
          const left = doc.getText(new vscode.Range(lineStart, cur));
          const trailingSpaces = /\s+$/.exec(left)?.[0].length ?? 0;
          const idx = left.length - trailingSpaces;
          const before = left.slice(0, Math.max(0, idx));
          const segLen = /\S+$/.exec(before)?.[0].length ?? 0;
          const startCh = Math.max(0, idx - segLen);
          cur = new vscode.Position(cur.line, startCh);
        }
        if (cur.isBefore(pos)) return new vscode.Range(cur, pos);
        return undefined;
      }
      case '$': {
        const end = doc.lineAt(pos.line).range.end;
        return new vscode.Range(pos, end);
      }
      case '0': {
        const start = new vscode.Position(pos.line, 0);
        return new vscode.Range(start, pos);
      }
      case 'l': {
        const end = pos.with(pos.line, Math.min(doc.lineAt(pos.line).range.end.character, pos.character + Math.max(1, n)));
        return new vscode.Range(pos, end);
      }
      case 'h': {
        const startCh = Math.max(0, pos.character - Math.max(1, n));
        const start = pos.with(pos.line, startCh);
        return new vscode.Range(start, pos);
      }
    }
    return undefined;
  }

  const r = rangeFor(rangeKey, count);
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
  else if (op === 'r') {
    await vscode.env.clipboard.writeText(editor.document.getText(r));
    await editor.edit((b) => b.delete(r));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
  }
  else if (op === 'c') {
    await editor.edit((b) => b.delete(r));
    insertMode = true;
  vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
  if (statusItem) { statusItem.text = 'INSERT'; statusItem.color = '#00c853'; }
  }
}

async function performOpOnRange(editor: vscode.TextEditor, op: string, r: vscode.Range) {
  if (op === 'd') {
    await editor.edit(b => b.delete(r));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
    return;
  }
  if (op === 'y') {
    await vscode.env.clipboard.writeText(editor.document.getText(r));
    editor.selections = [new vscode.Selection(r.start, r.start)];
    if (statusItem) statusItem.text = 'KeyMotion: ON';
    return;
  }
  if (op === 'r') {
    await vscode.env.clipboard.writeText(editor.document.getText(r));
    await editor.edit(b => b.delete(r));
    if (statusItem) statusItem.text = 'KeyMotion: ON';
    return;
  }
  if (op === 'c') {
    await editor.edit(b => b.delete(r));
    insertMode = true;
    vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
    if (statusItem) { statusItem.text = 'INSERT'; statusItem.color = '#00c853'; }
  }
}

function invertFindType(t: FindType): FindType {
  return t === 'f' ? 'F' : t === 'F' ? 'f' : t === 't' ? 'T' : 't';
}

function findRangeFor(editor: vscode.TextEditor, spec: { type: FindType, ch: string }, count: number): vscode.Range | undefined {
  const doc = editor.document;
  const pos = editor.selections[0].active;
  const lineText = doc.lineAt(pos.line).text;
  const ch = spec.ch;
  if (!ch || ch.length !== 1) return undefined;
  let idx = -1;
  if (spec.type === 'f' || spec.type === 't') {
    let start = pos.character + 1;
    for (let i = 0; i < Math.max(1, count); i++) {
      idx = lineText.indexOf(ch, start);
      if (idx === -1) return undefined;
      start = idx + 1;
    }
    const endCh = spec.type === 'f' ? idx + 1 : idx;
    if (endCh <= pos.character) return undefined;
    const end = new vscode.Position(pos.line, endCh);
    return new vscode.Range(pos, end);
  } else { // 'F' or 'T'
    let start = Math.max(0, pos.character - 1);
    for (let i = 0; i < Math.max(1, count); i++) {
      idx = lineText.lastIndexOf(ch, start);
      if (idx === -1) return undefined;
      start = Math.max(0, idx - 1);
    }
    const startCh = spec.type === 'F' ? idx : idx + 1; // T excludes the target
    if (startCh >= pos.character) return undefined;
    const begin = new vscode.Position(pos.line, startCh);
    return new vscode.Range(begin, pos);
  }
}

async function applyFindMotion(editor: vscode.TextEditor, spec: { type: FindType, ch: string }, count: number) {
  const doc = editor.document;
  const sel = editor.selections[0];
  const pos = sel.active;
  const lineText = doc.lineAt(pos.line).text;
  const ch = spec.ch;
  if (!ch || ch.length !== 1) return;
  let idx = -1;
  if (spec.type === 'f' || spec.type === 't') {
    let start = pos.character + 1;
    for (let i = 0; i < Math.max(1, count); i++) {
      idx = lineText.indexOf(ch, start);
      if (idx === -1) return;
      start = idx + 1;
    }
    const newCh = spec.type === 'f' ? idx : Math.max(0, idx - 1);
    const np = new vscode.Position(pos.line, newCh);
    editor.selections = [new vscode.Selection(np, np)];
  } else {
    let start = Math.max(0, pos.character - 1);
    for (let i = 0; i < Math.max(1, count); i++) {
      idx = lineText.lastIndexOf(ch, start);
      if (idx === -1) return;
      start = Math.max(0, idx - 1);
    }
    const newCh = spec.type === 'F' ? idx : idx + 1;
    const np = new vscode.Position(pos.line, newCh);
    editor.selections = [new vscode.Selection(np, np)];
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
  rangePrefix = undefined;
  opCount = undefined;
  findPending = undefined;
      if (statusItem) { statusItem.text = 'KeyMotion: ON'; statusItem.color = undefined; }
        return;
      }

      // INSERT mode: forward characters to the editor
      if (insertMode) {
  if (statusItem) { statusItem.text = 'INSERT'; statusItem.color = '#00c853'; }
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
  if (statusItem) { statusItem.text = `KeyMotion: ${countBuffer ? countBuffer + ' ' : ''}${pending[0] ? pending[0] + ' … ' : ''}${key}`; statusItem.color = undefined; }

      // Counts
  if (/^[1-9]$/.test(key)) { countBuffer += key; if (statusItem) statusItem.text = `KeyMotion: ${countBuffer}`; return; }

  const count = Math.max(1, parseInt(countBuffer || '1', 10));
  countBuffer = '';

      // Awaiting target for f/F/t/T
      if (findPending) {
        const text = (typeof arg === 'object' && typeof (arg as any).text === 'string') ? (arg as any).text : key;
        if (typeof text !== 'string' || text.length !== 1) { return; }
        const eff = Math.max(1, (opCount || 1) * count);
        const spec = { type: findPending, ch: text } as { type: FindType, ch: string };
        // Try applying as operator range if pending; otherwise motion
    if (pending.length > 0) {
          const r = findRangeFor(editor, spec, eff);
          if (r) {
            const opKey = pending.shift()!;
            await performOpOnRange(editor, opKey, r);
            rangePrefix = undefined;
            opCount = undefined;
      lastFindOp = opKey as any;
          }
        } else {
          await applyFindMotion(editor, spec, eff);
        }
        lastFind = spec;
        findPending = undefined;
        return;
      }

      // Immediate operators
      if (key === 'C' || key === 'D' || key === 'Y') {
        const doc2 = editor.document;
        const pos2 = editor.selections[0].active;
        if (key === 'C' || key === 'D') {
          const end2 = doc2.lineAt(pos2.line).range.end;
          const r2 = new vscode.Range(pos2, end2);
          await editor.edit(b => b.delete(r2));
          if (key === 'C') {
            insertMode = true;
            vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
            if (statusItem) { statusItem.text = 'INSERT'; statusItem.color = '#00c853'; }
          } else {
            if (statusItem) { statusItem.text = 'KeyMotion: ON'; statusItem.color = undefined; }
          }
        } else if (key === 'Y') {
          const lineRange2 = doc2.lineAt(pos2.line).rangeIncludingLineBreak;
          await vscode.env.clipboard.writeText(doc2.getText(lineRange2));
          if (statusItem) { statusItem.text = 'KeyMotion: ON'; statusItem.color = undefined; }
        }
        return;
      }

  // Paste commands (basic): p (after), P (before)
      if (key === 'p' || key === 'P') {
        const pasteText = await vscode.env.clipboard.readText();
        if (pasteText && pasteText.length > 0) {
          const doc3 = editor.document;
          const cur = editor.selections[0].active;
          const isLine = pasteText.endsWith('\n');
          let target = cur;
          if (isLine) {
            if (key === 'p') {
              // start of next line
              const nextLine = Math.min(doc3.lineCount, cur.line + 1);
              target = new vscode.Position(nextLine, 0);
            } else {
              // start of current line
              target = new vscode.Position(cur.line, 0);
            }
          } else {
    // For characterwise, paste at caret for both p and P
    target = cur;
          }
          await editor.edit(b => b.insert(target, pasteText));
          const endPos = new vscode.Position(target.line, target.character + pasteText.length);
          editor.selections = [new vscode.Selection(endPos, endPos)];
          if (statusItem) { statusItem.text = 'KeyMotion: ON'; statusItem.color = undefined; }
        }
        return;
      }

      // f/F/t/T: set up to receive a target character
      if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
        findPending = key as FindType;
        if (statusItem) statusItem.text = `KeyMotion: ${pending[0] ? pending[0] + ' ' : ''}${key} …`;
        return;
      }

      // Repeat last find ; (same direction) and , (opposite)
      if ((key === ';' || key === ',') && lastFind) {
        const eff = Math.max(1, (opCount || 1) * count);
        const primary = { type: key === ';' ? lastFind.type : invertFindType(lastFind.type), ch: lastFind.ch } as { type: FindType, ch: string };
        const secondary = { type: invertFindType(primary.type), ch: primary.ch } as { type: FindType, ch: string };
        if (pending.length > 0) {
          let r = findRangeFor(editor, primary, eff);
          if (!r) { r = findRangeFor(editor, secondary, eff); }
          if (r) {
            const opKey = pending.shift()!;
            await performOpOnRange(editor, opKey, r);
            rangePrefix = undefined;
            opCount = undefined;
          }
        } else {
          // If no operator pending, repeat prior operator+find if available; otherwise just motion
          if (lastFindOp) {
            let r = findRangeFor(editor, primary, eff);
            if (!r) { r = findRangeFor(editor, secondary, eff); }
            if (r) {
              await performOpOnRange(editor, lastFindOp, r);
            }
          } else {
            // motion fallback
            let applied = false;
            let r = findRangeFor(editor, primary, eff);
            if (r) { await applyFindMotion(editor, primary, eff); applied = true; }
            if (!applied) { await applyFindMotion(editor, secondary, eff); }
          }
        }
        lastFind = primary; // record the requested direction
        return;
      }

      // If an operator is pending, treat this as range or text object
      if (pending.length > 0) {
        if (key === 'i' || key === 'a') {
          rangePrefix = key;
          if (statusItem) statusItem.text = `KeyMotion: ${pending[0]} ${rangePrefix} …`;
          return;
        }
        // dd/yy/cc: line operations when repeating operator key
    if ((key === 'd' || key === 'y' || key === 'c') && pending[0] === key) {
          const opKey = pending.shift()!;
          const docL = editor.document;
          const cur = editor.selections[0].active;
          const eff = Math.max(1, (opCount || 1) * count);
          const start = new vscode.Position(cur.line, 0);
          const lastLine = Math.min(docL.lineCount - 1, cur.line + eff - 1);
          const endForYank = docL.lineAt(lastLine).rangeIncludingLineBreak.end;
          if (opKey === 'y') {
            await vscode.env.clipboard.writeText(docL.getText(new vscode.Range(start, endForYank)));
            if (statusItem) statusItem.text = 'KeyMotion: ON';
          } else if (opKey === 'd') {
            await editor.edit(b => b.delete(new vscode.Range(start, endForYank)));
            if (statusItem) statusItem.text = 'KeyMotion: ON';
          } else if (opKey === 'c') {
      // Change current line(s): delete eff lines and leave one empty line, enter INSERT
      await editor.edit(b => b.delete(new vscode.Range(start, endForYank)));
      // Ensure a blank line remains at the original position
      await editor.edit(b => b.insert(start, "\n"));
      editor.selections = [new vscode.Selection(start, start)];
            insertMode = true;
            vscode.commands.executeCommand('setContext', 'keymotion.insert', true);
      if (statusItem) { statusItem.text = 'INSERT'; statusItem.color = '#00c853'; }
          }
          rangePrefix = undefined;
          opCount = undefined;
          return;
        }
        const prefixToUse = rangePrefix;
        rangePrefix = undefined;
  const effective = Math.max(1, (opCount || 1) * count);
  await applyOperatorRange(editor, key, prefixToUse, effective);
  opCount = undefined;
        return;
      }

  // Operators (capture any leading count as operator count)
  if (key === 'd') { opCount = count; await operator(editor, 'd'); return; }
  if (key === 'y') { opCount = count; await operator(editor, 'y'); return; }
  if (key === 'c') { opCount = count; await operator(editor, 'c'); return; }
  if (key === 'r') { opCount = count; await operator(editor, 'r'); return; }

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
