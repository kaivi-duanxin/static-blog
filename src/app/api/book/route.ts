import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_BOOK_URL = 'https://staticblog.s3.bitiful.net/Kaivi-books.pdf'

function getBookUrl() {
	return process.env.KAIVI_BOOK_URL || DEFAULT_BOOK_URL
}

function copyBookHeaders(source: Headers) {
	const headers = new Headers()
	for (const name of ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
		const value = source.get(name)
		if (value) headers.set(name, value)
	}
	headers.set('Accept-Ranges', 'bytes')
	headers.set('Cache-Control', 'public, max-age=3600')
	headers.set('Content-Disposition', 'inline; filename="Kaivi-books.pdf"')
	headers.set('X-Content-Type-Options', 'nosniff')
	return headers
}

function unavailableResponse() {
	return NextResponse.json({ error: 'Book source is unavailable' }, { status: 502 })
}

async function requestBook(method: 'GET' | 'HEAD', range?: string | null) {
	const headers = new Headers()
	if (range) headers.set('Range', range)

	return fetch(getBookUrl(), {
		method,
		headers,
		cache: 'no-store'
	})
}

export async function HEAD() {
	try {
		const upstream = await requestBook('HEAD')
		if (!upstream.ok) return unavailableResponse()
		return new Response(null, {
			status: upstream.status,
			headers: copyBookHeaders(upstream.headers)
		})
	} catch (error) {
		console.error('Failed to read book metadata', error)
		return unavailableResponse()
	}
}

export async function GET(request: NextRequest) {
	try {
		const range = request.headers.get('range')
		const upstream = await requestBook('GET', range)
		if (!upstream.ok && upstream.status !== 416) return unavailableResponse()

		return new Response(upstream.body, {
			status: upstream.status,
			headers: copyBookHeaders(upstream.headers)
		})
	} catch (error) {
		console.error('Failed to stream book content', error)
		return unavailableResponse()
	}
}
