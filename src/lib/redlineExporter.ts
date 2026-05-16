import { diffWords } from 'diff';
import {
  Document, Paragraph, TextRun, Packer, HeadingLevel,
  AlignmentType, BorderStyle, ShadingType, Header, Footer
} from 'docx';

interface RedlineOptions {
  documentName: string;
  author?: string;
  date?: Date;
}

/**
 * Detects if a paragraph string likely represents a legal section header.
 */
function isHeader(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Patterns like "1. INTRODUCTION", "SECTION 5", "ARTICLE II", or "ANNEX A"
  const headerPatterns = [
    /^\d+\.?\s+[A-Z\s]{3,}$/,          // 1. HEADER
    /^(SECTION|ARTICLE|ANNEX|SCHEDULE)\s+[A-Z0-9]+/i, // SECTION 1
    /^[A-Z\s]{5,}$/                    // ALL CAPS HEADER
  ];
  return headerPatterns.some(p => p.test(t));
}

/**
 * Generates a Word (.docx) file with native-feeling Track Changes markup and section structure.
 */
export async function generateRedlineDocx(
  originalText: string,
  optimizedText: string,
  options: RedlineOptions
): Promise<Blob> {
  const author = options.author || 'Smart Charter AI';
  const date = options.date || new Date();
  
  const paragraphs: Paragraph[] = [];

  // ── Institutional Header ──────────────────────────────────────────────────
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "SMART CHARTER",
          bold: true,
          size: 20,
          color: "0F172A",
        }),
        new TextRun({
          text: " | INSTITUTIONAL AUDIT PROTOCOL",
          size: 16,
          color: "64748B",
        }),
      ],
      spacing: { after: 800 },
    })
  );

  // ── Document Title ────────────────────────────────────────────────────────
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: options.documentName.toUpperCase(),
          bold: true,
          size: 36, // Word sizes are in half-points, so 36 = 18pt
          color: "0F172A",
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          color: '64748B',
          size: 20, // 10pt
          italics: true,
        }),
      ],
      spacing: { after: 1200 },
    })
  );

  // ── Process Content with Section Detection ────────────────────────────────
  const originalParas = originalText.split('\n\n').filter(p => p.trim());
  const optimizedParas = optimizedText.split('\n\n').filter(p => p.trim());
  const maxLen = Math.max(originalParas.length, optimizedParas.length);

  for (let i = 0; i < maxLen; i++) {
    const origPara = originalParas[i] ?? '';
    const optPara = optimizedParas[i] ?? '';

    // Handle Headers
    if (isHeader(optPara)) {
      paragraphs.push(
        new Paragraph({
          text: optPara.toUpperCase(),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    if (origPara === optPara) {
      // Unchanged paragraph
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: origPara, size: 22, font: "Times New Roman" })],
          spacing: { after: 250 },
        })
      );
      continue;
    }

    // Compute word-level diff for changes
    const changes = diffWords(origPara, optPara);
    const runs: TextRun[] = [];

    for (const change of changes) {
      if (change.removed) {
        // Deletion — red strikethrough
        runs.push(
          new TextRun({
            text: change.value,
            strike: true,
            color: 'B91C1C', // Dark Red
            shading: { type: ShadingType.SOLID, color: 'FEE2E2', fill: 'FEE2E2' },
            size: 22,
            font: "Times New Roman"
          })
        );
      } else if (change.added) {
        // Insertion — blue underline
        runs.push(
          new TextRun({
            text: change.value,
            underline: { type: BorderStyle.SINGLE, color: '1D4ED8' },
            color: '1D4ED8', // Dark Blue
            shading: { type: ShadingType.SOLID, color: 'DBEAFE', fill: 'DBEAFE' },
            size: 22,
            font: "Times New Roman"
          })
        );
      } else {
        // Unchanged text
        runs.push(new TextRun({ text: change.value, size: 22, font: "Times New Roman" }));
      }
    }

    paragraphs.push(
      new Paragraph({
        children: runs,
        spacing: { after: 250 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 18, color: '1D4ED8', space: 12 },
        },
      })
    );
  }

  // ── Build Document with Styles and Metadata ────────────────────────────────
  const doc = new Document({
    creator: author,
    title: options.documentName,
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 22,
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440, // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      children: paragraphs,
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Page ",
                  size: 16,
                  color: "94A3B8",
                }),
                new TextRun({
                  children: ["PAGE_NUMBER"],
                  size: 16,
                  color: "94A3B8",
                }),
                new TextRun({
                  text: " | Certified by Smart Charter Intelligence Engine",
                  size: 16,
                  color: "94A3B8",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
    }],
  });

  return await Packer.toBlob(doc);
}

/** Triggers a browser download of the redline .docx */
export function downloadRedline(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanName = fileName.replace(/\.(pdf|docx|txt)$/i, '');
  a.download = `${cleanName}_REDLINE.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
