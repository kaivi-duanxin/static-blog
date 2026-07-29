import { createBlob, createCommit, createTree, getRef, listRepoFilesRecursive, toBase64Utf8, updateRef, type TreeItem } from '@/lib/github-client'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import { toast } from 'sonner'
import type { SourcePerson } from '../data'

export type SourceTreeState = {
	people: Array<SourcePerson & { photo?: string }>
	positions: Record<string, { x: number; y: number }>
	linkMiddles: Record<string, number>
}

const SOURCE_TREE_CONFIG_PATH = 'src/config/source-family-tree.json'
const SOURCE_IMAGE_DIRECTORY = 'public/images/source'

function getPhotoData(photo: string) {
	const match = photo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
	return match ? { mimeType: match[1], base64: match[2] } : null
}

function getPhotoExtension(mimeType: string) {
	if (mimeType === 'image/jpeg') return 'jpg'
	if (mimeType === 'image/svg+xml') return 'svg'
	return mimeType.slice('image/'.length).replace(/[^a-z0-9]/gi, '') || 'png'
}

export async function pushSourceTree(snapshot: SourceTreeState): Promise<SourceTreeState> {
	const token = await getAuthToken()
	toast.info('Preparing family tree updates...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const timestamp = Date.now()
	const treeItems: TreeItem[] = []

	const people = await Promise.all(
		snapshot.people.map(async (person, index) => {
			const photoData = person.photo ? getPhotoData(person.photo) : null
			if (!photoData) return person

			const filename = `${person.id.replace(/[^a-z0-9-]/gi, '-')}-${timestamp}-${index}.${getPhotoExtension(photoData.mimeType)}`
			const path = `${SOURCE_IMAGE_DIRECTORY}/${filename}`
			const imageBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, photoData.base64, 'base64')
			treeItems.push({ path, mode: '100644', type: 'blob', sha: imageBlob.sha })
			return { ...person, photo: path.replace(/^public/, '') }
		})
	)

	const savedTree: SourceTreeState = { ...snapshot, people }
	const configBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(JSON.stringify(savedTree, null, '\t')), 'base64')
	treeItems.push({ path: SOURCE_TREE_CONFIG_PATH, mode: '100644', type: 'blob', sha: configBlob.sha })

	toast.info('Creating family tree commit...')
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, refData.sha)
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, 'Update source family tree', treeData.sha, [refData.sha])
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
	toast.success('Family tree saved. Deployment will update shortly.')

	return savedTree
}

export async function resetSourceTree(snapshot: SourceTreeState): Promise<void> {
	const token = await getAuthToken()
	toast.info('Resetting family tree...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const existingImages = await listRepoFilesRecursive(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, SOURCE_IMAGE_DIRECTORY, GITHUB_CONFIG.BRANCH)
	const configBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(JSON.stringify(snapshot, null, '\t')), 'base64')
	const treeItems: TreeItem[] = [
		...existingImages.map(path => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
		{ path: SOURCE_TREE_CONFIG_PATH, mode: '100644', type: 'blob', sha: configBlob.sha }
	]
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, refData.sha)
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, 'Reset source family tree', treeData.sha, [refData.sha])
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
	toast.success('Family tree reset. Deployment will update shortly.')
}
