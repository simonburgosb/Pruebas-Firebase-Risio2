// A single blank page with no remote resources, served only by browser tests.
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 480] /Resources << >> >>'
];
let pdf = '%PDF-1.4\n';
const offsets = objects.map((object, i) => {
  const offset = pdf.length;
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  return String(offset).padStart(10, '0') + ' 00000 n \n';
});
const xref = pdf.length;
pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
export const libraryPdfFixture = Buffer.from(pdf, 'ascii');
