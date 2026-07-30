'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2Icon, LightbulbIcon, LockKeyholeIcon, RadioTowerIcon, RotateCcwIcon, ScanLineIcon, SwordsIcon, TrophyIcon } from 'lucide-react'
import { toast } from 'sonner'
import { XIANGQI_ENDGAMES, type XiangqiEndgame } from './xiangqi-endgames'

type Side = 'RED' | 'BLACK'

type PointLike = {
	x: number
	y: number
}

type PieceLike = PointLike & {
	name: string
	side: Side
	getMovePoints: (pieces: PieceLike[]) => Array<PointLike>
}

type MoveResult = {
	flag: boolean
	move?: boolean
	message?: string
}

type ChessGame = {
	gameStart: (side: Side) => void
	setPenCodeList: (fen: string) => void
	changeCurrentPlaySide: (side: Side) => void
	update: (from: PointLike, to: PointLike | null, side: Side, post: boolean) => MoveResult
	listenClickAsync: (event: MouseEvent) => void
	draw: (ctx: CanvasRenderingContext2D) => void
	getCurrentPenCode: (side: Side) => string
	on: (event: 'move' | 'moveFail' | 'over' | 'error', callback: (...args: any[]) => void) => void
	currentLivePieceList: PieceLike[]
	winnerSide: Side | null
}

type ZhChessGlobal = {
	default: new (options: Record<string, unknown>) => ChessGame
	Point: new (x: number, y: number) => PointLike
}

declare global {
	interface Window {
		ZhChess?: ZhChessGlobal
	}
}

type Candidate = {
	from: PointLike
	to: PointLike
	score: number
	check: boolean
}

const BOARD_WIDTH = 540
const BOARD_HEIGHT = 600
const UNLOCKED_LEVEL_STORAGE_KEY = 'xiangqi-endgame-unlocked-level'
const PIECE_VALUE: Record<string, number> = {
	车: 90,
	馬: 45,
	马: 45,
	炮: 45,
	砲: 45,
	相: 20,
	象: 20,
	仕: 20,
	士: 20,
	兵: 12,
	卒: 12,
	帅: 999,
	将: 999
}

function loadRuleScript(): Promise<ZhChessGlobal> {
	if (typeof window === 'undefined') return Promise.reject(new Error('Chess board is only available in the browser.'))

	const loaded = window.ZhChess
	if (loaded) return Promise.resolve(loaded)

	return new Promise((resolve, reject) => {
		const resolveLoadedEngine = () => {
			const engine = window.ZhChess
			if (engine) {
				resolve(engine)
			} else {
				reject(new Error('Xiangqi rules engine did not initialize.'))
			}
		}

		const existing = document.querySelector<HTMLScriptElement>('script[data-zh-chess]')
		if (existing) {
			existing.addEventListener('load', resolveLoadedEngine, { once: true })
			existing.addEventListener('error', () => reject(new Error('Unable to load the Xiangqi rules engine.')), { once: true })
			return
		}

		const script = document.createElement('script')
		script.src = '/vendor/zh-chess.browser.min.js'
		script.async = true
		script.dataset.zhChess = 'true'
		script.onload = resolveLoadedEngine
		script.onerror = () => reject(new Error('Unable to load the Xiangqi rules engine.'))
		document.head.appendChild(script)
	})
}

function otherSide(side: Side): Side {
	return side === 'RED' ? 'BLACK' : 'RED'
}

function pointLabel(point: PointLike): string {
	return `第 ${point.x + 1} 路，第 ${10 - point.y} 线`
}

function createGame(rules: ZhChessGlobal, fen: string, ctx?: CanvasRenderingContext2D): ChessGame {
	const game = new rules.default({
		ctx,
		gameWidth: BOARD_WIDTH,
		gameHeight: BOARD_HEIGHT,
		gamePadding: 24,
		duration: 160,
		checkerboardBackground: '#071d31',
		boardTextColor: '#4dd9e7',
		redPeiceBackground: '#1d3045',
		blackPeiceBackground: '#132d42',
		redPeiceTextColor: '#ff6474',
		blackPeiceTextColor: '#67e9f2',
		choosePeiceBorderColor: '#f7d35f',
		movePointColor: '#64eff2',
		drawMovePoint: true
	})
	game.gameStart('RED')
	game.setPenCodeList(fen)
	return game
}

function rankCandidates(rules: ZhChessGlobal, fen: string, side: Side): Candidate[] {
	const seed = createGame(rules, fen)
	const pieces = seed.currentLivePieceList
	const candidates: Candidate[] = []

	for (const piece of pieces.filter(item => item.side === side)) {
		for (const target of piece.getMovePoints(pieces)) {
			const targetPiece = pieces.find(item => item.x === target.x && item.y === target.y)
			if (targetPiece?.side === side) continue

			const probe = createGame(rules, fen)
			let givesCheck = false
			probe.on('move', (_piece, _checkpoint, check) => {
				givesCheck = Boolean(check)
			})
			const result = probe.update(new rules.Point(piece.x, piece.y), new rules.Point(target.x, target.y), side, true)
			if (!result.flag || !result.move) continue

			const captureScore = targetPiece ? PIECE_VALUE[targetPiece.name] ?? 5 : 0
			const centerScore = 8 - Math.abs(target.x - 4) - Math.abs(target.y - 4.5) * 0.3
			const winScore = probe.winnerSide === side ? 10000 : 0
			candidates.push({
				from: { x: piece.x, y: piece.y },
				to: { x: target.x, y: target.y },
				check: givesCheck,
				score: winScore + (givesCheck ? 260 : 0) + captureScore * 8 + centerScore
			})
		}
	}

	return candidates.sort((a, b) => b.score - a.score)
}

export default function XiangqiEndgame() {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const rulesRef = useRef<ZhChessGlobal | null>(null)
	const gameRef = useRef<ChessGame | null>(null)
	const turnRef = useRef<Side>('RED')
	const thinkingRef = useRef(false)
	const timerRef = useRef<number | null>(null)
	const levelRef = useRef<XiangqiEndgame>(XIANGQI_ENDGAMES[0])
	const unlockedLevelRef = useRef(1)
	const completedLevelRef = useRef<number | null>(null)
	const [level, setLevel] = useState<XiangqiEndgame>(XIANGQI_ENDGAMES[0])
	const [unlockedLevel, setUnlockedLevel] = useState(1)
	const [status, setStatus] = useState('正在载入残局…')
	const [hint, setHint] = useState('')
	const [isThinking, setIsThinking] = useState(false)
	const [isReady, setIsReady] = useState(false)

	const drawBoard = useCallback(() => {
		const game = gameRef.current
		const canvas = canvasRef.current
		const ctx = canvas?.getContext('2d')
		if (game && ctx) game.draw(ctx)
	}, [])

	const unlockNextLevel = useCallback((completedLevelId: number) => {
		if (completedLevelRef.current === completedLevelId) return
		completedLevelRef.current = completedLevelId

		const nextUnlockedLevel = Math.min(XIANGQI_ENDGAMES.length, completedLevelId + 1)
		if (nextUnlockedLevel > unlockedLevelRef.current) {
			unlockedLevelRef.current = nextUnlockedLevel
			setUnlockedLevel(nextUnlockedLevel)
			window.localStorage.setItem(UNLOCKED_LEVEL_STORAGE_KEY, String(nextUnlockedLevel))
		}
	}, [])

	const announceWin = useCallback((completedLevelId: number, reason: 'checkmate' | 'no_moves') => {
		if (completedLevelRef.current === completedLevelId) return
		const isFinalLevel = completedLevelId === XIANGQI_ENDGAMES.length
		const title = isFinalLevel ? '十局残局全部完成' : `第 ${completedLevelId} 局通关`
		const description = isFinalLevel
			? '红方取得最终胜利，全部残局已经解锁。'
			: reason === 'checkmate'
				? `红方绝杀，已解锁第 ${completedLevelId + 1} 局。`
				: `黑方无合法走法，已解锁第 ${completedLevelId + 1} 局。`

		toast.success(title, {
			description,
			duration: 5000
		})
	}, [])

	const playComputerTurn = useCallback(() => {
		const rules = rulesRef.current
		const game = gameRef.current
		if (!rules || !game || game.winnerSide || turnRef.current !== 'BLACK') return

		const fen = game.getCurrentPenCode('BLACK')
		const candidates = rankCandidates(rules, fen, 'BLACK')
		const choice = candidates[0]
		if (!choice) {
			announceWin(levelRef.current.id, 'no_moves')
			unlockNextLevel(levelRef.current.id)
			setStatus(levelRef.current.id === XIANGQI_ENDGAMES.length ? '黑方无合法走法，全部残局已完成。' : '黑方无合法走法，过关，下一局已解锁。')
			turnRef.current = 'RED'
			thinkingRef.current = false
			setIsThinking(false)
			return
		}

		const result = game.update(new rules.Point(choice.from.x, choice.from.y), new rules.Point(choice.to.x, choice.to.y), 'BLACK', true)
		if (!result.flag) {
			setStatus('黑方思考失败，请重开本局。')
		} else if (!game.winnerSide) {
			turnRef.current = 'RED'
			setStatus(choice.check ? '黑方将军，轮到红方走棋。' : '黑方已应手，轮到红方走棋。')
		}
		thinkingRef.current = false
		setIsThinking(false)
		drawBoard()
	}, [announceWin, drawBoard, unlockNextLevel])

	const startLevel = useCallback(
		(nextLevel: XiangqiEndgame) => {
			if (!rulesRef.current || !canvasRef.current) return
			if (timerRef.current) window.clearTimeout(timerRef.current)
			levelRef.current = nextLevel
			completedLevelRef.current = null
			turnRef.current = 'RED'
			thinkingRef.current = false
			setIsThinking(false)
			setHint('')
			const context = canvasRef.current.getContext('2d')
			if (!context) return
			const game = createGame(rulesRef.current, nextLevel.fen, context)
			gameRef.current = game

			game.on('move', (piece: PieceLike, _checkpoint: unknown, givesCheck: boolean) => {
				if (piece.side === 'RED') {
					if (game.winnerSide === 'RED') {
						announceWin(nextLevel.id, 'checkmate')
						unlockNextLevel(nextLevel.id)
						setStatus(nextLevel.id === XIANGQI_ENDGAMES.length ? '红方绝杀，十局残局全部完成。' : '红方绝杀，恭喜过关，下一局已解锁。')
						return
					}
					turnRef.current = 'BLACK'
					thinkingRef.current = true
					setIsThinking(true)
					setStatus(givesCheck ? '红方将军，黑方正在应对…' : '红方已走，黑方正在应对…')
					timerRef.current = window.setTimeout(playComputerTurn, 420)
					return
				}

				if (game.winnerSide === 'BLACK') {
					setStatus('黑方绝杀，本局结束。')
				}
			})

			game.on('moveFail', (_from: unknown, _to: unknown, message: string) => {
				if (!thinkingRef.current && message) setStatus(`此步不可走：${message}`)
			})

			game.on('over', (winner: Side) => {
				if (winner === 'RED') {
					announceWin(nextLevel.id, 'checkmate')
					unlockNextLevel(nextLevel.id)
					setStatus(nextLevel.id === XIANGQI_ENDGAMES.length ? '红方绝杀，十局残局全部完成。' : '红方绝杀，恭喜过关，下一局已解锁。')
				} else {
					setStatus('黑方绝杀，本局结束。')
				}
			})

			drawBoard()
			setStatus('红方先行，点击棋子后再点击目标位置。')
			setIsReady(true)
		},
		[announceWin, drawBoard, playComputerTurn, unlockNextLevel]
	)

	useEffect(() => {
		const storedUnlockedLevel = Number(window.localStorage.getItem(UNLOCKED_LEVEL_STORAGE_KEY))
		if (Number.isInteger(storedUnlockedLevel) && storedUnlockedLevel >= 1) {
			const restoredLevel = Math.min(storedUnlockedLevel, XIANGQI_ENDGAMES.length)
			unlockedLevelRef.current = restoredLevel
			setUnlockedLevel(restoredLevel)
		}
	}, [])

	useEffect(() => {
		let disposed = false
		loadRuleScript()
			.then(rules => {
				if (disposed) return
				rulesRef.current = rules
				startLevel(levelRef.current)
			})
			.catch(error => {
				if (!disposed) setStatus(error instanceof Error ? error.message : '残局规则加载失败。')
			})

		return () => {
			disposed = true
			if (timerRef.current) window.clearTimeout(timerRef.current)
		}
	}, [startLevel])

	const handleBoardClick: React.MouseEventHandler<HTMLCanvasElement> = event => {
		const game = gameRef.current
		if (!game || !isReady || thinkingRef.current || turnRef.current !== 'RED' || game.winnerSide) return

		// Delegate pixel-to-grid mapping, selection, and legal move validation to the rules engine.
		const nativeClick = new MouseEvent('click', {
			clientX: event.clientX,
			clientY: event.clientY,
			bubbles: false
		})
		Object.defineProperty(nativeClick, 'offsetX', { value: event.nativeEvent.offsetX })
		Object.defineProperty(nativeClick, 'offsetY', { value: event.nativeEvent.offsetY })
		// The engine's click handler maps pixel coordinates to its internal board grid.
		game.listenClickAsync(nativeClick)
		drawBoard()
	}

	const showHint = () => {
		const rules = rulesRef.current
		const game = gameRef.current
		if (!rules || !game || game.winnerSide || turnRef.current !== 'RED') return
		const best = rankCandidates(rules, game.getCurrentPenCode('RED'), 'RED')[0]
		if (!best) {
			setHint('当前局面没有可用提示。')
			return
		}
		setHint(`建议考虑从 ${pointLabel(best.from)} 走到 ${pointLabel(best.to)}${best.check ? '，可将军。' : '。'}`)
	}

	const chooseLevel = (nextLevel: XiangqiEndgame) => {
		if (nextLevel.id > unlockedLevelRef.current) return
		setLevel(nextLevel)
		startLevel(nextLevel)
	}

	return (
		<div className='relative mx-auto w-full max-w-6xl px-5 pb-10 pt-28 sm:px-8 sm:pt-32'>
			<div aria-hidden className='pointer-events-none absolute inset-x-5 top-24 h-px bg-[#0b7b74]/20 sm:inset-x-8 sm:top-28' />
			<div className='mb-5 flex flex-wrap items-end justify-between gap-4'>
				<div>
					<div className='text-brand flex items-center gap-2 text-sm font-medium'>
						<SwordsIcon className='size-4' /> 中国象棋残局 <span className='h-1.5 w-1.5 rounded-full bg-[#18a887] shadow-[0_0_10px_rgba(24,168,135,0.8)]' />
					</div>
					<h1 className='mt-2 text-2xl font-semibold text-[#29424c]'>十局残局，红方先行</h1>
					<p className='mt-1 text-sm text-[#667d84]'>点击棋子和落点走棋，黑方会在本地自动应手。</p>
				</div>
				<div className='flex items-center gap-3 rounded-lg border border-[#b9d9d5] bg-white/80 px-3 py-2 text-right shadow-sm'>
					<ScanLineIcon className='size-5 text-[#0b7b74]' />
					<div>
						<div className='text-xs text-[#789096]'>当前关卡</div>
						<div className='text-sm font-semibold text-[#29424c]'>第 {level.id} 局 · {level.difficulty}</div>
					</div>
				</div>
			</div>

			<div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]'>
				<section className='relative overflow-hidden rounded-lg border border-[#b9d9d5] bg-[#f6fbfb]/90 shadow-[0_14px_36px_rgba(41,66,76,0.12)]'>
					<div aria-hidden className='pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(11,123,116,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(11,123,116,0.08)_1px,transparent_1px)] [background-size:24px_24px]' />
					<div className='relative flex flex-wrap items-center justify-between gap-3 border-b border-[#b9d9d5] bg-white/80 px-4 py-3'>
						<div>
							<div className='font-semibold text-[#29424c]'>{level.title}</div>
							<div className='mt-0.5 text-xs text-[#718990]'>{level.description}</div>
						</div>
						<div className={`flex items-center gap-1.5 text-xs font-medium ${isThinking ? 'text-[#b47016]' : 'text-[#1b756a]'}`}>
							<RadioTowerIcon className='size-3.5' /> {isThinking ? '黑方思考中' : '红方执棋'}
						</div>
					</div>

					<div className='relative p-3 sm:p-5'>
						<div aria-hidden className='absolute left-4 top-4 h-5 w-5 border-l-2 border-t-2 border-[#0b7b74]/70' />
						<div aria-hidden className='absolute bottom-4 right-4 h-5 w-5 border-b-2 border-r-2 border-[#0b7b74]/70' />
						<div className='relative mx-auto w-full max-w-[540px] overflow-hidden rounded-md border-4 border-[#35c8d4] bg-[#071d31] shadow-[0_0_0_2px_rgba(83,237,239,0.18),0_15px_36px_rgba(5,40,60,0.42)]'>
							<div aria-hidden className='pointer-events-none absolute left-2 top-2 z-10 border border-[#72eff4]/70 bg-[#071829]/90 px-1.5 py-0.5 font-mono text-[9px] text-[#a7fbff]'>NODE-{String(level.id).padStart(2, '0')}</div>
							<div aria-hidden className='pointer-events-none absolute bottom-2 right-2 z-10 border border-[#ff8791]/60 bg-[#241b2c]/90 px-1.5 py-0.5 font-mono text-[9px] text-[#ffb2ba]'>RED VS CYAN</div>
							<canvas
								ref={canvasRef}
								width={BOARD_WIDTH}
								height={BOARD_HEIGHT}
								onClick={handleBoardClick}
								className='block h-auto w-full cursor-pointer touch-manipulation'
								aria-label='中国象棋残局棋盘'
							/>
						</div>
					</div>

					<div className='relative flex flex-wrap items-center gap-2 border-t border-[#b9d9d5] bg-white/80 px-4 py-3'>
						<button type='button' onClick={() => startLevel(level)} className='inline-flex h-9 items-center gap-1.5 rounded-md border border-[#cbdcdd] bg-white px-3 text-sm font-medium text-[#37535d] hover:bg-[#f1f7f7]'>
							<RotateCcwIcon className='size-4' /> 重开
						</button>
						<button type='button' onClick={showHint} disabled={!isReady || isThinking} className='inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0b7b74] px-3 text-sm font-medium text-white hover:bg-[#08655f] disabled:cursor-not-allowed disabled:opacity-50'>
							<LightbulbIcon className='size-4' /> 提示
						</button>
						<div className='min-w-0 flex-1 text-right text-xs text-[#62797f]'>{status}</div>
					</div>
					{hint && <div className='relative border-t border-[#b9d9d5] bg-[#eef9f7] px-4 py-3 text-sm text-[#32605c]'>{hint}</div>}
				</section>

				<aside className='rounded-lg border border-[#b9d9d5] bg-white/85 p-3 shadow-sm'>
					<div className='mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-[#29424c]'>
						<TrophyIcon className='size-4 text-[#d49127]' /> 残局目录
					</div>
					<div className='mb-3 flex items-center justify-between border-y border-[#dcebea] px-1 py-2 font-mono text-[10px] text-[#5f7d81]'>
						<span>LOCAL_ENGINE</span>
						<span className='text-[#0b7b74]'>{unlockedLevel}/{XIANGQI_ENDGAMES.length} UNLOCKED</span>
					</div>
					<div className='grid grid-cols-2 gap-2 lg:grid-cols-1'>
						{XIANGQI_ENDGAMES.map(item => {
							const active = item.id === level.id
							const isUnlocked = item.id <= unlockedLevel
							const isCompleted = item.id < unlockedLevel
							return (
								<button
									key={item.id}
									type='button'
									onClick={() => chooseLevel(item)}
									disabled={!isUnlocked}
									aria-label={isUnlocked ? `进入第 ${item.id} 局：${item.title}` : `第 ${item.id} 局尚未解锁`}
									className={`min-h-14 rounded-md border px-3 py-2 text-left transition-colors ${
										active
											? 'border-[#0b7b74] bg-[#e4f5f2] text-[#155c57]'
											: isUnlocked
												? 'border-[#e0e9e9] bg-white text-[#587177] hover:border-[#9acfc8] hover:bg-[#f5fbfa]'
												: 'cursor-not-allowed border-[#e6ecec] bg-[#f5f7f7] text-[#a0afb2] opacity-75'
									}`}>
									<div className='flex items-center justify-between gap-2 text-sm font-medium'>
										<span className='flex min-w-0 items-center gap-1.5 truncate'>
											{isCompleted ? <CheckCircle2Icon className='size-3.5 shrink-0 text-[#0b7b74]' /> : isUnlocked ? null : <LockKeyholeIcon className='size-3.5 shrink-0' />}
											{String(item.id).padStart(2, '0')} · {item.title}
										</span>
										<span className='shrink-0 text-[11px]'>{item.difficulty}</span>
									</div>
								</button>
							)
						})}
					</div>
				</aside>
			</div>
		</div>
	)
}
