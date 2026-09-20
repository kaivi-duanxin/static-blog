'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Download, Expand, Home, LoaderCircle, Shrink } from 'lucide-react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import styles from './book.module.css'

const BOOK_URL = process.env.NEXT_PUBLIC_BOOK_URL || '/api/book'
const PAGE_RATIO = 437.04 / 613.92

type Direction = 'forward' | 'backward'

type FlipState = {
	direction: Direction
	fromPage: number
	toPage: number
}

function normalizeDesktopPage(page: number) {
	if (page <= 1) return 1
	return page % 2 === 0 ? page : page - 1
}

function getSpreadPages(page: number, totalPages: number): [number | null, number | null] {
	if (page === 1) return [null, 1]
	return [page, page + 1 <= totalPages ? page + 1 : null]
}

function PdfPage({ pdf, pageNumber, side }: { pdf: PDFDocumentProxy; pageNumber: number; side: 'left' | 'right' }) {
	const hostRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [rendering, setRendering] = useState(true)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let page: PDFPageProxy | null = null
		let task: RenderTask | null = null
		let stopped = false
		let resizeTimer: ReturnType<typeof setTimeout> | null = null

		const render = async () => {
			const host = hostRef.current
			const canvas = canvasRef.current
			if (!host || !canvas || host.clientWidth === 0) return

			try {
				setRendering(true)
				setFailed(false)
				page = await pdf.getPage(pageNumber)
				if (stopped) return

				const baseViewport = page.getViewport({ scale: 1 })
				const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
				const scale = (host.clientWidth / baseViewport.width) * pixelRatio
				const viewport = page.getViewport({ scale })
				const context = canvas.getContext('2d', { alpha: false })
				if (!context) throw new Error('Canvas is unavailable')

				canvas.width = Math.ceil(viewport.width)
				canvas.height = Math.ceil(viewport.height)
				canvas.style.width = `${host.clientWidth}px`
				canvas.style.height = `${host.clientWidth / PAGE_RATIO}px`
				task = page.render({ canvas, canvasContext: context, viewport })
				await task.promise
				if (!stopped) setRendering(false)
			} catch (error) {
				if (!stopped && (error as Error)?.name !== 'RenderingCancelledException') {
					console.error(`Failed to render PDF page ${pageNumber}`, error)
					setFailed(true)
					setRendering(false)
				}
			}
		}

		const observer = new ResizeObserver(() => {
			if (resizeTimer) clearTimeout(resizeTimer)
			resizeTimer = setTimeout(() => {
				task?.cancel()
				void render()
			}, 120)
		})

		if (hostRef.current) observer.observe(hostRef.current)
		void render()

		return () => {
			stopped = true
			observer.disconnect()
			if (resizeTimer) clearTimeout(resizeTimer)
			task?.cancel()
			page?.cleanup()
		}
	}, [pageNumber, pdf])

	return (
		<div ref={hostRef} className={`${styles.page} ${styles[side]}`} aria-label={`第 ${pageNumber} 页`}>
			<canvas ref={canvasRef} className={styles.canvas} />
			{rendering && !failed && (
				<div className={styles.pageLoading}>
					<LoaderCircle aria-hidden='true' />
				</div>
			)}
			{failed && <div className={styles.pageError}>第 {pageNumber} 页加载失败</div>}
			<span className={styles.pageNumber}>{pageNumber}</span>
		</div>
	)
}

export default function BookReader() {
	const readerRef = useRef<HTMLDivElement>(null)
	const loadingTaskRef = useRef<{ destroy: () => Promise<void> } | null>(null)
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
	const [totalPages, setTotalPages] = useState(0)
	const [currentPage, setCurrentPage] = useState(1)
	const [flip, setFlip] = useState<FlipState | null>(null)
	const [isSinglePage, setIsSinglePage] = useState(false)
	const [isFullscreen, setIsFullscreen] = useState(false)
	const [error, setError] = useState('')
	const [jumpValue, setJumpValue] = useState('1')

	useEffect(() => {
		const query = window.matchMedia('(max-width: 720px)')
		const update = () => setIsSinglePage(query.matches)
		update()
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])

	useEffect(() => {
		setFlip(null)
		if (!isSinglePage) {
			setCurrentPage(page => normalizeDesktopPage(page))
		}
	}, [isSinglePage])

	useEffect(() => {
		let cancelled = false

		void (async () => {
			try {
				const pdfjs = await import('pdfjs-dist')
				pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
				const loadingTask = pdfjs.getDocument({
					url: BOOK_URL,
					rangeChunkSize: 256 * 1024,
					disableStream: true,
					disableAutoFetch: true
				})
				loadingTaskRef.current = loadingTask
				const document = await loadingTask.promise
				if (cancelled) {
					await loadingTask.destroy()
					return
				}
				setPdf(document)
				setTotalPages(document.numPages)
			} catch (loadError) {
				console.error('Failed to load Kaivi Books', loadError)
				if (!cancelled) setError('书籍加载失败，请确认本地 PDF 路径或线上书籍地址可用。')
			}
		})()

		return () => {
			cancelled = true
			void loadingTaskRef.current?.destroy()
			loadingTaskRef.current = null
		}
	}, [])

	useEffect(() => {
		setJumpValue(String(currentPage))
	}, [currentPage])

	useEffect(() => {
		const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
		document.addEventListener('fullscreenchange', onFullscreenChange)
		return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
	}, [])

	const canGoBack = currentPage > 1
	const canGoForward = currentPage < totalPages
	const isTurning = Boolean(flip)

	useEffect(() => {
		if (!flip) return
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		const timer = window.setTimeout(() => {
			setCurrentPage(flip.toPage)
			setFlip(null)
		}, reduceMotion ? 0 : 680)
		return () => window.clearTimeout(timer)
	}, [flip])

	const turnToPage = useCallback(
		(toPage: number, direction: Direction) => {
			if (flip || toPage === currentPage) return
			setFlip({ direction, fromPage: currentPage, toPage })
		},
		[currentPage, flip]
	)

	const goBack = useCallback(() => {
		if (!canGoBack || isTurning) return
		const target = isSinglePage ? Math.max(1, currentPage - 1) : currentPage <= 2 ? 1 : currentPage - 2
		turnToPage(target, 'backward')
	}, [canGoBack, currentPage, isSinglePage, isTurning, turnToPage])

	const goForward = useCallback(() => {
		if (!canGoForward || isTurning) return
		const target = isSinglePage ? Math.min(totalPages, currentPage + 1) : currentPage === 1 ? 2 : Math.min(totalPages, currentPage + 2)
		turnToPage(target, 'forward')
	}, [canGoForward, currentPage, isSinglePage, isTurning, totalPages, turnToPage])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'ArrowLeft') {
				event.preventDefault()
				goBack()
			}
			if (event.key === 'ArrowRight' || event.key === ' ') {
				event.preventDefault()
				goForward()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [goBack, goForward])

	const staticPages = useMemo(() => {
		if (isSinglePage) return [flip?.toPage ?? currentPage]
		if (!flip) return getSpreadPages(currentPage, totalPages)

		const from = getSpreadPages(flip.fromPage, totalPages)
		const to = getSpreadPages(flip.toPage, totalPages)
		return flip.direction === 'forward' ? [from[0], to[1]] : [to[0], from[1]]
	}, [currentPage, flip, isSinglePage, totalPages])

	const turningPages = useMemo(() => {
		if (!flip) return null
		if (isSinglePage) return { front: flip.fromPage, back: flip.toPage }

		const from = getSpreadPages(flip.fromPage, totalPages)
		const to = getSpreadPages(flip.toPage, totalPages)
		return flip.direction === 'forward'
			? { front: from[1], back: to[0] }
			: { front: from[0], back: to[1] }
	}, [flip, isSinglePage, totalPages])

	const pageLabel = useMemo(() => {
		if (!totalPages) return '正在读取页数'
		if (isSinglePage || currentPage === totalPages) return `${currentPage} / ${totalPages}`
		if (currentPage === 1) return `封面 · 1 / ${totalPages}`
		return `${currentPage}-${Math.min(currentPage + 1, totalPages)} / ${totalPages}`
	}, [currentPage, isSinglePage, totalPages])

	const jumpToPage = () => {
		const requested = Number(jumpValue)
		if (!Number.isFinite(requested) || totalPages === 0 || isTurning) return
		const bounded = Math.min(totalPages, Math.max(1, Math.floor(requested)))
		const target = isSinglePage ? bounded : normalizeDesktopPage(bounded)
		setJumpValue(String(target))
		turnToPage(target, target >= currentPage ? 'forward' : 'backward')
	}

	const renderPage = (pageNumber: number | null, side: 'left' | 'right', key: string) =>
		pageNumber ? (
			<PdfPage key={key} pdf={pdf!} pageNumber={pageNumber} side={side} />
		) : (
			<div key={key} className={`${styles.page} ${styles.blank}`} aria-hidden='true' />
		)

	const toggleFullscreen = async () => {
		if (!readerRef.current) return
		if (document.fullscreenElement) await document.exitFullscreen()
		else await readerRef.current.requestFullscreen()
	}

	return (
		<div ref={readerRef} className={styles.reader}>
			<header className={styles.header}>
				<div className={styles.identity}>
					<span className={styles.mark}>
						<BookOpen aria-hidden='true' />
					</span>
					<div>
						<p className={styles.eyebrow}>Personal archive</p>
						<h1>Kaivi Books</h1>
					</div>
				</div>
				<div className={styles.headerActions}>
					<Link href='/' className={styles.iconButton} aria-label='返回首页' title='返回首页'>
						<Home aria-hidden='true' />
					</Link>
					<a href={BOOK_URL} download='Kaivi-books.pdf' className={styles.iconButton} aria-label='下载原书' title='下载原书'>
						<Download aria-hidden='true' />
					</a>
					<button type='button' className={styles.iconButton} onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '全屏阅读'} title={isFullscreen ? '退出全屏' : '全屏阅读'}>
						{isFullscreen ? <Shrink aria-hidden='true' /> : <Expand aria-hidden='true' />}
					</button>
				</div>
			</header>

			<main className={styles.stage}>
				{error ? (
					<div className={styles.errorPanel}>
						<BookOpen aria-hidden='true' />
						<h2>暂时无法打开这本书</h2>
						<p>{error}</p>
					</div>
				) : !pdf ? (
					<div className={styles.loadingPanel}>
						<LoaderCircle aria-hidden='true' />
						<p>正在翻开 Kaivi Books</p>
						<span>正在按需读取当前书页</span>
					</div>
				) : (
					<div className={styles.bookArea}>
						<button type='button' onClick={goBack} disabled={!canGoBack || isTurning} className={`${styles.turnButton} ${styles.previous}`} aria-label='上一页'>
							<ArrowLeft aria-hidden='true' />
						</button>

						<div className={`${styles.spread} ${isSinglePage ? styles.single : ''} ${isTurning ? styles.turning : ''}`}>
							{staticPages.map((pageNumber, index) =>
								renderPage(pageNumber, isSinglePage || index === 0 ? 'left' : 'right', `static-${index}-${pageNumber ?? 'blank'}`)
							)}

							{flip && turningPages && (
								<div className={`${styles.flipSheet} ${styles[flip.direction]}`} aria-hidden='true'>
									<div className={`${styles.sheetFace} ${styles.sheetFront}`}>
										{renderPage(turningPages.front, flip.direction === 'forward' || isSinglePage ? 'right' : 'left', `front-${turningPages.front ?? 'blank'}`)}
									</div>
									<div className={`${styles.sheetFace} ${styles.sheetBack}`}>
										{renderPage(turningPages.back, flip.direction === 'forward' && !isSinglePage ? 'left' : 'right', `back-${turningPages.back ?? 'blank'}`)}
									</div>
								</div>
							)}

							{!isSinglePage && <span className={styles.binding} aria-hidden='true' />}
							<button
								type='button'
								className={`${styles.clickZone} ${styles.leftZone}`}
								onClick={goBack}
								disabled={!canGoBack || isTurning}
								aria-label='点击左页，翻到上一页'
							/>
							<button
								type='button'
								className={`${styles.clickZone} ${styles.rightZone}`}
								onClick={goForward}
								disabled={!canGoForward || isTurning}
								aria-label='点击右页，翻到下一页'
							/>
						</div>

						<button type='button' onClick={goForward} disabled={!canGoForward || isTurning} className={`${styles.turnButton} ${styles.next}`} aria-label='下一页'>
							<ArrowRight aria-hidden='true' />
						</button>
					</div>
				)}
			</main>

			{pdf && (
				<footer className={styles.controls}>
					<button type='button' onClick={goBack} disabled={!canGoBack || isTurning} className={styles.controlButton}>
						<ArrowLeft aria-hidden='true' />
						<span>上一页</span>
					</button>
					<div className={styles.progressGroup}>
						<label className={styles.jumpField}>
							<span className='sr-only'>跳转页码</span>
							<input
								type='number'
								min={1}
								max={totalPages}
								value={jumpValue}
								onChange={event => setJumpValue(event.target.value)}
								onBlur={jumpToPage}
								onKeyDown={event => event.key === 'Enter' && jumpToPage()}
							/>
							<span>{pageLabel}</span>
						</label>
						<input
							type='range'
							min={1}
							max={totalPages}
							value={currentPage}
							disabled={isTurning}
							onChange={event => {
								const page = Number(event.target.value)
								const target = isSinglePage ? page : normalizeDesktopPage(page)
								turnToPage(target, target >= currentPage ? 'forward' : 'backward')
							}}
							className={styles.progress}
							aria-label='阅读进度'
						/>
					</div>
					<button type='button' onClick={goForward} disabled={!canGoForward || isTurning} className={styles.controlButton}>
						<span>下一页</span>
						<ArrowRight aria-hidden='true' />
					</button>
				</footer>
			)}
		</div>
	)
}
