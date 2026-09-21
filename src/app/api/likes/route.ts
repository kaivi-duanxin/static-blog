import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import defaultLikes from '@/config/likes.json'

export const runtime = 'nodejs'

type LikesMap = Record<string, number>
type LikeProvider = 'd1' | 'local' | 'supabase' | 'memory'

type D1PreparedStatement = {
	bind: (...values: unknown[]) => D1PreparedStatement
	first: <T = Record<string, unknown>>() => Promise<T | null>
	run: () => Promise<unknown>
}

type LikesDatabase = {
	prepare: (query: string) => D1PreparedStatement
}

type LikeBackend = {
	provider: LikeProvider
	db?: LikesDatabase
}

const DEFAULT_BASE_COUNT = 520
const LIKES_FILE = path.join(process.cwd(), 'src/config/likes.json')
const SUPABASE_TIMEOUT_MS = 8000

function getBaseCount() {
	const parsed = Number(process.env.LIKES_BASE_COUNT)
	return Number.isFinite(parsed) ? parsed : DEFAULT_BASE_COUNT
}

function isLocalSaveEnabled() {
	return process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOCAL_SAVE === 'true'
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

async function getD1Database() {
	try {
		const { env } = await getCloudflareContext({ async: true })
		return (env as CloudflareEnv & { LIKES_DB?: LikesDatabase }).LIKES_DB ?? null
	} catch {
		return null
	}
}

async function getBackend(): Promise<LikeBackend> {
	const forcedProvider = process.env.LIKES_PROVIDER
	if (forcedProvider === 'local' || forcedProvider === 'supabase' || forcedProvider === 'memory') {
		return { provider: forcedProvider }
	}

	if (isLocalSaveEnabled()) return { provider: 'local' }

	const db = await getD1Database()
	if (db) return { provider: 'd1', db }
	if (forcedProvider === 'd1') throw new Error('LIKES_DB binding is not available')
	if (getSupabaseConfig()) return { provider: 'supabase' }
	return { provider: 'memory' }
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

function getInitialCount(slug: string) {
	return normalizeCount((defaultLikes as LikesMap)[slug])
}

async function createD1Table(db: LikesDatabase) {
	await db
		.prepare('CREATE TABLE IF NOT EXISTS post_likes (slug TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 520)')
		.run()
}

async function getD1Count(db: LikesDatabase, slug: string) {
	await createD1Table(db)
	await db.prepare('INSERT OR IGNORE INTO post_likes (slug, count) VALUES (?, ?)').bind(slug, getInitialCount(slug)).run()
	const row = await db.prepare('SELECT count FROM post_likes WHERE slug = ?').bind(slug).first<{ count: number }>()
	return normalizeCount(row?.count, getInitialCount(slug))
}

async function incrementD1Count(db: LikesDatabase, slug: string) {
	await createD1Table(db)
	const row = await db
		.prepare(
			'INSERT INTO post_likes (slug, count) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET count = count + 1 RETURNING count'
		)
		.bind(slug, getInitialCount(slug) + 1)
		.first<{ count: number }>()
	return normalizeCount(row?.count, getInitialCount(slug) + 1)
}

async function setD1Count(db: LikesDatabase, slug: string, count: number) {
	await createD1Table(db)
	await db
		.prepare('INSERT INTO post_likes (slug, count) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET count = excluded.count')
		.bind(slug, count)
		.run()
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

async function getCount(backend: LikeBackend, slug: string) {
	if (backend.provider === 'd1' && backend.db) return getD1Count(backend.db, slug)
	if (backend.provider === 'supabase') return getSupabaseCount(slug)
	if (backend.provider === 'local') return getLocalCount(slug)
	return getInitialCount(slug)
}

async function setCount(backend: LikeBackend, slug: string, count: number) {
	if (backend.provider === 'd1' && backend.db) return setD1Count(backend.db, slug, count)
	if (backend.provider === 'supabase') return setSupabaseCount(slug, count)
	if (backend.provider === 'local') return setLocalCount(slug, count)
	return count
}

export async function GET(req: NextRequest) {
	try {
		const slug = normalizeSlug(req.nextUrl.searchParams.get('slug'))
		const backend = await getBackend()
		const count = await getCount(backend, slug)
		return NextResponse.json({ slug, count, provider: backend.provider })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to read likes'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function POST(req: NextRequest) {
	try {
		const slug = normalizeSlug(req.nextUrl.searchParams.get('slug'))
		const backend = await getBackend()
		const count =
			backend.provider === 'd1' && backend.db
				? await incrementD1Count(backend.db, slug)
				: await setCount(backend, slug, (await getCount(backend, slug)) + 1)
		return NextResponse.json({ slug, count, provider: backend.provider })
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
		const backend = await getBackend()
		const savedCount = await setCount(backend, slug, count)

		return NextResponse.json({ slug, count: savedCount, provider: backend.provider })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to set likes'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
