import type { VercelRequest, VercelResponse } from '@vercel/node'
import https from 'https'

const YAMATO_URL = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko'
const API_KEY = process.env.YAMATO_PROXY_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-key')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate API key
  if (!API_KEY || req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { formBody } = req.body as { formBody: string }
  if (!formBody) {
    return res.status(400).json({ error: 'Missing formBody' })
  }

  try {
    const html = await fetchYamato(formBody)
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ html })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Yamato fetch failed'
    return res.status(502).json({ error: message })
  }
}

function fetchYamato(formBody: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reqOptions: https.RequestOptions = {
      hostname: 'toi.kuronekoyamato.co.jp',
      path: '/cgi-bin/tneko',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody).toString(),
      },
      // Yamato's server only supports RSA key exchange (AES128-GCM-SHA256)
      // which Deno/rustls can't handle — Node.js/OpenSSL can
      ciphers: 'AES128-GCM-SHA256',
    }

    const request = https.request(reqOptions, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const buf = Buffer.concat(chunks)
        // Try UTF-8 first; if garbled, decode as Shift-JIS
        const utf8 = buf.toString('utf-8')
        if (utf8.includes('\ufffd')) {
          const decoder = new TextDecoder('shift-jis')
          resolve(decoder.decode(buf))
        } else {
          resolve(utf8)
        }
      })
    })
    request.on('error', reject)
    request.write(formBody)
    request.end()
  })
}
