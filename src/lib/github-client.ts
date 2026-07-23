'use client'

import { useAuthStore } from '@/hooks/use-auth'
import { LOCAL_SAVE_ENABLED } from '@/consts'
import { KJUR, KEYUTIL } from 'jsrsasign'
import { toast } from 'sonner'

export const GH_API = 'https://api.github.com'

let localBlobId = 0
const localBlobStore = new Map<string, { content: string; encoding: 'utf-8' | 'base64' }>()

async function callLocalSave<T>(body: unknown): Promise<T> {
	const res = await fetch('/api/local-save', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	})

	if (!res.ok) {
		const data = await res.json().catch(() => null)
		throw new Error(data?.error || `local save failed: ${res.status}`)
	}

	return res.json()
}

function handle401Error(): void {
	if (typeof sessionStorage === 'undefined') return
	try {
		useAuthStore.getState().clearAuth()
	} catch (error) {
		console.error('Failed to clear auth cache:', error)
	}
}

function handle422Error(): void {
	toast.error('操作太快了，请操作慢一点')
}

export function toBase64Utf8(input: string): string {
	return btoa(unescape(encodeURIComponent(input)))
}

export function signAppJwt(appId: string, privateKeyPem: string): string {
	const now = Math.floor(Date.now() / 1000)
	const header = { alg: 'RS256', typ: 'JWT' }
	const payload = { iat: now - 60, exp: now + 8 * 60, iss: appId }
	const prv = KEYUTIL.getKey(privateKeyPem) as unknown as string
	return KJUR.jws.JWS.sign('RS256', JSON.stringify(header), JSON.stringify(payload), prv)
}

export async function getInstallationId(jwt: string, owner: string, repo: string): Promise<number> {
	if (LOCAL_SAVE_ENABLED) return 0

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/installation`, {
		headers: {
			Authorization: `Bearer ${jwt}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`installation lookup failed: ${res.status}`)
	const data = await res.json()
	return data.id
}

export async function createInstallationToken(jwt: string, installationId: number): Promise<string> {
	if (LOCAL_SAVE_ENABLED) return 'local-save-token'

	const res = await fetch(`${GH_API}/app/installations/${installationId}/access_tokens`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${jwt}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`create token failed: ${res.status}`)
	const data = await res.json()
	return data.token as string
}

export async function getFileSha(token: string, owner: string, repo: string, path: string, branch: string): Promise<string | undefined> {
	if (LOCAL_SAVE_ENABLED) return undefined

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (res.status === 404) return undefined
	if (!res.ok) throw new Error(`get file sha failed: ${res.status}`)
	const data = await res.json()
	return (data && data.sha) || undefined
}

export async function putFile(token: string, owner: string, repo: string, path: string, contentBase64: string, message: string, branch: string) {
	if (LOCAL_SAVE_ENABLED) {
		await callLocalSave({ action: 'writeFile', item: { path, content: contentBase64, encoding: 'base64' } })
		return { local: true }
	}

	const sha = await getFileSha(token, owner, repo, path, branch)
	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ message, content: contentBase64, branch, ...(sha ? { sha } : {}) })
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`put file failed: ${res.status}`)
	return res.json()
}

// Batch commit APIs

export async function getRef(token: string, owner: string, repo: string, ref: string): Promise<{ sha: string }> {
	if (LOCAL_SAVE_ENABLED) return { sha: 'local-save-ref' }

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/ref/${encodeURIComponent(ref)}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`get ref failed: ${res.status}`)
	const data = await res.json()
	return { sha: data.object.sha }
}

export type TreeItem = {
	path: string
	mode: '100644' | '100755' | '040000' | '160000' | '120000'
	type: 'blob' | 'tree' | 'commit'
	content?: string
	sha?: string | null
}

export async function createTree(token: string, owner: string, repo: string, tree: TreeItem[], baseTree?: string): Promise<{ sha: string }> {
	if (LOCAL_SAVE_ENABLED) {
		const items = tree.map(item => {
			if (item.sha === null) return { path: item.path, delete: true }

			if (item.sha) {
				const blob = localBlobStore.get(item.sha)
				if (!blob) throw new Error(`Missing local blob: ${item.sha}`)
				return { path: item.path, content: blob.content, encoding: blob.encoding }
			}

			return { path: item.path, content: item.content || '', encoding: 'utf-8' }
		})

		await callLocalSave({ action: 'batchWrite', items })
		return { sha: `local-tree-${Date.now()}` }
	}

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/trees`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ tree, base_tree: baseTree })
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`create tree failed: ${res.status}`)
	const data = await res.json()
	return { sha: data.sha }
}

export async function createCommit(token: string, owner: string, repo: string, message: string, tree: string, parents: string[]): Promise<{ sha: string }> {
	if (LOCAL_SAVE_ENABLED) return { sha: `local-commit-${Date.now()}` }

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/commits`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ message, tree, parents })
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`create commit failed: ${res.status}`)
	const data = await res.json()
	return { sha: data.sha }
}

export async function updateRef(token: string, owner: string, repo: string, ref: string, sha: string, force = false): Promise<void> {
	if (LOCAL_SAVE_ENABLED) return

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/refs/${encodeURIComponent(ref)}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ sha, force })
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`update ref failed: ${res.status}`)
}

export async function readTextFileFromRepo(token: string, owner: string, repo: string, path: string, ref: string): Promise<string | null> {
	if (LOCAL_SAVE_ENABLED) {
		const data = await callLocalSave<{ content: string | null }>({ action: 'readFile', path })
		return data.content
	}

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`read file failed: ${res.status}`)
	const data: any = await res.json()
	if (Array.isArray(data) || !data.content) return null
	try {
		return decodeURIComponent(escape(atob(data.content)))
	} catch {
		return atob(data.content)
	}
}

export async function listRepoFilesRecursive(token: string, owner: string, repo: string, path: string, ref: string): Promise<string[]> {
	if (LOCAL_SAVE_ENABLED) {
		const data = await callLocalSave<{ files: string[] }>({ action: 'listFiles', path })
		return data.files
	}

	async function fetchPath(targetPath: string): Promise<string[]> {
		const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(targetPath)}?ref=${encodeURIComponent(ref)}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		})
		if (res.status === 401) handle401Error()
		if (res.status === 422) handle422Error()
		if (res.status === 404) return []
		if (!res.ok) throw new Error(`read directory failed: ${res.status}`)
		const data: any = await res.json()
		if (Array.isArray(data)) {
			const files: string[] = []
			for (const item of data) {
				if (item.type === 'file') {
					files.push(item.path)
				} else if (item.type === 'dir') {
					const nested = await fetchPath(item.path)
					files.push(...nested)
				}
			}
			return files
		}
		if (data?.type === 'file') return [data.path]
		if (data?.type === 'dir') return fetchPath(data.path)
		return []
	}

	return fetchPath(path)
}

export async function createBlob(
	token: string,
	owner: string,
	repo: string,
	content: string,
	encoding: 'utf-8' | 'base64' = 'base64'
): Promise<{ sha: string }> {
	if (LOCAL_SAVE_ENABLED) {
		const sha = `local-blob-${++localBlobId}`
		localBlobStore.set(sha, { content, encoding })
		return { sha }
	}

	const res = await fetch(`${GH_API}/repos/${owner}/${repo}/git/blobs`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ content, encoding })
	})
	if (res.status === 401) handle401Error()
	if (res.status === 422) handle422Error()
	if (!res.ok) throw new Error(`create blob failed: ${res.status}`)
	const data = await res.json()
	return { sha: data.sha }
}
