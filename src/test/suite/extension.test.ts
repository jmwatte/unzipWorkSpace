import * as assert from 'assert';
import * as vscode from 'vscode';

suite('KeyMotion basic ranges', () => {
  async function startAndFocus(doc: vscode.TextDocument) {
    await vscode.commands.executeCommand('keymotion.startTraining');
    await new Promise(r => setTimeout(r, 50));
    await vscode.window.showTextDocument(doc);
    await new Promise(r => setTimeout(r, 25));
  }

  test('d3w deletes three words', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one two three four five\n', language: 'plaintext' });
  await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
  const editor2 = vscode.window.activeTextEditor!;
  editor2.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));

    // Simulate: d, 3, w
  await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
  await vscode.commands.executeCommand('keymotion.type', { text: '3' });
  await vscode.commands.executeCommand('keymotion.type', { text: 'w' });

    const text = doc.getText();
    assert.strictEqual(text.startsWith('four'), true, `Expected text to start with 'four', got: ${text}`);
  });

  test('3db deletes three words back', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one two three four five\n', language: 'plaintext' });
  await vscode.window.showTextDocument(doc);
  await startAndFocus(doc);
  const editor3 = vscode.window.activeTextEditor!;
  // Put cursor at end of line (exact EOL)
  const eol = doc.lineAt(0).range.end.character;
  editor3.selection = new vscode.Selection(new vscode.Position(0, eol), new vscode.Position(0, eol));

    // Simulate: 3, d, b
    await vscode.commands.executeCommand('keymotion.type', { text: '3' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'b' });

    const text = doc.getText();
    assert.strictEqual(text.trimEnd(), 'one two', `Expected remaining 'one two', got: ${text}`);
  });

  test('d2l deletes two characters to the right', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abcde\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: '2' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'l' });
    assert.strictEqual(doc.getText(), 'cde\n');
  });

  test('y3h yanks three characters to the left and moves cursor', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'hello\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    // Place at EOL (5)
    const eol = doc.lineAt(0).range.end.character;
    ed.selection = new vscode.Selection(new vscode.Position(0, eol), new vscode.Position(0, eol));
    await vscode.commands.executeCommand('keymotion.type', { text: 'y' });
    await vscode.commands.executeCommand('keymotion.type', { text: '3' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'h' });
    const clip = await vscode.env.clipboard.readText();
    assert.strictEqual(clip, 'llo');
    // Cursor should have moved left by 3 (to col 2)
    const pos = ed.selection.active;
    assert.strictEqual(pos.character, eol - 3);
    assert.strictEqual(doc.getText(), 'hello\n');
  });

  test('de deletes to end of current word', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one two\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'e' });
    assert.strictEqual(doc.getText(), ' two\n');
  });

  test('d0 deletes to start of line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abcdef\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: '0' });
    assert.strictEqual(doc.getText(), 'def\n');
  });

  test('c0 deletes to start of line (entering insert)', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abcdef\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3));
    await vscode.commands.executeCommand('keymotion.type', { text: 'c' });
    await vscode.commands.executeCommand('keymotion.type', { text: '0' });
    assert.strictEqual(doc.getText(), 'def\n');
  });

  test('ciw deletes inner word and enters insert', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo bar\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1)); // inside 'foo'
    await vscode.commands.executeCommand('keymotion.type', { text: 'c' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'i' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'w' });
    assert.strictEqual(doc.getText(), ' bar\n');
  });

  test('yiw yanks inner word', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo bar\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 5), new vscode.Position(0, 5)); // inside 'bar'
    await vscode.commands.executeCommand('keymotion.type', { text: 'y' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'i' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'w' });
    const clip = await vscode.env.clipboard.readText();
    assert.strictEqual(clip, 'bar');
    assert.strictEqual(doc.getText(), 'foo bar\n');
  });

  test('C changes to end of line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abc def\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 4), new vscode.Position(0, 4));
    await vscode.commands.executeCommand('keymotion.type', { text: 'C' });
    assert.strictEqual(doc.getText(), 'abc \n');
  });

  test('D deletes to end of line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abc def\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 4), new vscode.Position(0, 4));
    await vscode.commands.executeCommand('keymotion.type', { text: 'D' });
    assert.strictEqual(doc.getText(), 'abc \n');
  });

  test('Y yanks the whole line including line break', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'line1\nline2\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'Y' });
    const clip = await vscode.env.clipboard.readText();
    assert.strictEqual(clip, 'line1\n');
    assert.strictEqual(doc.getText(), 'line1\nline2\n');
  });

  test('p pastes characterwise after cursor', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abc\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    // Yank two chars with d2l then y (to use clipboard) or simply set clipboard
    await vscode.env.clipboard.writeText('XY');
    ed.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1));
    await vscode.commands.executeCommand('keymotion.type', { text: 'p' });
    assert.strictEqual(doc.getText(), 'aXYbc\n');
  });

  test('P pastes characterwise before cursor', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abc\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    await vscode.env.clipboard.writeText('Z');
    ed.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    await vscode.commands.executeCommand('keymotion.type', { text: 'P' });
    assert.strictEqual(doc.getText(), 'abZc\n');
  });

  test('p pastes linewise on next line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'lineA\nlineB\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.env.clipboard.writeText('XLINE\n');
    await vscode.commands.executeCommand('keymotion.type', { text: 'p' });
    assert.strictEqual(doc.getText(), 'lineA\nXLINE\nlineB\n');
  });

  test('P pastes linewise on current line above', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'lineA\nlineB\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    await vscode.env.clipboard.writeText('UP\n');
    await vscode.commands.executeCommand('keymotion.type', { text: 'P' });
    assert.strictEqual(doc.getText(), 'lineA\nUP\nlineB\n');
  });

  test('dd deletes current line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'a\nb\nc\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0)); // on 'b'
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    assert.strictEqual(doc.getText(), 'a\nc\n');
  });

  test('yy yanks current line including EOL', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one\ntwo\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'y' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'y' });
    const clip = await vscode.env.clipboard.readText();
    assert.strictEqual(clip, 'two\n');
  });

  test('cc clears line content and enters insert', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abc\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    await vscode.commands.executeCommand('keymotion.type', { text: 'c' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'c' });
    assert.strictEqual(doc.getText(), '\n');
  });

  test('r acts like yank+delete over a motion', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one two three\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'r' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'w' });
    const clip = await vscode.env.clipboard.readText();
    assert.strictEqual(clip.startsWith('one'), true);
    assert.strictEqual(doc.getText().trimEnd(), 'two three');
  });

  test('dW deletes one WORD (incl punctuation)', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo-bar baz\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'W' });
    assert.strictEqual(doc.getText(), ' baz\n');
  });

  test('3dB deletes three WORDs backwards', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'one two three-four five\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    // place at EOL
    const eol = doc.lineAt(0).range.end.character;
    ed.selection = new vscode.Selection(new vscode.Position(0, eol), new vscode.Position(0, eol));
    await vscode.commands.executeCommand('keymotion.type', { text: '3' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'B' });
    assert.strictEqual(doc.getText().trimEnd(), 'one');
  });

  test('ciW changes WORD under cursor', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo-bar baz\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    await vscode.commands.executeCommand('keymotion.type', { text: 'c' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'i' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'W' });
    assert.strictEqual(doc.getText(), ' baz\n');
  });

  test('daw deletes a word plus trailing spaces', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'hello   world\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 1));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'a' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'w' });
  assert.strictEqual(doc.getText(), 'world\n');
  });

  test('daW deletes a WORD plus trailing spaces', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo-bar   baz\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'a' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'W' });
  assert.strictEqual(doc.getText(), 'baz\n');
  });

  test('dfx deletes up to and including first x', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'foo x bar x baz\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'f' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'x' });
    assert.strictEqual(doc.getText(), ' bar x baz\n');
  });

  test('dtx deletes up to before first x', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'abcxdef\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 't' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'x' });
    assert.strictEqual(doc.getText(), 'xdef\n');
  });

  test('2dfx deletes through the second x', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'a x b x c x\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: '2' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'f' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'x' });
    assert.strictEqual(doc.getText(), ' c x\n');
  });

  test('dfx then ; repeats with operator', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'x1 y x2 y x3\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'f' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'y' });
    // now repeat same direction
    await vscode.commands.executeCommand('keymotion.type', { text: ';' });
    assert.strictEqual(doc.getText().trimEnd(), ' x3');
  });

  test('Fx and , backward delete including x then repeat opposite', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'a x b x c\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    const eol = doc.lineAt(0).range.end.character;
    ed.selection = new vscode.Selection(new vscode.Position(0, eol), new vscode.Position(0, eol));
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'F' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'x' });
    // repeat opposite direction using ,
    await vscode.commands.executeCommand('keymotion.type', { text: ',' });
  assert.strictEqual(doc.getText(), 'a \n');
  });

  test('gg with count moves to line and supports operator range', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'L1\nL2\nL3\nL4\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    // Place cursor on line 3
    ed.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 0));
    // Move to line 2 via count gg
    await vscode.commands.executeCommand('keymotion.type', { text: '2' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'g' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'g' });
    assert.strictEqual(ed.selection.active.line, 1);
    // Now delete from line 2 to line 4 using d G
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'G' });
    assert.strictEqual(doc.getText(), 'L1\n');
  });

  test('G with count moves to that line and dG deletes to that line', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const doc = await vscode.workspace.openTextDocument({ content: 'A\nB\nC\nD\nE\n', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await startAndFocus(doc);
    const ed = vscode.window.activeTextEditor!;
    // Start on line 1
    ed.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    // Move to line 4: 4G
    await vscode.commands.executeCommand('keymotion.type', { text: '4' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'G' });
    assert.strictEqual(ed.selection.active.line, 3);
    // From line 4, delete to line 2 using count on G via operator pending count should not interfere: d2G means delete to line 2
    await vscode.commands.executeCommand('keymotion.type', { text: 'd' });
    await vscode.commands.executeCommand('keymotion.type', { text: '2' });
    await vscode.commands.executeCommand('keymotion.type', { text: 'G' });
    // Remaining should be A\nE\n (deleted lines 2..4)
    assert.strictEqual(doc.getText(), 'A\nE\n');
  });
});
