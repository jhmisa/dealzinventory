import QRCode from 'qrcode'

export interface LabelData {
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
    padding: 4px 8px;
    font-family: Arial, Helvetica, sans-serif;
    overflow: hidden;
  }
  .text-col {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    line-height: 1.3;
    overflow: hidden;
    word-break: break-word;
    padding-right: 4px;
    padding-top: 2px;
  }
  .right-col {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .code {
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .qr img { width: 0.6in; height: 0.6in; }
</style>
</head>
<body>
  ${description ? `<div class="text-col">${escapeHtml(description)}</div>` : ''}
  <div class="right-col">
    <div class="code">${escapeHtml(item_code)}</div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR" />
    </div>
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

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      iframe.contentWindow?.print()
      setTimeout(() => {
        iframe.remove()
        resolve()
      }, 1000)
    }, 250)
  })
}

export async function printItemLabels(items: LabelData[]): Promise<void> {
  if (items.length === 0) return
  if (items.length === 1) return printItemLabel(items[0])

  const qrDataUrls = await Promise.all(
    items.map((item) =>
      QRCode.toDataURL(item.item_code, {
        width: 150,
        margin: 0,
        errorCorrectionLevel: 'M',
      })
    )
  )

  const pages = items
    .map((item, i) => {
      const textCol = item.description
        ? `<div class="text-col">${escapeHtml(item.description)}</div>`
        : ''
      return `<div class="label${i < items.length - 1 ? ' page-break' : ''}">${textCol}<div class="right-col"><div class="code">${escapeHtml(item.item_code)}</div><div class="qr"><img src="${qrDataUrls[i]}" alt="QR" /></div></div></div>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: 2.25in 1.25in; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .label {
    width: 2.25in;
    height: 1.25in;
    display: flex;
    flex-direction: row;
    padding: 4px 8px;
    font-family: Arial, Helvetica, sans-serif;
    overflow: hidden;
  }
  .page-break { page-break-after: always; }
  .text-col {
    flex: 1;
    min-width: 0;
    font-size: 10px;
    line-height: 1.3;
    overflow: hidden;
    word-break: break-word;
    padding-right: 4px;
    padding-top: 2px;
  }
  .right-col {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .code {
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .qr img { width: 0.6in; height: 0.6in; }
</style>
</head>
<body>
${pages}
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

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      iframe.contentWindow?.print()
      setTimeout(() => {
        iframe.remove()
        resolve()
      }, 1000)
    }, 250)
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
