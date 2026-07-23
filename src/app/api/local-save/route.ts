import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

type Encoding = 'base64' | 'utf-8'

type WriteItem = {
	path: string
	content?: string
	encoding?: Encoding
	delete?: boolean
}

function isLocalSaveEnabled() {
	return process.env.NEXT_PUBLIC_LOCAL_SAVE === 'true'
}

function resolveRepoPath(repoPath: string) {
	if (!repoPath || path.isAbsolute(repoPath) || repoPath.includes('\0')) {
		throw new Error('Invalid path')
	}

	const root = process.cwd()
	const normalized = repoPath.replace(/\\/g, '/')
	const target = path.resolve(root, normalized)
	const relative = path.relative(root, target)

	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error('Path escapes project root')
	}

	return target
}

async function writeFile(item: WriteItem) {
	const target = resolveRepoPath(item.path)

	if (item.delete) {
		await fs.rm(target, { force: true, recursive: true })
		return
	}

	if (typeof item.content !== 'string') {
		throw new Error(`Missing content for ${item.path}`)
	}

	await fs.mkdir(path.dirname(target), { recursive: true })
	const encoding = item.encoding || 'utf-8'
	const data = encoding === 'base64' ? Buffer.from(item.content, 'base64') : item.content
	await fs.writeFile(target, data)
}

async function listFiles(repoPath: string): Promise<string[]> {
	const root = process.cwd()
	const target = resolveRepoPath(repoPath)

	try {
		const stat = await fs.stat(target)
		if (stat.isFile()) return [path.relative(root, target).replace(/\\/g, '/')]
		if (!stat.isDirectory()) return []
	} catch {
		return []
	}

	const files: string[] = []

	async function walk(dir: string) {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const child = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				await walk(child)
			} else if (entry.isFile()) {
				files.push(path.relative(root, child).replace(/\\/g, '/'))
			}
		}
	}

	await walk(target)
	return files
}

export async function POST(req: NextRequest) {
	if (!isLocalSaveEnabled()) {
		return NextResponse.json({ error: 'Local save is disabled' }, { status: 403 })
	}

	try {
		const body = await req.json()

		if (body.action === 'writeFile') {
			await writeFile(body.item)
			return NextResponse.json({ ok: true })
		}

		if (body.action === 'batchWrite') {
			const items = Array.isArray(body.items) ? body.items : []
			for (const item of items) await writeFile(item)
			return NextResponse.json({ ok: true })
		}

		if (body.action === 'readFile') {
			const target = resolveRepoPath(body.path)
			try {
				const content = await fs.readFile(target, 'utf-8')
				return NextResponse.json({ content })
			} catch {
				return NextResponse.json({ content: null })
			}
		}

		if (body.action === 'listFiles') {
			const files = await listFiles(body.path)
			return NextResponse.json({ files })
		}

		return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Local save failed'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
