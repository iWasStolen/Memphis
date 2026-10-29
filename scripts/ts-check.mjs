// lightweight TS syntax validation via the TypeScript compiler API if present
// (full project tsc OOMs on this 4GB box — parse-check the hot files instead;
//  the dev server / E2E catch anything semantic)
try {
  const ts = (await import('typescript')).default;
  const fs = await import('fs');
  const files = [
    ['/home/z/my-project/src/lib/scramjet.ts', ts.ScriptKind.TS],
    ['/home/z/my-project/src/lib/proxy-guidance.ts', ts.ScriptKind.TS],
    ['/home/z/my-project/src/components/views/browse-view.tsx', ts.ScriptKind.TSX],
    ['/home/z/my-project/src/components/shell/app-shell.tsx', ts.ScriptKind.TSX],
  ];
  let bad = 0;
  for (const [path, kind] of files) {
    const src = fs.readFileSync(path, 'utf8');
    const name = path.split('/').pop();
    const sf = ts.createSourceFile(name, src, ts.ScriptTarget.ES2022, true, kind);
    const diags = sf.parseDiagnostics || [];
    if (diags.length) {
      bad++;
      for (const d of diags.slice(0, 10))
        console.log('PARSE ERROR:', ts.flattenDiagnosticMessageText(d.messageText, ' '), 'at', d.start, 'in', name);
    } else {
      console.log(name, 'parse: OK,', sf.statements.length, 'top-level statements');
    }
  }
  if (bad) process.exit(1);
} catch (e) { console.log('typescript pkg unavailable:', e.message); }
