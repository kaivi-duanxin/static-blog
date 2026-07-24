import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import defaultLikes from '@/config/likes.json'

export const runtime = 'nodejs'

type LikesMap = Record<string, number>
type LikeProvider = 'local' | 'supabase' | 'memory'

const DEFAULT_BASE_COUNT = 520
const LIKES_FILE = path.join(process.cwd(), 'src/config/likes.json')
const SUPABASE_TIMEOUT_MS = 8000

function getBaseCount() {
	const parsed = Number(process.env.LIKES_BASE_COUNT)
	return Number.isFinite(parsed) ? parsed : DEFAULT_BASE_COUNT
}

function isLocalSaveEnabled() {
	return process.env.NEXT_PUBLIC_LOCAL_SAVE === 'true'
}

function normalizeSlug(value: string | null) {
	const slug = (value || 'home').trim()
	return slug || 'home'
}

function normalizeCount(value: unknown, fallback = getBaseCount()) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function getSupabaseConfig() {
	const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
	const table = process.env.SUPABASE_LIKES_TABLE || 'post_likes'

	if (!url || !key) return null

	return {
		url: url.replace(/\/$/, ''),
		key,
		table
	}
}

function getProvider(): LikeProvider {
	const forcedProvider = process.env.LIKES_PROVIDER
	if (forcedProvider === 'local' || forcedProvider === 'supabase' || forcedProvider === 'memory') return forcedProvider
	if (isLocalSaveEnabled()) return 'local'
	if (getSupabaseConfig()) return 'supabase'
	return 'memory'
}

async function fetchWithTimeout(url: string, init: RequestInit) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)

	try {
		return await fetch(url, {
			...init,
			signal: controller.signal
		})
	} finally {
		clearTimeout(timeout)
	}
}

async function readLocalLikes(): Promise<LikesMap> {
	try {
		const content = await fs.readFile(LIKES_FILE, 'utf-8')
		const data = JSON.parse(content)
		return typeof data === 'object' && data ? data : {}
	} catch {
		return defaultLikes as LikesMap
	}
}

async function writeLocalLikes(likes: LikesMap) {
	await fs.mkdir(path.dirname(LIKES_FILE), { recursive: true })
	await fs.writeFile(LIKES_FILE, JSON.stringify(likes, null, '\t'))
}

async function getLocalCount(slug: string) {
	const likes = await readLocalLikes()
	const count = normalizeCount(likes[slug])

	if (likes[slug] !== count && isLocalSaveEnabled()) {
		likes[slug] = count
		await writeLocalLikes(likes)
	}

	return count
}

async function setLocalCount(slug: string, count: number) {
	const likes = await readLocalLikes()
	likes[slug] = count
	await writeLocalLikes(likes)
	return count
}

async function getSupabaseCount(slug: string) {
	const config = getSupabaseConfig()
	if (!config) return getBaseCount()

	const params = new URLSearchParams({
		slug: `eq.${slug}`,
		select: 'count',
		limit: '1'
	})

	const res = await fetchWithTimeout(`${config.url}/rest/v1/${config.table}?${params.toString()}`, {
		headers: {
			apikey: config.key,
			Authorization: `Bearer ${config.key}`
		},
		cache: 'no-store'
	})

	if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`)

	const rows = await res.json().catch(() => [])
	const count = normalizeCount(rows?.[0]?.count)

	if (!rows?.length) {
		await setSupabaseCount(slug, count)
	}

	return count
}

async function setSupabaseCount(slug: string, count: number) {
	const config = getSupabaseConfig()
	if (!config) return count

	const res = await fetchWithTimeout(`${config.url}/rest/v1/${config.table}`, {
		method: 'POST',
		headers: {
			apikey: config.key,
			Authorization: `Bearer ${config.key}`,
			'Content-Type': 'application/json',
			Prefer: 'resolution=merge-duplicates'
		},
		body: JSON.stringify({ slug, count })
	})

	if (!res.ok) throw new Error(`Supabase write failed: ${res.status}`)
	return count
}

async function getCount(slug: string) {
	const provider = getProvider()
	if (provider === 'supabase') return getSupabaseCount(slug)
	if (provider === 'local') return getLocalCount(slug)
	return normalizeCount((defaultLikes as LikesMap)[slug])
}

async function setCount(slug: string, count: number) {
	const provider = getProvider()
	if (provider === 'supabase') return setSupabaseCount(slug, count)
	if (provider === 'local') return setLocalCount(slug, count)
	return count
}

export async function GET(req: NextRequest) {
	try {
		const slug = normalizeSlug(req.nextUrl.searchParams.get('slug'))
		const count = await getCount(slug)
		return NextResponse.json({ slug, count, provider: getProvider() })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to read likes'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function POST(req: NextRequest) {
	try {
		const slug = normalizeSlug(req.nextUrl.searchParams.get('slug'))
		const current = await getCount(slug)
		const count = await setCount(slug, current + 1)
		return NextResponse.json({ slug, count, provider: getProvider() })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to update likes'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function PATCH(req: NextRequest) {
	try {
		if (!isLocalSaveEnabled() && req.headers.get('x-likes-admin-token') !== process.env.LIKES_ADMIN_TOKEN) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await req.json().catch(() => ({}))
		const slug = normalizeSlug(body.slug)
		const count = normalizeCount(body.count)
		const savedCount = await setCount(slug, count)

		return NextResponse.json({ slug, count: savedCount, provider: getProvider() })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to set likes'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
