// lightweight TS syntax validation via the TypeScript compiler API if present
try {
  const ts = (await import('typescript')).default;
  const fs = await import('fs');
  const src = fs.readFileSync('/home/z/my-project/src/lib/scramjet.ts', 'utf8');
  const sf = ts.createSourceFile('scramjet.ts', src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics || [];
  if (diags.length) {
    for (const d of diags.slice(0, 10))
      console.log('PARSE ERROR:', ts.flattenDiagnosticMessageText(d.messageText, ' '), 'at', d.start);
    process.exit(1);
  }
  console.log('scramjet.ts parse: OK,', sf.statements.length, 'top-level statements');
} catch (e) { console.log('typescript pkg unavailable:', e.message); }
