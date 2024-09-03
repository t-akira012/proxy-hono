import { Hono } from "hono"

interface Env {
  PROXY_URL: string
}

const app = new Hono<{ Bindings: Env }>()

function isHtmlResponse(contentType: string): boolean {
  return contentType.includes("text/html")
}

function replaceImageSrc(
  response: string,
  proxyUrlPrefix: string,
): string {
  return response.replace(/src(|set)\="https:\/\/[^"]+"/g, (match) => {
    const srcPattern = /src(|set)="https:\/\/[^"]+"/
    const srcMatch = match.match(srcPattern)

    let result = match // 初期値は元のmatch
    if (srcMatch) {
      const originalUrl = srcMatch[0].match(/https:\/\/[^"]+/)?.[0]
      if (originalUrl) {
        const proxiedUrl = `${proxyUrlPrefix}${encodeURIComponent(originalUrl)}`
        result = match.replace(srcPattern, `src="${proxiedUrl}"`)
      }
    }

    return result
  })
}

// ex. http://localhost:8787/?u=https://example.com
app.get("/", async (c) => {
  const targetUrl = c.req.query("u")

  if (!targetUrl) {
    return c.text("query parameter not found", 400)
  }

  try {
    const response = await fetch(targetUrl)

    // ステータスコードを設定
    if (!response.ok) {
      return c.text("proxy error")
    }

    // レスポンスヘッダーの設定
    response.headers.forEach((value, key) => {
      c.header(key, value)
    })

    // レスポンスボディを取得し、レスポンスとして返す
    const responseClone = response.clone()
    const responseText = await responseClone.text()

    // レスポンスがHTMLであるかを確認し、必要であればimgタグのsrc属性を置換
    const contentType = response.headers.get("content-type") || ""

    if (isHtmlResponse(contentType)) {
      const proxyUrl = c.env.PROXY_URL
      const replacedHtml = replaceImageSrc(
        responseText,
        `${proxyUrl}?u=`,
      )
      return c.html(replacedHtml)
    } else {
      // HTML以外の場合はそのままバイナリデータとして返却
      const body = await response.arrayBuffer()
      return c.body(body)
    }
  } catch (error) {
    console.error("Fetch error:", error)
    return c.text("proxy error", 500)
  }
})

export default app
