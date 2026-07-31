import { createBlob, createCommit, createTree, getRef, toBase64Utf8, updateRef, type TreeItem } from '@/lib/github-client'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import { toast } from 'sonner'
import type { BabyDiaryState } from '../types'

const BABY_DIARY_CONFIG_PATH = 'src/config/baby-diary.json'
const BABY_DIARY_IMAGE_DIRECTORY = 'public/images/baby-diary'

function getImageData(image: string) {
	const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
	return match ? { mimeType: match[1], base64: match[2] } : null
}

function getImageExtension(mimeType: string) {
	if (mimeType === 'image/jpeg') return 'jpg'
	if (mimeType === 'image/svg+xml') return 'svg'
	return mimeType.slice('image/'.length).replace(/[^a-z0-9]/gi, '') || 'png'
}

function formatEditHour(date: Date) {
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}`
}

function getNextImageSequence(snapshot: BabyDiaryState, editHour: string) {
	const pattern = new RegExp(`/${editHour}-(\\d+)\\.[a-z0-9]+$`, 'i')
	const existing = snapshot.entries.flatMap(entry => entry.images).reduce((max, image) => {
		const match = image.match(pattern)
		return match ? Math.max(max, Number(match[1])) : max
	}, 0)
	return existing + 1
}

export async function pushBabyDiary(snapshot: BabyDiaryState): Promise<BabyDiaryState> {
	const token = await getAuthToken()
	toast.info('Preparing diary updates...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const editHour = formatEditHour(new Date())
	let nextImageSequence = getNextImageSequence(snapshot, editHour)
	const treeItems: TreeItem[] = []

	const entries = await Promise.all(
		snapshot.entries.map(async entry => {
			const images = await Promise.all(
				entry.images.map(async image => {
					const imageData = getImageData(image)
					if (!imageData) return image

					const imageNumber = String(nextImageSequence++).padStart(2, '0')
					const filename = `${editHour}-${imageNumber}.${getImageExtension(imageData.mimeType)}`
					const path = `${BABY_DIARY_IMAGE_DIRECTORY}/${filename}`
					const imageBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, imageData.base64, 'base64')
					treeItems.push({ path, mode: '100644', type: 'blob', sha: imageBlob.sha })
					return path.replace(/^public/, '')
				})
			)
			return { ...entry, images }
		})
	)

	const savedDiary: BabyDiaryState = { entries }
	const configBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(JSON.stringify(savedDiary, null, '\t')), 'base64')
	treeItems.push({ path: BABY_DIARY_CONFIG_PATH, mode: '100644', type: 'blob', sha: configBlob.sha })

	toast.info('Creating diary commit...')
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, refData.sha)
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, 'Update phi diary', treeData.sha, [refData.sha])
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
	toast.success('Diary saved. Deployment will update shortly.')

	return savedDiary
}
