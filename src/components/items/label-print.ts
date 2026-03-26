import QRCode from 'qrcode'

interface LabelData {
  item_code: string
  description?: string
}

export async function printItemLabel({ item_code, description }: LabelData): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(item_code, {
    width: 150,
    margin: 0,
    errorCorrectionLevel: 'M',
  })

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: 2.25in 1.25in; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2.25in;
    height: 1.25in;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .text-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }
  .desc {
    font-size: 8px;
    line-height: 1.2;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .code {
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .qr { flex-shrink: 0; }
  .qr img { width: 0.85in; height: 0.85in; }
</style>
</head>
<body>
  <div class="text-col">
    ${description ? `<div class="desc">${escapeHtml(description)}</div>` : ''}
    <div class="code">${escapeHtml(item_code)}</div>
  </div>
  <div class="qr">
    <img src="${qrDataUrl}" alt="QR" />
  </div>
</body>
</html>`

  const existing = document.getElementById('label-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'label-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.left = '-9999px'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!iframeDoc) return
  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()

  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => iframe.remove(), 1000)
  }, 250)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
