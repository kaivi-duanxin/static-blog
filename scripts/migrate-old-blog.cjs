const fs = require('fs')
const path = require('path')

const sourceContentRoot = 'C:/Users/likai/Documents/Blog/content'
const sourceStaticRoot = 'C:/Users/likai/Documents/Blog/static'
const targetBlogsRoot = path.resolve(__dirname, '../public/blogs')

const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+(?:#[^)]+)?)\)/g

function walkMarkdownFiles(dir) {
	const result = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			result.push(...walkMarkdownFiles(fullPath))
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			result.push(fullPath)
		}
	}
	return result
}

function parseFrontMatter(source) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
	if (!match) {
		throw new Error('Missing front matter')
	}

	const frontMatter = match[1]
	const body = source.slice(match[0].length)
	const lines = frontMatter.split(/\r?\n/)
	const parsed = {}

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]
		const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
		if (!keyValue) continue

		const key = keyValue[1]
		const value = keyValue[2].trim()

		if (value) {
			parsed[key] = cleanScalar(value)
			continue
		}

		const list = []
		let cursor = index + 1
		while (cursor < lines.length) {
			const child = lines[cursor]
			const listItem = child.match(/^\s*-\s*(.*)$/)
			if (listItem) {
				list.push(cleanScalar(listItem[1]))
				cursor += 1
				continue
			}
			if (/^[A-Za-z0-9_-]+:\s*/.test(child)) break
			cursor += 1
		}

		parsed[key] = list.length ? list.filter(Boolean) : ''
	}

	return { frontMatter: parsed, body }
}

function cleanScalar(value) {
	return value.replace(/^['"]|['"]$/g, '').trim()
}

function slugify(filename) {
	return filename
		.replace(/\.md$/i, '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\\/]+/g, '-')
		.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'post'
}

function monthSummary(slug, title) {
	const compact = slug.match(/^(\d{4})(\d{2})$/)
	if (compact) return `${compact[1]} 年 ${Number(compact[2])} 月月记`

	const dashed = slug.match(/^(\d{4})-(\d{2})$/)
	if (dashed) return `${dashed[1]} 年 ${Number(dashed[2])} 月月记`

	return title
}

function normalizeDate(value, slug) {
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

	const compact = slug.match(/^(\d{4})(\d{2})$/)
	if (compact) return `${compact[1]}-${compact[2]}-15`

	const dashed = slug.match(/^(\d{4})-(\d{2})$/)
	if (dashed) return `${dashed[1]}-${dashed[2]}-15`

	return '2026-07-24'
}

function ensureUniqueFilename(targetDir, originalName, sourceFile, usedNames) {
	const parsed = path.parse(originalName)
	let candidate = originalName
	let counter = 2

	while (usedNames.has(candidate.toLowerCase())) {
		const existing = usedNames.get(candidate.toLowerCase())
		if (existing === sourceFile) return candidate
		candidate = `${parsed.name}-${counter}${parsed.ext}`
		counter += 1
	}

	usedNames.set(candidate.toLowerCase(), sourceFile)
	return candidate
}

function splitUrl(value) {
	const hashIndex = value.indexOf('#')
	const queryIndex = value.indexOf('?')
	const indexes = [hashIndex, queryIndex].filter(index => index >= 0)
	const splitIndex = indexes.length ? Math.min(...indexes) : -1

	if (splitIndex < 0) {
		return { pathname: value, suffix: '' }
	}

	return {
		pathname: value.slice(0, splitIndex),
		suffix: value.slice(splitIndex),
	}
}

function toSourceStaticPath(urlPathname) {
	const normalized = decodeURIComponent(urlPathname).replace(/^\/+/, '').replace(/\//g, path.sep)
	return path.join(sourceStaticRoot, normalized)
}

function migrateMarkdownBody(body, targetDir, slug) {
	fs.mkdirSync(targetDir, { recursive: true })

	const usedNames = new Map()
	const copied = []
	let firstCover = ''

	const markdown = body
		.replace(/<!--more-->/g, '')
		.replace(markdownImageRegex, (full, alt, rawUrl) => {
			if (/^(https?:|data:|mailto:)/i.test(rawUrl)) return full

			const { pathname, suffix } = splitUrl(rawUrl)
			const sourceFile = toSourceStaticPath(pathname)
			if (!fs.existsSync(sourceFile)) {
				console.warn(`Missing image: ${rawUrl}`)
				return full
			}

			const targetName = ensureUniqueFilename(targetDir, path.basename(sourceFile), sourceFile, usedNames)
			const targetFile = path.join(targetDir, targetName)
			fs.copyFileSync(sourceFile, targetFile)

			const publicUrl = `/blogs/${slug}/${encodeURIComponent(targetName).replace(/%20/g, '-')}`
			if (!firstCover) firstCover = publicUrl
			copied.push({ from: sourceFile, to: targetFile })
			return `![${alt}](${publicUrl}${suffix})`
		})
		.replace(/^\s+/, '')

	return { markdown, cover: firstCover, copied }
}

function uniqueCleanList(value) {
	const items = Array.isArray(value) ? value : value ? [value] : []
	return Array.from(new Set(items.map(item => String(item).trim()).filter(Boolean)))
}

function writeJson(filePath, value) {
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8')
}

function migrateOne(filePath) {
	const source = fs.readFileSync(filePath, 'utf8')
	const { frontMatter, body } = parseFrontMatter(source)
	const slug = slugify(path.basename(filePath))
	const targetDir = path.join(targetBlogsRoot, slug)
	const { markdown, cover, copied } = migrateMarkdownBody(body, targetDir, slug)

	const title = String(frontMatter.title || slug).trim()
	const tags = uniqueCleanList(frontMatter.tags)
	const categories = uniqueCleanList(frontMatter.categories)
	const category = categories[0] || (filePath.includes(`${path.sep}Sum${path.sep}`) ? 'Sums' : 'Tech')
	const date = normalizeDate(frontMatter.date, slug)
	const summary = String(frontMatter.summary || '').trim() || (category === 'Sums' ? monthSummary(slug, title) : title)
	const hidden = String(frontMatter.hiddenFromHomePage || '').toLowerCase() === 'true' || String(frontMatter.draft || '').toLowerCase() === 'true'

	const config = {
		title,
		tags,
		date,
		summary,
		...(cover ? { cover } : {}),
		hidden,
		category,
	}

	fs.writeFileSync(path.join(targetDir, 'index.md'), markdown, 'utf8')
	writeJson(path.join(targetDir, 'config.json'), config)

	return {
		slug,
		...config,
		copiedImages: copied.length,
	}
}

function main() {
	const files = walkMarkdownFiles(sourceContentRoot).sort((left, right) => left.localeCompare(right))
	const migrated = []
	const slugs = new Set()

	for (const filePath of files) {
		const item = migrateOne(filePath)
		if (slugs.has(item.slug)) throw new Error(`Duplicate slug: ${item.slug}`)
		slugs.add(item.slug)
		migrated.push(item)
	}

	const index = migrated
		.map(({ copiedImages, ...item }) => item)
		.sort((left, right) => right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug))

	const categories = Array.from(new Set(['aa', ...index.map(item => item.category).filter(Boolean)])).sort((left, right) => {
		if (left === 'aa') return -1
		if (right === 'aa') return 1
		return left.localeCompare(right)
	})

	writeJson(path.join(targetBlogsRoot, 'index.json'), index)
	writeJson(path.join(targetBlogsRoot, 'categories.json'), { categories })

	const imageCount = migrated.reduce((sum, item) => sum + item.copiedImages, 0)
	console.log(`Migrated ${migrated.length} articles`)
	console.log(`Copied ${imageCount} images`)
	console.log(`Categories: ${categories.join(', ')}`)
}

main()
