'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import { hashFileSHA256 } from '@/lib/file-utils'
import type { SiteContent } from '../../stores/config-store'
import type { MusicUploads } from './types'

type MusicTrack = {
	id: string
	title: string
	url: string
}

type MusicPlayerSettings = {
	label?: string
	random?: boolean
	tracks?: MusicTrack[]
}

interface MusicSettingsSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
	musicUploads: MusicUploads
	setMusicUploads: React.Dispatch<React.SetStateAction<MusicUploads>>
}

const getMusicPlayer = (data: SiteContent): MusicPlayerSettings => {
	return {
		label: 'music',
		random: true,
		tracks: [],
		...((data.musicPlayer ?? {}) as MusicPlayerSettings)
	}
}

export function MusicSettingsSection({ formData, setFormData, musicUploads, setMusicUploads }: MusicSettingsSectionProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const musicPlayer = getMusicPlayer(formData)
	const tracks = musicPlayer.tracks ?? []

	const updateMusicPlayer = (next: MusicPlayerSettings) => {
		setFormData(prev => ({
			...prev,
			musicPlayer: {
				...getMusicPlayer(prev),
				...next
			} as any
		}))
	}

	const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || [])
		if (!files.length) return

		for (const file of files) {
			if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.mp3')) {
				toast.error('请选择 MP3 音乐文件')
				continue
			}

			const hash = await hashFileSHA256(file)
			const id = hash
			const title = file.name.replace(/\.[^.]+$/, '')
			const targetPath = `/music/${file.name}`
			const previewUrl = URL.createObjectURL(file)

			setMusicUploads(prev => ({
				...prev,
				[id]: { type: 'file', file, previewUrl, hash }
			}))

			setFormData(prev => {
				const player = getMusicPlayer(prev)
				const existing = player.tracks ?? []
				const tracks = [...existing.filter(item => item.id !== id), { id, title, url: targetPath }]
				return {
					...prev,
					musicPlayer: {
						...player,
						tracks
					} as any
				}
			})
		}

		if (e.currentTarget) e.currentTarget.value = ''
	}

	const removeTrack = (id: string) => {
		const uploadItem = musicUploads[id]
		if (uploadItem?.type === 'file') {
			URL.revokeObjectURL(uploadItem.previewUrl)
		}

		setMusicUploads(prev => {
			const next = { ...prev }
			delete next[id]
			return next
		})

		setFormData(prev => {
			const player = getMusicPlayer(prev)
			return {
				...prev,
				musicPlayer: {
					...player,
					tracks: (player.tracks ?? []).filter(item => item.id !== id)
				} as any
			}
		})
	}

	const updateTrackTitle = (id: string, title: string) => {
		setFormData(prev => {
			const player = getMusicPlayer(prev)
			return {
				...prev,
				musicPlayer: {
					...player,
					tracks: (player.tracks ?? []).map(item => (item.id === id ? { ...item, title } : item))
				} as any
			}
		})
	}

	return (
		<div className='rounded-xl border bg-white/30 p-4'>
			<div className='mb-3 flex items-center justify-between'>
				<label className='block text-sm font-medium'>音乐设置</label>
				<input ref={inputRef} type='file' accept='audio/mpeg,.mp3' multiple className='hidden' onChange={handleFilesSelect} />
				<button type='button' onClick={() => inputRef.current?.click()} className='bg-card rounded-lg border px-3 py-1.5 text-xs font-medium'>
					上传 MP3
				</button>
			</div>

			<div className='grid gap-3'>
				<label className='grid gap-1'>
					<span className='text-secondary text-xs'>卡片标题</span>
					<input
						value={musicPlayer.label ?? 'music'}
						onChange={e => updateMusicPlayer({ label: e.target.value })}
						className='bg-secondary/10 rounded-lg border px-3 py-2 text-sm'
					/>
				</label>

				<label className='flex items-center gap-2'>
					<input
						type='checkbox'
						checked={musicPlayer.random ?? true}
						onChange={e => updateMusicPlayer({ random: e.target.checked })}
						className='accent-brand h-4 w-4 rounded'
					/>
					<span className='text-sm font-medium'>随机播放</span>
				</label>

				<div className='grid gap-2'>
					{tracks.length === 0 && <div className='text-secondary rounded-lg border border-dashed bg-white/30 px-3 py-3 text-xs'>还没有音乐，点击上传 MP3 添加。</div>}
					{tracks.map(track => (
						<div key={track.id} className='grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border bg-white/40 p-2'>
							<div className='grid gap-1'>
								<input
									value={track.title}
									onChange={e => updateTrackTitle(track.id, e.target.value)}
									className='bg-secondary/10 rounded-md border px-2 py-1 text-sm'
								/>
								<div className='text-secondary truncate text-xs'>{track.url}</div>
							</div>
							<button type='button' onClick={() => removeTrack(track.id)} className='text-secondary rounded-lg border bg-white/70 px-3 py-1.5 text-xs'>
								删除
							</button>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
