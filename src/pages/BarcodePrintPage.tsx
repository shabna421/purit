import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Barcode from 'react-barcode';
import { QRCodeCanvas } from 'qrcode.react';

function decodeParam(value: string | null) {
  return value ? decodeURIComponent(value) : '';
}

function nextPaintFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForDocumentFonts() {
  if ('fonts' in document && 'ready' in document.fonts) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.error('Failed while waiting for fonts:', error);
    }
  }
}

async function waitForImages(root: HTMLElement | null) {
  if (!root) return;

  const images = Array.from(root.querySelectorAll('img'));
  const pending = images.filter((image) => !image.complete || image.naturalWidth === 0);

  if (pending.length === 0) return;

  await Promise.all(
    pending.map(
      (image) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        }),
    ),
  );
}

export default function BarcodePrintPage() {
  const [searchParams] = useSearchParams();
  const printRootRef = React.useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = React.useState<'preparing' | 'ready'>('preparing');

  const name = decodeParam(searchParams.get('name'));
  const price = decodeParam(searchParams.get('price'));
  const barcode = decodeParam(searchParams.get('barcode'));
  const format = searchParams.get('format') === 'qrcode' ? 'qrcode' : 'code128';
  const quantityValue = Number.parseInt(searchParams.get('quantity') || '1', 10);
  const quantity = Number.isFinite(quantityValue) ? Math.min(Math.max(quantityValue, 1), 100) : 1;
  const copies = Array.from({ length: quantity }, (_, index) => index);

  React.useEffect(() => {
    let cancelled = false;

    const prepareAndPrint = async () => {
      await waitForDocumentFonts();
      await waitForImages(printRootRef.current);
      await nextPaintFrame();

      if (cancelled) return;

      setStatus('ready');

      // Let the browser commit the ready state before opening print preview.
      await nextPaintFrame();

      if (cancelled) return;

      try {
        window.print();
      } catch (error) {
        console.error('Barcode print page failed to open print dialog:', error);
      }
    };

    void prepareAndPrint();

    const handleAfterPrint = () => {
      window.close();
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  return (
    <>
      <style>{`
        :root {
          color-scheme: light only;
        }

        @page {
          size: 58mm auto;
          margin: 0;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 700;
        }

        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-shell {
          min-height: 100vh;
          background: #ffffff;
          padding: 0;
        }

        .print-status {
          padding: 12px;
          text-align: center;
          font-size: 14px;
          line-height: 1.4;
        }

        .label-sheet {
          width: 58mm;
          margin-left: -1mm;
          padding: 1mm 0 0 0;
        }

        .label-copy {
          width: 60mm;
          margin: 0 0 1.5mm 0;
          padding: 2mm 2mm 1.5mm 2mm;
          background: #ffffff;
          text-align: center;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .label-name {
          margin: 0 0 0.5mm 0;
          font-size: 17pt;
          line-height: 1.05;
          font-weight: 700;
        }

        .label-price {
          margin: 0 0 1mm 0;
          font-size: 15pt;
          line-height: 1.05;
          font-weight: 700;
        }

        .barcode-wrap,
        .qr-wrap {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
        }

        .barcode-wrap img,
        .qr-wrap canvas {
          display: block;
          max-width: 100%;
        }

        @media print {
          .print-status {
            display: none !important;
          }

          .print-shell {
            min-height: auto;
          }
        }
      `}</style>

      <div className="print-shell">
        {status === 'preparing' ? <div className="print-status">Preparing label preview…</div> : null}

        <div ref={printRootRef} className="label-sheet">
          {copies.map((copyIndex) => (
            <section key={`${barcode}-${copyIndex}`} className="label-copy">
              <p className="label-name">{name}</p>
              {price ? <p className="label-price">{price}</p> : null}

              {format === 'qrcode' ? (
                <div className="qr-wrap">
                  <QRCodeCanvas value={barcode} size={120} level="M" includeMargin />
                </div>
              ) : (
                <div className="barcode-wrap">
                  <Barcode
                    value={barcode}
                    renderer="img"
                    width={1.8}
                    height={72}
                    fontSize={18}
                    margin={0}
                    textMargin={6}
                    displayValue
                    background="#ffffff"
                    lineColor="#000000"
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
