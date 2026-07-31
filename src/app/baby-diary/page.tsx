'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarHeartIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, HomeIcon, ImagePlusIcon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import diaryConfig from '@/config/baby-diary.json'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/hooks/use-auth'
import { pushBabyDiary } from './services/push-baby-diary'
import type { BabyDiaryEntry, BabyDiaryState } from './types'

function formatTimelineDate(datetime: string) {
	const date = new Date(datetime)
	if (Number.isNaN(date.getTime())) return { day: '--', month: '--', year: '----', time: '--:--' }
	return {
		day: String(date.getDate()).padStart(2, '0'),
		month: `${date.getMonth() + 1}月`,
		year: String(date.getFullYear()),
		time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
	}
}

function localDateTimeInput() {
	const now = new Date()
	const offset = now.getTimezoneOffset() * 60_000
	return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

function cloneEntries(entries: BabyDiaryEntry[]) {
	return entries.map(entry => ({ ...entry, images: [...entry.images] }))
}

function makeDraft(entry?: BabyDiaryEntry): BabyDiaryEntry {
	return entry ? { ...entry, images: [...entry.images] } : { id: `phi-${Date.now()}`, datetime: localDateTimeInput(), title: '', description: '', images: [] }
}

const DIARY_EDIT_ACCESS_KEY = 'phi-diary-edit-access-v1'
const DIARY_DETAIL_ACCESS_KEY = 'phi-diary-detail-access-v1'

function hasDiaryEditAccess() {
	if (typeof window === 'undefined') return false
	return window.sessionStorage.getItem(DIARY_EDIT_ACCESS_KEY) === 'granted'
}

function hasDiaryDetailAccess() {
	if (typeof window === 'undefined') return false
	return window.sessionStorage.getItem(DIARY_DETAIL_ACCESS_KEY) === 'granted'
}

function normalizeAnswer(answer: string) {
	return answer.replace(/\s/g, '').trim()
}

function getMonthKey(datetime: string) {
	const date = new Date(datetime)
	if (Number.isNaN(date.getTime())) return 'unknown'
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthKey: string) {
	if (monthKey === 'unknown') return '未标注日期'
	const [year, month] = monthKey.split('-')
	return `${year} 年 ${Number(month)} 月`
}

export default function BabyDiaryPage() {
	const [entries, setEntries] = useState<BabyDiaryEntry[]>(() => cloneEntries((diaryConfig as BabyDiaryState).entries ?? []))
	const [editing, setEditing] = useState(false)
	const [snapshot, setSnapshot] = useState<BabyDiaryEntry[] | null>(null)
	const [editorOpen, setEditorOpen] = useState(false)
	const [draft, setDraft] = useState<BabyDiaryEntry>(() => makeDraft())
	const [expandedId, setExpandedId] = useState<string | null>(null)
	const [activeImage, setActiveImage] = useState(0)
	const [isSaving, setIsSaving] = useState(false)
	const [questionOpen, setQuestionOpen] = useState(false)
	const [answer, setAnswer] = useState('')
	const [editAccessGranted, setEditAccessGranted] = useState(hasDiaryEditAccess)
	const [detailAccessGranted, setDetailAccessGranted] = useState(hasDiaryDetailAccess)
	const [detailQuestionOpen, setDetailQuestionOpen] = useState(false)
	const [requestedEntryId, setRequestedEntryId] = useState<string | null>(null)
	const [detailAnswer, setDetailAnswer] = useState('')
	const [viewerRelation, setViewerRelation] = useState('')
	const [monthVisibility, setMonthVisibility] = useState<Record<string, boolean>>({})
	const imageInputRef = useRef<HTMLInputElement>(null)
	const keyInputRef = useRef<HTMLInputElement>(null)
	const { isAuth, setPrivateKey } = useAuthStore()

	const timeline = useMemo(
		() =>
			entries
				.map(entry => (detailAccessGranted ? entry : { ...entry, images: [] }))
				.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
		[detailAccessGranted, entries]
	)
	const timelineGroups = useMemo(() => {
		const groups = new Map<string, BabyDiaryEntry[]>()
		for (const entry of timeline) {
			const key = getMonthKey(entry.datetime)
			groups.set(key, [...(groups.get(key) ?? []), entry])
		}
		return [...groups.entries()].map(([key, monthEntries]) => ({ key, entries: monthEntries }))
	}, [timeline])
	const expanded = expandedId ? entries.find(entry => entry.id === expandedId) : undefined

	const toggleMonth = (key: string, defaultVisible: boolean) => {
		setMonthVisibility(current => ({ ...current, [key]: !(current[key] ?? defaultVisible) }))
	}

	const startEditing = () => {
		setSnapshot(cloneEntries(entries))
		setEditing(true)
	}

	const beginEditing = () => {
		if (!editAccessGranted) {
			setAnswer('')
			setQuestionOpen(true)
			return
		}
		startEditing()
	}

	const verifyAnswer = () => {
		if (normalizeAnswer(answer) !== '李言之') {
			toast.error('答案不正确，请再想一想。')
			return
		}
		window.sessionStorage.setItem(DIARY_EDIT_ACCESS_KEY, 'granted')
		setEditAccessGranted(true)
		setQuestionOpen(false)
		setAnswer('')
		startEditing()
	}

	const saveAll = async () => {
		if (isSaving) return
		if (!isAuth) {
			toast.info('请导入 GitHub 密钥后保存并提交到仓库。')
			keyInputRef.current?.click()
			return
		}
		try {
			setIsSaving(true)
			const saved = await pushBabyDiary({ entries })
			setEntries(saved.entries)
			setSnapshot(null)
			setEditing(false)
		} catch (error) {
			console.error('Failed to save phi diary:', error)
			toast.error(error instanceof Error ? error.message : '日记保存失败，请确认已导入 GitHub 密钥。')
		} finally {
			setIsSaving(false)
		}
	}

	const cancelEditing = () => {
		if (snapshot) setEntries(snapshot)
		setSnapshot(null)
		setEditing(false)
		setEditorOpen(false)
	}

	const openEntryEditor = (entry?: BabyDiaryEntry) => {
		setDraft(makeDraft(entry))
		setEditorOpen(true)
	}

	const saveDraft = () => {
		if (!draft.title.trim()) return toast.error('请填写日记标题。')
		setEntries(current => {
			const exists = current.some(entry => entry.id === draft.id)
			return exists ? current.map(entry => (entry.id === draft.id ? { ...draft, title: draft.title.trim() } : entry)) : [...current, { ...draft, title: draft.title.trim() }]
		})
		setEditorOpen(false)
	}

	const removeEntry = (id: string) => {
		if (!window.confirm('确认删除这条日记吗？保存后会同步到仓库。')) return
		setEntries(current => current.filter(entry => entry.id !== id))
		setEditorOpen(false)
	}

	const selectExpanded = (id: string) => {
		if (!detailAccessGranted) {
			setRequestedEntryId(id)
			setDetailAnswer('')
			setViewerRelation('')
			setDetailQuestionOpen(true)
			return
		}
		setExpandedId(id)
		setActiveImage(0)
	}

	const verifyDetailAccess = () => {
		if (normalizeAnswer(detailAnswer) !== '李言之') {
			toast.error('答案不正确，请再想一想。')
			return
		}
		if (!viewerRelation.trim()) {
			toast.error('请填写你是 φφ 的谁。')
			return
		}
		window.sessionStorage.setItem(DIARY_DETAIL_ACCESS_KEY, 'granted')
		setDetailAccessGranted(true)
		setDetailQuestionOpen(false)
		if (requestedEntryId) {
			setExpandedId(requestedEntryId)
			setActiveImage(0)
		}
		setRequestedEntryId(null)
	}

	const handleImageUpload: React.ChangeEventHandler<HTMLInputElement> = event => {
		const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith('image/'))
		if (!files.length) return
		Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
			reader.onerror = () => reject(reader.error)
			reader.readAsDataURL(file)
		})))
			.then(images => setDraft(current => ({ ...current, images: [...current.images, ...images.filter(Boolean)] })))
			.catch(() => toast.error('图片读取失败，请重新选择。'))
		event.currentTarget.value = ''
	}

	const handlePrivateKeyChange: React.ChangeEventHandler<HTMLInputElement> = event => {
		const file = event.target.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result !== 'string') return
			void setPrivateKey(reader.result)
			toast.success('GitHub 密钥已导入，现在可以编辑日记。')
		}
		reader.readAsText(file)
		event.currentTarget.value = ''
	}

	return (
		<div className='min-h-screen px-6 pt-28 pb-16 max-sm:px-4'>
			<input ref={keyInputRef} type='file' accept='.pem' className='hidden' onChange={handlePrivateKeyChange} />
			<input ref={imageInputRef} type='file' accept='image/*' multiple className='hidden' onChange={handleImageUpload} />

			<div className='mx-auto max-w-5xl'>
				<header className='mb-10 flex flex-wrap items-center justify-between gap-4'>
					<div className='flex items-center gap-3'>
						<Link href='/' aria-label='返回首页' title='返回首页' className='grid size-10 place-items-center rounded-md border border-[#c9dce0] bg-white/80 text-[#075a7b] shadow-sm transition hover:bg-[#eaf4f7]'><HomeIcon className='size-5' /></Link>
						<div className='grid size-11 place-items-center rounded-md bg-[#c7696b] text-white shadow-[0_12px_24px_rgba(199,105,107,0.22)]'><CalendarHeartIcon className='size-6' /></div>
						<div><p className='text-xs font-medium text-[#b06062]'>TIME ALBUM</p><h1 className='text-2xl font-semibold text-[#2f484d]'>φφ日记</h1></div>
					</div>
					<div className='flex items-center gap-2'>
						{editing ? <><button type='button' onClick={() => openEntryEditor()} className='flex h-10 items-center gap-1.5 rounded-md border border-[#c7696b] bg-[#fff4f4] px-3 text-sm font-medium text-[#a65356]'><PlusIcon className='size-4' /> 新增日记</button><button type='button' onClick={cancelEditing} disabled={isSaving} className='h-10 rounded-md border border-[#d6e1e3] bg-white px-3 text-sm text-[#506b72] disabled:opacity-50'>取消</button><button type='button' onClick={saveAll} disabled={isSaving} className='flex h-10 items-center gap-1.5 rounded-md bg-[#c7696b] px-3 text-sm font-medium text-white disabled:opacity-50'><SaveIcon className='size-4' /> {isSaving ? '保存中...' : '保存'}</button></> : <button type='button' onClick={beginEditing} className='flex h-10 items-center gap-1.5 rounded-md bg-[#075a7b] px-3 text-sm font-medium text-white'><PencilIcon className='size-4' /> {isAuth ? '编辑' : '导入密钥'}</button>}
					</div>
				</header>

				<section className='relative pb-4'>
					<div className='absolute top-0 bottom-0 left-[30.5%] w-px bg-[#c9dce0] max-md:left-[88px]' />
					{timeline.length ? timelineGroups.map(group => {
						const collapsible = group.entries.length >= 4
						const defaultVisible = !collapsible
						const visible = editing || (monthVisibility[group.key] ?? defaultVisible)
						return <div key={group.key} className='relative'>
							<div className='relative grid grid-cols-[30%_1fr] gap-10 pb-5 max-md:grid-cols-[72px_1fr] max-md:gap-7'>
								<div className='relative z-10 justify-self-end text-right max-md:justify-self-start max-md:text-left'>
									<span className='absolute top-2 -right-[51px] grid size-4 place-items-center rounded-full border-4 border-[#f3f8f7] bg-[#2e555e] shadow-[0_0_0_1px_#c9dce0] max-md:-right-[26px]' />
									<span className='block text-xs font-semibold text-[#53737a]'>{formatMonthLabel(group.key)}</span>
								</div>
								<div className='flex min-h-8 items-center justify-between gap-3 border-b border-dashed border-[#d6e5e6] pb-3 pl-5 max-md:pl-6'>
									<div><span className='text-sm font-medium text-[#315861]'>本月记忆</span><span className='ml-2 text-xs text-[#8aa1a6]'>{group.entries.length} 条</span></div>
									{collapsible && !editing && <button type='button' onClick={() => toggleMonth(group.key, defaultVisible)} className='flex h-8 items-center gap-1 rounded-md border border-[#d5e3e5] bg-white/80 px-2 text-xs text-[#496a72] hover:bg-[#edf5f5]'>{visible ? <><ChevronUpIcon className='size-3.5' /> 收起</> : <><ChevronDownIcon className='size-3.5' /> 展开</>}</button>}
								</div>
							</div>
							{visible && group.entries.map(entry => {
						const date = formatTimelineDate(entry.datetime)
						return <article key={entry.id} className='relative grid grid-cols-[30%_1fr] gap-10 pb-10 max-md:grid-cols-[72px_1fr] max-md:gap-7'>
							<button type='button' onClick={() => selectExpanded(entry.id)} className='group relative z-10 justify-self-end text-right max-md:justify-self-start max-md:text-left'><span className='absolute top-5 -right-[52px] grid size-5 place-items-center rounded-full border-4 border-[#f3f8f7] bg-[#c7696b] shadow-[0_0_0_1px_#c9dce0] max-md:-right-[27px]' /><span className='block text-3xl leading-none font-semibold text-[#2e555e]'>{date.day}</span><span className='mt-1 block text-sm font-medium text-[#b06062]'>{date.month}</span><span className='mt-1 block text-xs text-[#7b969c]'>{date.year} · {date.time}</span></button>
							<div className='rounded-md border border-[#d7e6e7] bg-white/82 p-5 shadow-[0_15px_40px_rgba(39,79,87,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(39,79,87,0.14)]'><div className='flex items-start justify-between gap-4'><button type='button' onClick={() => selectExpanded(entry.id)} className='min-w-0 text-left'><h2 className='text-lg font-semibold text-[#244750]'>{entry.title}</h2><p className='mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-[#60787d]'>{entry.description || '暂未添加文字描述。'}</p></button>{editing && <button type='button' onClick={() => openEntryEditor(entry)} aria-label={`编辑 ${entry.title}`} className='grid size-9 shrink-0 place-items-center rounded-md border border-[#d7e6e7] text-[#075a7b] hover:bg-[#eaf4f7]'><PencilIcon className='size-4' /></button>}</div>{entry.images.length > 0 && <div className='mt-4 flex -space-x-2'>{entry.images.slice(0, 4).map((image, index) => <img key={`${image}-${index}`} src={image} alt='' className='size-10 rounded-md border-2 border-white object-cover' />)}{entry.images.length > 4 && <span className='grid size-10 place-items-center rounded-md border-2 border-white bg-[#2e555e] text-xs text-white'>+{entry.images.length - 4}</span>}</div>}</div>
						</article>
							})}
						</div>
					}) : <div className='relative ml-[30%] rounded-md border border-dashed border-[#bdd4d7] bg-white/55 p-12 text-center text-sm text-[#6e878d] max-md:ml-[100px]'>还没有日记。进入编辑模式后，新增第一条 φφ 记忆。</div>}
				</section>
			</div>

			{detailQuestionOpen && !editing && (
				<div className='fixed inset-0 z-[72] grid place-items-center bg-[#173239]/35 p-4 backdrop-blur-sm' role='dialog' aria-modal='true' aria-label='日记详情访问验证'>
					<div className='w-full max-w-md rounded-md bg-white p-5 shadow-2xl'>
						<div className='flex items-center justify-between border-b border-[#e0eaeb] pb-3'>
							<div>
								<p className='text-xs font-medium text-[#b06062]'>MEMORY ACCESS</p>
								<h2 className='mt-1 text-lg font-semibold text-[#244750]'>验证后查看完整日记</h2>
							</div>
							<button type='button' onClick={() => { setDetailQuestionOpen(false); setRequestedEntryId(null) }} aria-label='关闭访问验证' className='grid size-8 place-items-center rounded-md text-[#6c858b] hover:bg-[#edf5f5]'><XIcon className='size-4' /></button>
						</div>
						<div className='mt-5 space-y-4'>
							<label className='block text-sm font-medium text-[#3f5b62]'>φ宝的名字是什么!!!
								<input
									autoFocus
									value={detailAnswer}
									onChange={event => setDetailAnswer(event.target.value)}
									placeholder='请输入答案'
									className='mt-2 h-11 w-full rounded-md border border-[#d6e4e6] px-3 text-sm outline-none focus:border-[#075a7b]'
								/>
							</label>
							<label className='block text-sm font-medium text-[#3f5b62]'>你是 φφ 的谁
								<input
									value={viewerRelation}
									ref={element => {
										if (element) element.placeholder = 'eg: \u4eb2\u621a\u670b\u53cb'
									}}
									onChange={event => setViewerRelation(event.target.value)}
									onKeyDown={event => {
										if (event.key === 'Enter') verifyDetailAccess()
									}}
									placeholder='eg：亲朋好友'
									className='mt-2 h-11 w-full rounded-md border border-[#d6e4e6] px-3 text-sm outline-none focus:border-[#075a7b]'
								/>
							</label>
						</div>
						<p className='mt-3 text-xs leading-5 text-[#799198]'>通过验证后可在本次浏览器会话中查看照片与完整记录。</p>
						<div className='mt-5 flex justify-end gap-2'>
							<button type='button' onClick={() => { setDetailQuestionOpen(false); setRequestedEntryId(null) }} className='h-10 rounded-md border border-[#d6e4e6] px-4 text-sm text-[#506b72]'>取消</button>
							<button type='button' onClick={verifyDetailAccess} className='flex h-10 items-center gap-1.5 rounded-md bg-[#075a7b] px-4 text-sm font-medium text-white'><CheckIcon className='size-4' /> 验证并查看</button>
						</div>
					</div>
				</div>
			)}

			{questionOpen && !editing && (
				<div className='fixed inset-0 z-[70] grid place-items-center bg-[#173239]/35 p-4 backdrop-blur-sm' role='dialog' aria-modal='true' aria-label='日记编辑验证'>
					<div className='w-full max-w-md rounded-md bg-white p-5 shadow-2xl'>
						<div className='flex items-center justify-between border-b border-[#e0eaeb] pb-3'>
							<div>
								<p className='text-xs font-medium text-[#b06062]'>EDIT CHECK</p>
								<h2 className='mt-1 text-lg font-semibold text-[#244750]'>回答问题后编辑</h2>
							</div>
							<button type='button' onClick={() => setQuestionOpen(false)} aria-label='关闭验证' className='grid size-8 place-items-center rounded-md text-[#6c858b] hover:bg-[#edf5f5]'><XIcon className='size-4' /></button>
						</div>
						<label className='mt-5 block text-sm font-medium text-[#3f5b62]'>φ宝的名字是什么!!!
							<input
								autoFocus
								value={answer}
								onChange={event => setAnswer(event.target.value)}
								onKeyDown={event => {
									if (event.key === 'Enter') verifyAnswer()
								}}
								placeholder='请输入答案'
								className='mt-2 h-11 w-full rounded-md border border-[#d6e4e6] px-3 text-sm outline-none focus:border-[#075a7b]'
							/>
						</label>
						<p className='mt-3 text-xs leading-5 text-[#799198]'>验证仅用于开启日记编辑界面。线上保存和提交仍需要导入 GitHub 密钥。</p>
						<div className='mt-5 flex justify-end gap-2'>
							<button type='button' onClick={() => setQuestionOpen(false)} className='h-10 rounded-md border border-[#d6e4e6] px-4 text-sm text-[#506b72]'>取消</button>
							<button type='button' onClick={verifyAnswer} className='flex h-10 items-center gap-1.5 rounded-md bg-[#075a7b] px-4 text-sm font-medium text-white'><CheckIcon className='size-4' /> 验证并编辑</button>
						</div>
					</div>
				</div>
			)}

			{expanded && !editing && (
				<div className='fixed inset-0 z-[60] grid place-items-center bg-[#173239]/35 p-4 backdrop-blur-sm' role='dialog' aria-modal='true' aria-label={expanded.title} onMouseDown={() => setExpandedId(null)}>
					<div className='max-h-[calc(100vh-32px)] w-full max-w-6xl overflow-y-auto rounded-md bg-white shadow-2xl' onMouseDown={event => event.stopPropagation()}>
						<div className='flex items-center justify-between border-b border-[#e0eaeb] px-5 py-4'>
							<div>
								<p className='text-xs text-[#b06062]'>{formatTimelineDate(expanded.datetime).year}年{formatTimelineDate(expanded.datetime).month}{formatTimelineDate(expanded.datetime).day}日</p>
								<h2 className='mt-1 text-xl font-semibold text-[#244750]'>{expanded.title}</h2>
							</div>
							<button type='button' onClick={() => setExpandedId(null)} aria-label='关闭' className='grid size-9 place-items-center rounded-md text-[#6c858b] hover:bg-[#edf5f5]'><XIcon className='size-5' /></button>
						</div>
						<div className='grid grid-cols-[minmax(0,1fr)_260px] gap-5 p-5 max-lg:grid-cols-1'>
							<div className='min-w-0'>
							<div className='relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-md bg-[#edf4f3]'>
								{expanded.images.length ? (
									<img src={expanded.images[activeImage]} alt={`${expanded.title} 第 ${activeImage + 1} 张`} className='h-auto max-h-[calc(100vh-260px)] w-auto max-w-full object-contain' />
								) : (
									<CalendarHeartIcon className='size-16 text-[#b7cdd0]' strokeWidth={1.2} />
								)}
								{expanded.images.length > 1 && (
									<>
										<button type='button' aria-label='上一张' onClick={() => setActiveImage(index => (index - 1 + expanded.images.length) % expanded.images.length)} className='absolute left-3 grid size-9 place-items-center rounded-full bg-white/90 text-[#244750] shadow'><ChevronLeftIcon className='size-5' /></button>
										<button type='button' aria-label='下一张' onClick={() => setActiveImage(index => (index + 1) % expanded.images.length)} className='absolute right-3 grid size-9 place-items-center rounded-full bg-white/90 text-[#244750] shadow'><ChevronRightIcon className='size-5' /></button>
									</>
								)}
							</div>
							{expanded.images.length > 1 && <div className='mt-3 flex gap-2 overflow-x-auto pb-1'>{expanded.images.map((image, index) => <button type='button' key={`${image}-${index}`} onClick={() => setActiveImage(index)} className={cn('size-16 shrink-0 overflow-hidden rounded-md border-2', activeImage === index ? 'border-[#c7696b]' : 'border-transparent opacity-65')}><img src={image} alt={`缩略图 ${index + 1}`} className='size-full object-cover' /></button>)}</div>}
							</div>
							<section className='min-w-0 self-start rounded-md bg-[#f5f9f8] p-4'>
								<p className='text-xs font-medium text-[#7c999e]'>记录</p>
								<p className='mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#536e74]'>{expanded.description || '暂未添加文字描述。'}</p>
							</section>
						</div>
					</div>
				</div>
			)}

			{editorOpen && <div className='fixed inset-0 z-[70] grid place-items-center bg-[#173239]/35 p-4 backdrop-blur-sm' role='dialog' aria-modal='true' aria-label='编辑 φφ 日记'><div className='max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-md bg-white p-5 shadow-2xl'><div className='flex items-center justify-between border-b border-[#e0eaeb] pb-3'><h2 className='text-lg font-semibold text-[#244750]'>{entries.some(entry => entry.id === draft.id) ? '编辑日记' : '新增日记'}</h2><button type='button' onClick={() => setEditorOpen(false)} aria-label='关闭' className='grid size-8 place-items-center rounded-md text-[#6c858b] hover:bg-[#edf5f5]'><XIcon className='size-4' /></button></div><div className='mt-5 grid grid-cols-2 gap-4 max-sm:grid-cols-1'><label className='block text-sm font-medium text-[#3f5b62]'>时间<input type='datetime-local' value={draft.datetime} onChange={event => setDraft(current => ({ ...current, datetime: event.target.value }))} className='mt-1.5 h-10 w-full rounded-md border border-[#d6e4e6] px-3 text-sm outline-none focus:border-[#075a7b]' /></label><label className='block text-sm font-medium text-[#3f5b62]'>标题<input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder='例如：第一次去公园' className='mt-1.5 h-10 w-full rounded-md border border-[#d6e4e6] px-3 text-sm outline-none focus:border-[#075a7b]' /></label></div><label className='mt-4 block text-sm font-medium text-[#3f5b62]'>描述<textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} rows={5} placeholder='写下这一天的记忆...' className='mt-1.5 w-full resize-y rounded-md border border-[#d6e4e6] px-3 py-2 text-sm leading-6 outline-none focus:border-[#075a7b]' /></label><div className='mt-4'><div className='flex items-center justify-between'><p className='text-sm font-medium text-[#3f5b62]'>图片</p><button type='button' onClick={() => imageInputRef.current?.click()} className='flex h-9 items-center gap-1 rounded-md border border-[#c7696b] bg-[#fff4f4] px-3 text-sm text-[#a65356]'><ImagePlusIcon className='size-4' /> 上传图片</button></div><div className='mt-3 flex flex-wrap gap-3'>{draft.images.length ? draft.images.map((image, index) => <div key={`${image}-${index}`} className='group relative size-20 overflow-hidden rounded-md border border-[#d7e6e7]'><img src={image} alt={`待上传图片 ${index + 1}`} className='size-full object-cover' /><button type='button' onClick={() => setDraft(current => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))} aria-label={`删除图片 ${index + 1}`} className='absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-white/90 text-[#b55a5e] opacity-0 shadow transition group-hover:opacity-100'><XIcon className='size-3.5' /></button></div>) : <div className='grid h-20 w-full place-items-center rounded-md border border-dashed border-[#c9dce0] text-xs text-[#7b969c]'>可以一次选择多张图片</div>}</div></div><div className='mt-6 flex items-center justify-between gap-3'><button type='button' onClick={() => removeEntry(draft.id)} disabled={!entries.some(entry => entry.id === draft.id)} className='flex h-10 items-center gap-1 rounded-md border border-[#edced0] px-3 text-sm text-[#ad565a] disabled:invisible'><Trash2Icon className='size-4' /> 删除</button><div className='flex gap-2'><button type='button' onClick={() => setEditorOpen(false)} className='h-10 rounded-md border border-[#d6e4e6] px-4 text-sm text-[#506b72]'>取消</button><button type='button' onClick={saveDraft} className='flex h-10 items-center gap-1 rounded-md bg-[#075a7b] px-4 text-sm font-medium text-white'><CheckIcon className='size-4' /> 确认</button></div></div></div></div>}
		</div>
	)
}
