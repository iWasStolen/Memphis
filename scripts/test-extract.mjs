/* quick smoke test of extraction libs (pdf-parse v2, mammoth, xlsx, adm-zip) */
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import fs from "node:fs";

async function main() {
  /* 1. pdf-parse v2 */
  try {
    const buf = fs.readFileSync("/home/z/my-project/scripts/test/sample.pdf");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    console.log("PDF text len:", result.text.length, JSON.stringify(result.text.slice(0, 120)));
    await parser.destroy();
  } catch (e) {
    console.log("PDF FAIL:", e instanceof Error ? e.message : e);
  }

  /* 2. mammoth docx — build one via zip */
  try {
    const zip = new AdmZip();
    zip.addFile(
      "[Content_Types].xml",
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)
    );
    zip.addFile(
      "_rels/.rels",
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
    );
    zip.addFile(
      "word/document.xml",
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from the docx test file.</w:t></w:r></w:p></w:body></w:document>`)
    );
    fs.writeFileSync("/home/z/my-project/scripts/test/sample.docx", zip.toBuffer());
    const r = await mammoth.extractRawText({ path: "/home/z/my-project/scripts/test/sample.docx" });
    console.log("DOCX text:", JSON.stringify(r.value.slice(0, 80)));
  } catch (e) {
    console.log("DOCX FAIL:", e instanceof Error ? e.message : e);
  }

  /* 3. xlsx */
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "score"],
      ["alice", 90],
      ["bob", 85],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "/home/z/my-project/scripts/test/sample.xlsx");
    const wb2 = XLSX.readFile("/home/z/my-project/scripts/test/sample.xlsx");
    const csv = XLSX.utils.sheet_to_csv(wb2.Sheets[wb2.SheetNames[0]]);
    console.log("XLSX csv:", JSON.stringify(csv.slice(0, 60)));
  } catch (e) {
    console.log("XLSX FAIL:", e instanceof Error ? e.message : e);
  }

  /* 4. adm-zip listing */
  try {
    const z = new AdmZip("/home/z/my-project/scripts/test/sample.docx");
    console.log("ZIP entries:", z.getEntries().length);
  } catch (e) {
    console.log("ZIP FAIL:", e instanceof Error ? e.message : e);
  }
}

main();
