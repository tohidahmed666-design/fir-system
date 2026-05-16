const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50 });
const outputPath = path.join(__dirname, 'Project_Report.pdf');
const inputPath = 'C:\\Users\\Tohid Admin\\.gemini\\antigravity\\brain\\a8243c47-af13-403c-b44a-26cfc46fb153\\PROJECT_DOCUMENTATION.md';

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Styling
const titleSize = 24;
const headingSize = 18;
const bodySize = 12;

try {
    const content = fs.readFileSync(inputPath, 'utf8');
    const lines = content.split('\n');

    lines.forEach(line => {
        if (line.startsWith('# ')) {
            doc.fontSize(titleSize).fillColor('#1e3c72').text(line.replace('# ', '').trim(), { underline: true });
            doc.moveDown();
        } else if (line.startsWith('## ')) {
            doc.fontSize(headingSize).fillColor('#2a5298').text(line.replace('## ', '').trim());
            doc.moveDown(0.5);
        } else if (line.startsWith('### ')) {
            doc.fontSize(bodySize + 2).fillColor('#333').text(line.replace('### ', '').trim(), { bold: true });
            doc.moveDown(0.2);
        } else if (line.trim().startsWith('- ')) {
            doc.fontSize(bodySize).fillColor('#444').text('  • ' + line.trim().substring(2));
        } else if (line.trim() === '---') {
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ccc');
            doc.moveDown();
        } else if (line.trim() !== '') {
            doc.fontSize(bodySize).fillColor('#333').text(line.trim());
            doc.moveDown(0.5);
        } else {
            doc.moveDown(0.2);
        }
    });

    doc.end();
    console.log('PDF generated successfully at ' + outputPath);
} catch (err) {
    console.error('Error reading documentation file:', err);
}

stream.on('finish', () => {
    process.exit(0);
});
