import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "node:fs";
mkdirSync(".qa", { recursive: true });
const pdf = new PDFDocument({ size: "A4" });
pdf.pipe(createWriteStream(".qa/two-pages.pdf"));
pdf
  .fontSize(36)
  .text("SYNTHETIC PARISH REGISTER")
  .moveDown()
  .fontSize(24)
  .text("Clara Example\nBaptism date: 14 March 1998\nPage one");
pdf
  .addPage()
  .fontSize(36)
  .text("SYNTHETIC SECOND PAGE")
  .moveDown()
  .fontSize(24)
  .text("Noah Example\nBaptism date: 20 April 1999\nPage two");
pdf.end();
