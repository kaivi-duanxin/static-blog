'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from '../app/(home)/stores/config-store'
import { CARD_SPACING } from '@/consts'
import MusicSVG from '@/svgs/music.svg'
import PlaySVG from '@/svgs/play.svg'
import { HomeDraggableLayer } from '../app/(home)/home-draggable-layer'
import { Pause } from 'lucide-react'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

type MusicTrack = {
	id?: string
	title?: string
	url: string
}

const DEFAULT_MUSIC_LABEL = 'music'
const DEFAULT_MUSIC_TRACKS: MusicTrack[] = [
	{ id: '吹梦到西洲', title: '吹梦到西洲', url: '/music/吹梦到西洲.mp3' },
	{ id: '空山新雨后', title: '空山新雨后', url: '/music/空山新雨后.mp3' }
]

const getRandomMusicIndex = (length: number, excludeIndex?: number) => {
	if (length <= 0) return 0
	const candidates = Array.from({ length }, (_, index) => index).filter((index) => index !== excludeIndex)
	const playableIndexes = candidates.length > 0 ? candidates : [0]
	return playableIndexes[Math.floor(Math.random() * playableIndexes.length)]
}

export default function MusicCard() {
	const pathname = usePathname()
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.musicCard
	const hiCardStyles = cardStyles.hiCard
	const clockCardStyles = cardStyles.clockCard
	const calendarCardStyles = cardStyles.calendarCard
	const musicPlayer = (siteContent.musicPlayer ?? {}) as { label?: string; random?: boolean; tracks?: MusicTrack[] }
	const musicLabel = musicPlayer.label || DEFAULT_MUSIC_LABEL
	const musicTracks = useMemo(() => {
		const tracks = (musicPlayer.tracks ?? []).filter(track => track.url)
		return tracks.length > 0 ? tracks : DEFAULT_MUSIC_TRACKS
	}, [musicPlayer.tracks])
	const musicFiles = useMemo(() => musicTracks.map(track => track.url), [musicTracks])
	const randomPlayback = musicPlayer.random !== false

	const [isPlaying, setIsPlaying] = useState(false)
	const [currentIndex, setCurrentIndex] = useState(0)
	const [progress, setProgress] = useState(0)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const currentIndexRef = useRef(currentIndex)
	const isPlayingRef = useRef(false)

	const isHomePage = pathname === '/'

	const position = useMemo(() => {
		// If not on home page, always position at bottom-right corner when playing
		if (!isHomePage) {
			return {
				x: center.width - styles.width - 16,
				y: center.height - styles.height - 16
			}
		}

		// Default position on home page
		return {
			x: styles.offsetX !== null ? center.x + styles.offsetX : center.x + CARD_SPACING + hiCardStyles.width / 2 - styles.offset,
			y: styles.offsetY !== null ? center.y + styles.offsetY : center.y - clockCardStyles.offset + CARD_SPACING + calendarCardStyles.height + CARD_SPACING
		}
	}, [isPlaying, isHomePage, center, styles, hiCardStyles, clockCardStyles, calendarCardStyles])

	const { x, y } = position

	// Initialize audio element
	useEffect(() => {
		if (!audioRef.current) {
			audioRef.current = new Audio()
		}

		const audio = audioRef.current

		const updateProgress = () => {
			if (audio.duration) {
				setProgress((audio.currentTime / audio.duration) * 100)
			}
		}

		const handleEnded = () => {
			const nextIndex = randomPlayback ? getRandomMusicIndex(musicFiles.length, currentIndexRef.current) : (currentIndexRef.current + 1) % musicFiles.length
			currentIndexRef.current = nextIndex
			setCurrentIndex(nextIndex)
			setProgress(0)
		}

		const handleTimeUpdate = () => {
			updateProgress()
		}

		const handleLoadedMetadata = () => {
			updateProgress()
		}

		audio.addEventListener('timeupdate', handleTimeUpdate)
		audio.addEventListener('ended', handleEnded)
		audio.addEventListener('loadedmetadata', handleLoadedMetadata)

		return () => {
			audio.removeEventListener('timeupdate', handleTimeUpdate)
			audio.removeEventListener('ended', handleEnded)
			audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
		}
	}, [musicFiles.length, randomPlayback])

	useEffect(() => {
		const nextIndex = randomPlayback ? getRandomMusicIndex(musicFiles.length, currentIndexRef.current) : 0
		currentIndexRef.current = nextIndex
		setCurrentIndex(nextIndex)
	}, [musicFiles, randomPlayback])

	// Handle currentIndex change - load new audio
	useEffect(() => {
		currentIndexRef.current = currentIndex
		if (audioRef.current && musicFiles[currentIndex]) {
			const shouldPlay = isPlayingRef.current
			audioRef.current.pause()
			audioRef.current.src = musicFiles[currentIndex]
			audioRef.current.loop = false
			setProgress(0)

			if (shouldPlay) {
				audioRef.current.play().catch(console.error)
			}
		}
	}, [currentIndex, musicFiles])

	// Handle play/pause state change
	useEffect(() => {
		isPlayingRef.current = isPlaying
		if (!audioRef.current) return

		if (isPlaying) {
			audioRef.current.play().catch(console.error)
		} else {
			audioRef.current.pause()
		}
	}, [isPlaying])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause()
				audioRef.current.src = ''
			}
		}
	}, [])

	const togglePlayPause = () => {
		setIsPlaying(!isPlaying)
	}

	// Hide component if not on home page and not playing
	if (!isHomePage && !isPlaying) {
		return null
	}

	return (
		<HomeDraggableLayer cardKey='musicCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className={clsx('flex items-center gap-3', !isHomePage && 'fixed')}>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-10.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 120, left: -8, top: -12, opacity: 0.8 }}
						/>
						<img
							src='/images/christmas/snow-11.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 80, right: -10, top: -12, opacity: 0.8 }}
						/>
					</>
				)}

				<MusicSVG className='h-8 w-8' />

				<div className='flex-1'>
					<div className='text-secondary text-sm'>{musicLabel}</div>

					<div className='mt-1 h-2 rounded-full bg-white/60'>
						<div className='bg-linear h-full rounded-full transition-all duration-300' style={{ width: `${progress}%` }} />
					</div>
				</div>

				<button onClick={togglePlayPause} className='flex h-10 w-10 items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80'>
					{isPlaying ? <Pause className='text-brand h-4 w-4' /> : <PlaySVG className='text-brand ml-1 h-4 w-4' />}
				</button>
			</Card>
		</HomeDraggableLayer>
	)
}
