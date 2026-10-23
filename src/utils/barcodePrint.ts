/**
 * barcodePrint.ts
 *
 * Generates a fully self-contained printable HTML document for barcode labels.
 *
 * ── WHY A BLOB URL INSTEAD OF A REACT ROUTE ──────────────────────────────
 *
 * Opening a React SPA route via window.open() forces the full app to bootstrap
 * (Supabase auth, context providers, JS bundle evaluation) before the barcode
 * is even painted. On Android, the OS print pipeline captures the page within
 * a tight window after the tab opens; if the content isn't stable by then, it
 * shows: "There was a problem printing the page."
 *
 * A blob: URL contains the ENTIRE document as static HTML + CSS + inline SVG
 * data URIs. Android Chrome renders it instantly with zero network requests or
 * JS execution, giving the print system a complete, stable document every time.
 *
 * ── WHY WE CAPTURE FROM THE DOM ──────────────────────────────────────────
 *
 * The barcode SVG is already fully rendered inside the barcode modal before the
 * user ever taps Print. We simply serialize that SVG to a data URI and embed N
 * copies of it into the blob document. This means:
 *   • No need for a separate barcode rendering library call
 *   • The output is pixel-identical to the on-screen preview
 *   • Works for both Code-128 (react-barcode) and QR (qrcode.react) since both
 *     produce <svg> elements
 */

export interface BarcodePrintOptions {
  /** Product name shown above the barcode. */
  name: string;
  /** Formatted price string (e.g. "AED 12.50"). Pass '' to omit. */
  price: string;
  /** The live <svg> element that is already rendered in the barcode modal. */
  svgElement: SVGElement;
  /** Number of label copies to include in the document (1–100). */
  quantity: number;
}

const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 30;
const LABEL_PADDING_MM = 1.5;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Serializes a live SVG element to a base64-encoded data URI.
 * Ensures the SVG has the required xmlns attribute before encoding.
 */
function svgToDataUri(svg: SVGElement): string {
  let serialized = new XMLSerializer().serializeToString(svg);

  // Guarantee the XML namespace is present (some browsers omit it).
  if (!serialized.includes('xmlns=')) {
    serialized = serialized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // btoa only handles Latin-1; use encodeURIComponent → unescape trick for safety.
  const base64 = btoa(unescape(encodeURIComponent(serialized)));
  return `data:image/svg+xml;base64,${base64}`;
}

/** Basic HTML entity escaper to prevent XSS inside the generated document. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function buildPrintHtml(options: BarcodePrintOptions, svgDataUri: string): string {
  const { name, price, quantity } = options;

  const labelHtml = Array.from({ length: quantity })
    .map(
      (_, i) => `
    <section class="label-page">
      <div class="label" aria-label="Label ${i + 1}">
        <div class="label-header">
          <p class="item-name">${escapeHtml(name)}</p>
          ${price ? `<p class="item-price">${escapeHtml(price)}</p>` : ''}
        </div>
        <div class="barcode-area">
          <img class="barcode-img" src="${svgDataUri}" alt="Barcode for ${escapeHtml(name)}" />
        </div>
      </div>
    </section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Print Labels – ${escapeHtml(name)}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      /* Force exact colour rendering on Android print. */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /*
     * ── Page setup ──
     * Exact label page size to keep every copy aligned to one physical label.
     */
    @page {
      size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;
      margin: 0;
    }

    .page {
      width: ${LABEL_WIDTH_MM}mm;
      margin: 0;
      padding: 0;
    }

    .label-page {
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }

    .label-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .label {
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: stretch;
      padding: ${LABEL_PADDING_MM}mm;
      background: #ffffff;
      overflow: hidden;
    }

    .label-header {
      flex: 0 0 auto;
      text-align: center;
    }

    .item-name {
      font-weight: 700;
      font-size: 10pt;
      line-height: 1.05;
      max-height: 8.5mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }

    .item-price {
      margin-top: 0.5mm;
      font-size: 8pt;
      font-weight: 700;
      text-align: center;
      line-height: 1;
      color: #000000;
    }

    .barcode-area {
      flex: 1 1 auto;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      min-height: 0;
      padding-top: 1mm;
    }

    .barcode-img {
      width: 100%;
      max-width: ${LABEL_WIDTH_MM - LABEL_PADDING_MM * 2}mm;
      max-height: 15.5mm;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  <div class="page">
${labelHtml}
  </div>
  <script>
    /*
     * We wait for the 'load' event (which fires after all <img> resources are
     * decoded) rather than DOMContentLoaded, because the SVG data-URI images
     * still go through the browser's image decode pipeline.
     *
     * The 500 ms delay gives Android's WebView compositor time to flush the
     * first paint before the print system captures the page.
     */
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 500);
    });
  </script>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a self-contained print document from the live barcode SVG and opens
 * it in a new tab as a blob: URL.
 *
 * @returns `true` if the new tab was opened successfully; `false` if the
 *          browser blocked the popup.
 */
export function openBarcodePrintBlob(options: BarcodePrintOptions): boolean {
  const { svgElement } = options;

  // 1 – Capture the rendered SVG as a data URI.
  const svgDataUri = svgToDataUri(svgElement);

  // 2 – Build the fully self-contained HTML document.
  const html = buildPrintHtml(options, svgDataUri);

  // 3 – Create a blob: URL and open it.
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const win = window.open(blobUrl, '_blank');

  // Revoke after a generous delay so the opened tab has time to fully load
  // the resource before the URL is invalidated.
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);

  return Boolean(win);
}
