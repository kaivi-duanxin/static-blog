'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { SiteContent } from '../../stores/config-store'

type LikeSettings = {
	baseCount?: number
}

interface LikeSettingsSectionProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function LikeSettingsSection({ formData, setFormData }: LikeSettingsSectionProps) {
	const likeSettings = (formData.likeSettings ?? {}) as LikeSettings
	const [slug, setSlug] = useState('home')
	const [currentCount, setCurrentCount] = useState('')
	const [provider, setProvider] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	const updateBaseCount = (value: string) => {
		const baseCount = Math.max(0, Math.floor(Number(value) || 0))
		setFormData(prev => ({
			...prev,
			likeSettings: {
				...((prev.likeSettings ?? {}) as LikeSettings),
				baseCount
			} as any
		}))
	}

	const loadCount = async () => {
		setIsLoading(true)
		try {
			const res = await fetch(`/api/likes?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
			const data = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
			setCurrentCount(String(data.count ?? ''))
			setProvider(data.provider || '')
			toast.success('点赞数已读取')
		} catch (error) {
			const message = error instanceof Error ? error.message : '读取失败'
			toast.error(message)
		} finally {
			setIsLoading(false)
		}
	}

	const saveCount = async () => {
		setIsLoading(true)
		try {
			const res = await fetch('/api/likes', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slug, count: Number(currentCount) })
			})
			const data = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
			setCurrentCount(String(data.count ?? ''))
			setProvider(data.provider || '')
			toast.success('点赞数已保存')
		} catch (error) {
			const message = error instanceof Error ? error.message : '保存失败'
			toast.error(message)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className='rounded-xl border bg-white/30 p-4'>
			<label className='mb-3 block text-sm font-medium'>点赞设置</label>
			<div className='grid gap-3'>
				<label className='grid gap-1'>
					<span className='text-secondary text-xs'>默认起始数量</span>
					<input
						type='number'
						min={0}
						value={likeSettings.baseCount ?? 520}
						onChange={e => updateBaseCount(e.target.value)}
						className='bg-secondary/10 rounded-lg border px-3 py-2 text-sm'
					/>
				</label>
				<div className='grid grid-cols-[1fr_120px] gap-2 max-sm:grid-cols-1'>
					<label className='grid gap-1'>
						<span className='text-secondary text-xs'>点赞 slug</span>
						<input value={slug} onChange={e => setSlug(e.target.value)} className='bg-secondary/10 rounded-lg border px-3 py-2 text-sm' />
					</label>
					<button type='button' onClick={loadCount} disabled={isLoading} className='bg-card mt-5 rounded-lg border px-3 py-2 text-sm font-medium max-sm:mt-0'>
						读取
					</button>
				</div>
				<div className='grid grid-cols-[1fr_120px] gap-2 max-sm:grid-cols-1'>
					<label className='grid gap-1'>
						<span className='text-secondary text-xs'>当前数量</span>
						<input
							type='number'
							min={0}
							value={currentCount}
							onChange={e => setCurrentCount(e.target.value)}
							placeholder='先读取或直接输入'
							className='bg-secondary/10 rounded-lg border px-3 py-2 text-sm'
						/>
					</label>
					<button type='button' onClick={saveCount} disabled={isLoading || !currentCount} className='bg-card mt-5 rounded-lg border px-3 py-2 text-sm font-medium max-sm:mt-0'>
						保存数量
					</button>
				</div>
				<div className='text-secondary text-xs'>数据源：{provider || '本地开发默认值'}。数据库密钥后面写在服务端环境变量，不会保存到前端配置。</div>
			</div>
		</div>
	)
}
