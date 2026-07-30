'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	ImagePlusIcon,
	LocateFixedIcon,
	MinusIcon,
	NetworkIcon,
	PencilIcon,
	PlusIcon,
	RotateCcwIcon,
	SaveIcon,
	Trash2Icon,
	UserRoundIcon,
	XIcon
} from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import sourceTreeConfig from '@/config/source-family-tree.json'
import { useAuthStore } from '@/hooks/use-auth'
import { readFileAsText } from '@/lib/file-utils'
import { pushSourceTree, resetSourceTree } from './services/push-source-tree'
import { sourcePeople, type SourcePerson } from './data'

	type EditablePerson = SourcePerson & { photo?: string }
	type Position = { x: number; y: number }
	type PositionedPerson = EditablePerson & Position
	type EditorDraft = { name: string; note: string; photo: string; gender: SourcePerson['gender'] }
type EditingSnapshot = { people: EditablePerson[]; positions: Record<string, Position>; linkMiddles: Record<string, number> }

const LEGACY_STORAGE_KEY = 'source-family-tree-v1'
const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 1520
const PERSON_WIDTH = 40
const PERSON_HEIGHT = 116
const ROW_GAP = 168
const COLUMN_GAP = 46

const maleCardClass = 'bg-[#075a7b] text-white shadow-[0_12px_26px_rgba(7,90,123,0.18)]'
const femaleCardClass = 'bg-[#c09a7f] text-white shadow-[0_12px_26px_rgba(192,154,127,0.18)]'

function getChildren(person: EditablePerson, people: EditablePerson[]) {
	const relationIds = new Set([person.id, ...(person.partnerIds ?? [])])
	return people.filter(item => item.parents?.some(parentId => relationIds.has(parentId)))
}

function buildDefaultPositions(people: EditablePerson[]) {
	const generations = new Map<number, EditablePerson[]>()

	for (const person of people) {
		const group = generations.get(person.generation) ?? []
		group.push(person)
		generations.set(person.generation, group)
	}

	const positions: Record<string, Position> = {}

	for (const [generation, group] of [...generations.entries()].sort(([a], [b]) => a - b)) {
		const rowWidth = group.length * PERSON_WIDTH + Math.max(0, group.length - 1) * COLUMN_GAP
		const startX = CANVAS_WIDTH / 2 - rowWidth / 2
		const y = 52 + (generation - 1) * ROW_GAP

		group.forEach((person, index) => {
			positions[person.id] = { x: startX + index * (PERSON_WIDTH + COLUMN_GAP), y }
		})
	}

	return positions
}

function PersonCard({
	person,
	selected,
	size = 'normal',
	onSelect
}: {
	person: EditablePerson
	selected: boolean
	size?: 'normal' | 'large'
	onSelect: (id: string) => void
}) {
	const isLarge = size === 'large'

	return (
		<button
			type='button'
			aria-pressed={selected}
			onClick={() => onSelect(person.id)}
			className={cn(
				'relative flex shrink-0 flex-col items-center justify-start rounded-md border border-white/50 transition',
				'hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075a7b]',
				person.gender === 'male' ? maleCardClass : femaleCardClass,
				selected && 'ring-4 ring-[#f1c35f] ring-offset-2 ring-offset-white',
				isLarge ? 'h-[150px] w-[54px] gap-2 px-2 py-3' : 'h-[116px] w-[40px] gap-1.5 px-1.5 py-2'
			)}>
			<span className={cn('grid overflow-hidden rounded-full bg-white/92 text-[#075a7b]', isLarge ? 'size-6 place-items-center' : 'size-5 place-items-center')}>
				{person.photo ? (
					<img src={person.photo} alt={`${person.name} 照片`} className='size-full object-cover' />
				) : (
					<UserRoundIcon className={cn(isLarge ? 'size-4' : 'size-3.5')} strokeWidth={2.4} />
				)}
			</span>
			<span className={cn('font-medium leading-tight tracking-normal', isLarge ? 'text-base' : 'text-sm')} style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>
				{person.name}
			</span>
			{person.note && <span className='absolute -top-1 -left-1 h-3 w-3 rounded-full border border-white bg-[#f1c35f]' />}
		</button>
	)
}

function RelationGroup({
	title,
	people,
	selectedId,
	onSelect
}: {
	title: string
	people: EditablePerson[]
	selectedId: string
	onSelect: (id: string) => void
}) {
	return (
		<section className='min-h-[194px]'>
			<div className='mb-3 flex items-center gap-2'>
				<span className='h-px flex-1 bg-[#d7e3e6]' />
				<h2 className='text-sm font-medium text-[#37535d]'>{title}</h2>
				<span className='h-px flex-1 bg-[#d7e3e6]' />
			</div>
			<div className='flex min-h-[154px] flex-wrap items-center justify-center gap-3 rounded-md border border-[#dce7ea] bg-white/70 p-4'>
				{people.length > 0 ? (
					people.map(person => <PersonCard key={person.id} person={person} selected={person.id === selectedId} size='large' onSelect={onSelect} />)
				) : (
					<span className='text-sm text-[#7d9198]'>待补充</span>
				)}
			</div>
		</section>
	)
}

export default function SourcePage() {
	const configuredTree = sourceTreeConfig as Partial<EditingSnapshot>
	const hasSavedTree = Array.isArray(configuredTree.people) && configuredTree.people.length > 0
	const initialPeople = useMemo(() => (hasSavedTree ? configuredTree.people! : sourcePeople), [hasSavedTree])
	const defaults = useMemo(() => buildDefaultPositions(initialPeople), [initialPeople])
	const [people, setPeople] = useState<EditablePerson[]>(initialPeople)
	const [positions, setPositions] = useState<Record<string, Position>>({ ...defaults, ...configuredTree.positions })
	const [linkMiddles, setLinkMiddles] = useState<Record<string, number>>(configuredTree.linkMiddles ?? {})
	const [selectedId, setSelectedId] = useState(initialPeople.some(person => person.id === 'g8-kai') ? 'g8-kai' : initialPeople[0]?.id ?? '')
	const [scale, setScale] = useState(0.72)
	const [pan, setPan] = useState({ x: -140, y: -32 })
	const [editing, setEditing] = useState(false)
	const [snapshot, setSnapshot] = useState<EditingSnapshot | null>(null)
	const [editorId, setEditorId] = useState<string | null>(null)
	const [profileId, setProfileId] = useState<string | null>(null)
	const [editorDraft, setEditorDraft] = useState<EditorDraft>({ name: '', note: '', photo: '', gender: 'male' })
	const [alignmentGuide, setAlignmentGuide] = useState<{ x: number; fromY: number; toY: number } | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const { isAuth, setPrivateKey } = useAuthStore()
	const viewportRef = useRef<HTMLDivElement>(null)
	const photoInputRef = useRef<HTMLInputElement>(null)
	const keyInputRef = useRef<HTMLInputElement>(null)
	const dragRef = useRef({ kind: 'canvas' as 'canvas' | 'person' | 'link', id: '', startX: 0, startY: 0, panX: 0, panY: 0, x: 0, y: 0, lockedY: 0, middleY: 0 })
	const suppressClickUntilRef = useRef(0)

	useEffect(() => {
		if (hasSavedTree) return

		const migrateLegacyTree = async () => {
			try {
				const stored = window.localStorage.getItem(LEGACY_STORAGE_KEY)
				if (!stored) return
				const parsed = JSON.parse(stored) as Partial<EditingSnapshot>
				if (!Array.isArray(parsed.people) || parsed.people.length === 0) return

				const legacyPeople = parsed.people
				const legacyTree: EditingSnapshot = {
					people: legacyPeople,
					positions: { ...buildDefaultPositions(legacyPeople), ...parsed.positions },
					linkMiddles: parsed.linkMiddles ?? {}
				}
				setPeople(legacyTree.people)
				setPositions(legacyTree.positions)
				setLinkMiddles(legacyTree.linkMiddles)
				setSelectedId(legacyTree.people.some(person => person.id === 'g8-kai') ? 'g8-kai' : legacyTree.people[0].id)

				const savedTree = await pushSourceTree(legacyTree)
				setPeople(savedTree.people)
				setPositions(savedTree.positions)
				setLinkMiddles(savedTree.linkMiddles)
				window.localStorage.removeItem(LEGACY_STORAGE_KEY)
			} catch (error) {
				console.error('Failed to migrate legacy family tree edits:', error)
			}
		}

		void migrateLegacyTree()
	}, [hasSavedTree])

	const positionedPeople = useMemo<PositionedPerson[]>(
		() => people.map(person => ({ ...person, ...(positions[person.id] ?? defaults[person.id]) })),
		[defaults, people, positions]
	)
	const peopleMap = useMemo(() => new Map(people.map(person => [person.id, person])), [people])
	const positionMap = useMemo(() => new Map(positionedPeople.map(person => [person.id, person])), [positionedPeople])
	const selected = peopleMap.get(selectedId) ?? people[0]
	const profilePerson = profileId ? peopleMap.get(profileId) : undefined

	const parents = useMemo(() => {
		const parentIds = selected.parents?.length ? selected.parents : selected.partnerIds?.flatMap(id => peopleMap.get(id)?.parents ?? []) ?? []
		return [...new Set(parentIds)].map(id => peopleMap.get(id)).filter((person): person is EditablePerson => Boolean(person))
	}, [peopleMap, selected])

	const children = useMemo(() => getChildren(selected, people), [people, selected])

	const sameGeneration = useMemo(() => {
		const familyIds = new Set([selected.id, ...(selected.partnerIds ?? [])])
		return people.filter(person => person.generation === selected.generation && (familyIds.has(person.id) || person.id !== selected.id))
	}, [people, selected])

	const links = useMemo(() => {
		const result: Array<{ fromX: number; fromY: number; toX: number; toY: number; childId: string; midY: number }> = []

		for (const child of positionedPeople) {
			if (!child.parents?.length) continue
			const parents = child.parents.map(id => positionMap.get(id)).filter((person): person is PositionedPerson => Boolean(person))
			if (!parents.length) continue

			const fromX = parents.reduce((sum, parent) => sum + parent.x + PERSON_WIDTH / 2, 0) / parents.length
			const fromY = Math.max(...parents.map(parent => parent.y + PERSON_HEIGHT))
			const toY = child.y
			const defaultMidY = fromY + Math.max(34, (toY - fromY) / 2)
			const minMidY = fromY + 24
			const maxMidY = toY - 24
			const configuredMidY = linkMiddles[child.id] ?? defaultMidY
			const midY = maxMidY > minMidY ? Math.min(maxMidY, Math.max(minMidY, configuredMidY)) : defaultMidY
			result.push({ fromX, fromY, toX: child.x + PERSON_WIDTH / 2, toY, childId: child.id, midY })
		}

		return result
	}, [linkMiddles, positionMap, positionedPeople])

	const partnerLinks = useMemo(() => {
		const seen = new Set<string>()
		const result: Array<{ id: string; from: PositionedPerson; to: PositionedPerson }> = []

		for (const person of positionedPeople) {
			for (const partnerId of person.partnerIds ?? []) {
				const partner = positionMap.get(partnerId)
				if (!partner || partner.gender === person.gender) continue
				const id = [person.id, partner.id].sort().join(':')
				if (seen.has(id)) continue
				seen.add(id)
				result.push({ id, from: person, to: partner })
			}
		}

		return result
	}, [positionMap, positionedPeople])

	const getCanvasPoint = (clientX: number, clientY: number) => {
		const rect = viewportRef.current?.getBoundingClientRect()
		if (!rect) return { x: 0, y: 0 }
		return { x: (clientX - rect.left - pan.x) / scale, y: (clientY - rect.top - pan.y) / scale }
	}

	const startCanvasDrag: React.PointerEventHandler<HTMLDivElement> = event => {
		if ((event.target as HTMLElement).closest('button, input, textarea, label')) return
		setAlignmentGuide(null)
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { kind: 'canvas', id: '', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, x: 0, y: 0, lockedY: 0, middleY: 0 }
	}

	const startPersonDrag = (event: React.PointerEvent<HTMLDivElement>, person: PositionedPerson) => {
		if (!editing) return
		event.preventDefault()
		event.stopPropagation()
		event.currentTarget.setPointerCapture(event.pointerId)
		const firstInGeneration = positionedPeople
			.filter(item => item.generation === person.generation)
			.reduce((first, item) => (item.x < first.x ? item : first), person)
		dragRef.current = { kind: 'person', id: person.id, startX: event.clientX, startY: event.clientY, panX: 0, panY: 0, x: person.x, y: person.y, lockedY: firstInGeneration.y, middleY: 0 }
	}

	const startLinkDrag = (event: React.PointerEvent<SVGElement>, link: (typeof links)[number]) => {
		if (!editing) return
		event.preventDefault()
		event.stopPropagation()
		setAlignmentGuide(null)
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { kind: 'link', id: link.childId, startX: event.clientX, startY: event.clientY, panX: 0, panY: 0, x: 0, y: 0, lockedY: 0, middleY: link.midY }
	}

	const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = event => {
		const drag = dragRef.current
		if (drag.kind === 'canvas') {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				setPan({ x: drag.panX + event.clientX - drag.startX, y: drag.panY + event.clientY - drag.startY })
			}
			return
		}

		if (drag.kind === 'person') {
			const point = getCanvasPoint(event.clientX, event.clientY)
			const start = getCanvasPoint(drag.startX, drag.startY)
			const person = positionMap.get(drag.id)
			if (!person) return
			const rawX = Math.round(drag.x + point.x - start.x)
			const rawCenterX = rawX + PERSON_WIDTH / 2
			const alignmentTarget = positionedPeople
				.filter(item => item.id !== drag.id && Math.abs(item.generation - person.generation) === 1)
				.reduce<PositionedPerson | undefined>((nearest, item) => {
					if (!nearest || Math.abs(item.x + PERSON_WIDTH / 2 - rawCenterX) < Math.abs(nearest.x + PERSON_WIDTH / 2 - rawCenterX)) return item
					return nearest
				}, undefined)
			const shouldSnap = alignmentTarget && Math.abs(alignmentTarget.x + PERSON_WIDTH / 2 - rawCenterX) <= 14
			const nextX = shouldSnap ? alignmentTarget.x : rawX

			setAlignmentGuide(
				shouldSnap
					? {
							x: alignmentTarget.x + PERSON_WIDTH / 2,
							fromY: alignmentTarget.y + PERSON_HEIGHT / 2,
							toY: drag.lockedY + PERSON_HEIGHT / 2
						}
					: null
			)
			setPositions(current => ({
				...current,
				[drag.id]: { x: nextX, y: drag.lockedY }
			}))
			return
		}

		if (drag.kind === 'link') {
			const link = links.find(item => item.childId === drag.id)
			if (!link) return
			const point = getCanvasPoint(event.clientX, event.clientY)
			const minMidY = link.fromY + 24
			const maxMidY = link.toY - 24
			const nextMidY = maxMidY > minMidY ? Math.min(maxMidY, Math.max(minMidY, point.y)) : link.midY
			setLinkMiddles(current => ({ ...current, [drag.id]: Math.round(nextMidY) }))
		}
	}

	const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = event => {
		const drag = dragRef.current
		if (drag.kind === 'person' && (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3)) {
			suppressClickUntilRef.current = Date.now() + 160
		}
		dragRef.current.kind = 'canvas'
		setAlignmentGuide(null)
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
	}

	const focusSelected = (id = selected.id) => {
		const person = positionMap.get(id)
		if (!person) return
		setSelectedId(id)
		setScale(0.96)
		setPan({ x: 420 - (person.x + PERSON_WIDTH / 2) * 0.96, y: 290 - (person.y + PERSON_HEIGHT / 2) * 0.96 })
	}

	const openEditor = (id: string) => {
		const person = peopleMap.get(id)
		if (!person) return
		setSelectedId(id)
		setEditorId(id)
		setEditorDraft({ name: person.name, note: person.note ?? '', photo: person.photo ?? '', gender: person.gender })
	}

	const selectPerson = (id: string) => {
		if (Date.now() < suppressClickUntilRef.current) return
		if (editing) {
			openEditor(id)
		} else {
			focusSelected(id)
			const person = peopleMap.get(id)
			if (person?.photo || person?.note) setProfileId(id)
		}
	}

	const resetView = () => {
		setScale(0.72)
		setPan({ x: -140, y: -32 })
	}

	const handleCanvasWheel: React.WheelEventHandler<HTMLDivElement> = event => {
		event.preventDefault()
		const rect = viewportRef.current?.getBoundingClientRect()
		if (!rect) return

		const nextScale = Math.min(1.35, Math.max(0.45, Number((scale + (event.deltaY < 0 ? 0.08 : -0.08)).toFixed(2))))
		if (nextScale === scale) return

		const pointerX = event.clientX - rect.left
		const pointerY = event.clientY - rect.top
		const canvasX = (pointerX - pan.x) / scale
		const canvasY = (pointerY - pan.y) / scale
		setScale(nextScale)
		setPan({ x: pointerX - canvasX * nextScale, y: pointerY - canvasY * nextScale })
	}

	const beginEditing = () => {
		if (!isAuth) {
			keyInputRef.current?.click()
			return
		}
		setProfileId(null)
		setSnapshot({ people: structuredClone(people), positions: structuredClone(positions), linkMiddles: structuredClone(linkMiddles) })
		setEditing(true)
	}

	const saveEditing = async () => {
		if (isSaving) return
		try {
			setIsSaving(true)
			const savedTree = await pushSourceTree({ people, positions, linkMiddles })
			setPeople(savedTree.people)
			setPositions(savedTree.positions)
			setLinkMiddles(savedTree.linkMiddles)
			setSnapshot(null)
			setEditing(false)
		} catch (error) {
			console.error('Failed to save family tree edits:', error)
			window.alert(error instanceof Error ? error.message : '族谱保存失败，请确认已导入 GitHub 密钥后重试。')
		} finally {
			setIsSaving(false)
		}
	}

	const cancelEditing = () => {
		if (snapshot) {
			setPeople(snapshot.people)
			setPositions(snapshot.positions)
			setLinkMiddles(snapshot.linkMiddles)
		}
		setEditorId(null)
		setSnapshot(null)
		setEditing(false)
	}

	const resetSavedTree = async () => {
		if (!isAuth) {
			keyInputRef.current?.click()
			return
		}
		if (!window.confirm('确认恢复初始族谱吗？已上传的人物照片也会一并删除。')) return
		try {
			setIsSaving(true)
			const resetTree = { people: sourcePeople, positions: buildDefaultPositions(sourcePeople), linkMiddles: {} }
			await resetSourceTree(resetTree)
			setPeople(sourcePeople)
			setPositions(resetTree.positions)
			setLinkMiddles({})
			setSelectedId('g8-kai')
		} catch (error) {
			console.error('Failed to reset family tree:', error)
			window.alert(error instanceof Error ? error.message : '恢复初始族谱失败，请确认已导入 GitHub 密钥后重试。')
		} finally {
			setIsSaving(false)
		}
	}

	const handlePrivateKeyChange: React.ChangeEventHandler<HTMLInputElement> = async event => {
		const file = event.target.files?.[0]
		if (!file) return
		try {
			setPrivateKey(await readFileAsText(file))
		} catch (error) {
			console.error('Failed to import GitHub private key:', error)
			window.alert('GitHub 密钥导入失败，请选择有效的 .pem 文件。')
		} finally {
			event.currentTarget.value = ''
		}
	}

	const savePerson = () => {
		if (!editorId || !editorDraft.name.trim()) return
		setPeople(current => current.map(person => (person.id === editorId ? { ...person, name: editorDraft.name.trim(), gender: editorDraft.gender, note: editorDraft.note.trim() || undefined, photo: editorDraft.photo || undefined } : person)))
		setEditorId(null)
	}

	const deletePerson = () => {
		if (!editorId) return
		const person = peopleMap.get(editorId)
		if (!person) return
		if (!window.confirm(`确认删除“${person.name}”吗？这会同时解除与该人物相关的父母和配偶关系。`)) return

		const deletedId = person.id
		setPeople(current =>
			current
				.filter(item => item.id !== deletedId)
				.map(item => {
					const parents = item.parents?.filter(id => id !== deletedId)
					const partnerIds = item.partnerIds?.filter(id => id !== deletedId)
					return {
						...item,
						parents: parents?.length ? parents : undefined,
						partnerIds: partnerIds?.length ? partnerIds : undefined
					}
				})
		)
		setPositions(current => {
			const next = { ...current }
			delete next[deletedId]
			return next
		})
		setLinkMiddles(current => {
			const next = { ...current }
			delete next[deletedId]
			return next
		})
		setSelectedId(people.find(item => item.id !== deletedId)?.id ?? '')
		setEditorId(null)
	}

	const addPerson = (gender: SourcePerson['gender']) => {
		const id = `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		const generation = selected?.generation ?? 1
		const sameGeneration = positionedPeople.filter(person => person.generation === generation)
		const generationBaseline = sameGeneration.length ? sameGeneration.reduce((first, person) => (person.x < first.x ? person : first)) : undefined
		const selectedPosition = positionMap.get(selected.id)
		const inheritedParents = selected.parents?.length
			? selected.parents
			: selected.partnerIds?.flatMap(partnerId => peopleMap.get(partnerId)?.parents ?? []) ?? []
		const nearestMale = sameGeneration
			.filter(person => person.gender === 'male')
			.reduce<PositionedPerson | undefined>((nearest, person) => {
				if (!nearest || Math.abs(person.x - (selectedPosition?.x ?? person.x)) < Math.abs(nearest.x - (selectedPosition?.x ?? nearest.x))) return person
				return nearest
			}, undefined)
		const defaultX = Math.max(120, ...sameGeneration.map(person => person.x + PERSON_WIDTH + 30))
		const pairedX = nearestMale ? nearestMale.x + PERSON_WIDTH + COLUMN_GAP : defaultX
		const person: EditablePerson = {
			id,
			name: gender === 'male' ? '待命名男性' : '待命名女性',
			gender,
			generation,
			...(gender === 'male' && inheritedParents.length ? { parents: [...new Set(inheritedParents)] } : {}),
			...(gender === 'female' && nearestMale ? { partnerIds: [nearestMale.id] } : {})
		}
		const position: Position = {
			x: Math.min(CANVAS_WIDTH - PERSON_WIDTH - 28, gender === 'female' ? pairedX : defaultX),
			y: generationBaseline?.y ?? Math.min(CANVAS_HEIGHT - PERSON_HEIGHT - 28, 52 + (generation - 1) * ROW_GAP)
		}

		setPeople(current =>
			gender === 'female' && nearestMale
				? current.map(item => (item.id === nearestMale.id ? { ...item, partnerIds: [...new Set([...(item.partnerIds ?? []), id])] } : item)).concat(person)
				: [...current, person]
		)
		setPositions(current => ({ ...current, [id]: position }))
		setSelectedId(id)
		setEditorId(id)
		setEditorDraft({ name: person.name, note: '', photo: '', gender })
	}

	const addRelative = (direction: 'parent' | 'child') => {
		const generation = direction === 'parent' ? selected.generation - 1 : selected.generation + 1
		if (generation < 1) return

		const id = `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		const selectedPosition = positionMap.get(selected.id)
		const targetGeneration = positionedPeople.filter(person => person.generation === generation)
		const generationBaseline = targetGeneration.length ? targetGeneration.reduce((first, person) => (person.x < first.x ? person : first)) : undefined
		const person: EditablePerson = {
			id,
			name: direction === 'parent' ? '待命名上一代' : '待命名下一代',
			gender: 'male',
			generation,
			...(direction === 'child' ? { parents: [...new Set([selected.id, ...(selected.partnerIds ?? [])])] } : {})
		}

		setPeople(current =>
			direction === 'parent'
				? current.map(item => (item.id === selected.id ? { ...item, parents: [...new Set([...(item.parents ?? []), id])] } : item)).concat(person)
				: [...current, person]
		)
		setPositions(current => ({
			...current,
			[id]: {
				x: selectedPosition?.x ?? CANVAS_WIDTH / 2 - PERSON_WIDTH / 2,
				y: generationBaseline?.y ?? 52 + (generation - 1) * ROW_GAP
			}
		}))
		setSelectedId(id)
		setEditorId(id)
		setEditorDraft({ name: person.name, note: '', photo: '', gender: 'male' })
	}

	const handlePhotoChange: React.ChangeEventHandler<HTMLInputElement> = event => {
		const file = event.target.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => setEditorDraft(current => ({ ...current, photo: typeof reader.result === 'string' ? reader.result : current.photo }))
		reader.readAsDataURL(file)
		event.currentTarget.value = ''
	}

	return (
		<div className='min-h-screen px-6 pt-28 pb-10 max-lg:px-4'>
			<input ref={keyInputRef} type='file' accept='.pem' className='hidden' onChange={handlePrivateKeyChange} />
			<div className='mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_400px] gap-5 max-xl:grid-cols-1'>
				<section className='overflow-hidden rounded-md border border-[#dce7ea] bg-[#f7faf8]/86 shadow-[0_18px_70px_rgba(30,63,72,0.12)] backdrop-blur'>
					<div className='flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7ea] bg-white/78 px-4 py-3'>
						<div className='flex items-center gap-3'>
							<div className='grid size-10 place-items-center rounded-md bg-[#075a7b] text-white'>
								<NetworkIcon className='size-5' />
							</div>
							<div>
								<h1 className='text-lg font-semibold text-[#173b46]'>来源家谱</h1>
								<p className='text-xs text-[#718990]'>{editing ? '编辑人物、位置与连线' : '整体缩略图'}</p>
							</div>
						</div>
						<div className='flex items-center gap-2'>
							{editing ? (
								<>
									<button type='button' onClick={() => addRelative('parent')} disabled={isSaving || selected.generation <= 1} title='新增上一代人物' className='flex h-9 items-center gap-1 rounded-md border border-[#dce7ea] bg-white px-3 text-sm text-[#37535d] disabled:cursor-not-allowed disabled:opacity-45'>
										<ArrowUpIcon className='size-4' /> 上一代
									</button>
									<button type='button' onClick={() => addRelative('child')} disabled={isSaving} title='新增下一代人物' className='flex h-9 items-center gap-1 rounded-md border border-[#dce7ea] bg-white px-3 text-sm text-[#37535d] disabled:cursor-not-allowed disabled:opacity-45'>
										<ArrowDownIcon className='size-4' /> 下一代
									</button>
									<button type='button' onClick={() => addPerson('male')} disabled={isSaving} className='flex h-9 items-center gap-1 rounded-md border border-[#075a7b] bg-[#eaf4f7] px-3 text-sm text-[#075a7b] disabled:cursor-not-allowed disabled:opacity-45'>
										<PlusIcon className='size-4' /> 男性
									</button>
									<button type='button' onClick={() => addPerson('female')} disabled={isSaving} className='flex h-9 items-center gap-1 rounded-md border border-[#c09a7f] bg-[#fbf2eb] px-3 text-sm text-[#9d745a] disabled:cursor-not-allowed disabled:opacity-45'>
										<PlusIcon className='size-4' /> 女性
									</button>
									<button type='button' onClick={cancelEditing} disabled={isSaving} className='flex h-9 items-center gap-1 rounded-md border border-[#dce7ea] bg-white px-3 text-sm text-[#37535d] disabled:cursor-not-allowed disabled:opacity-50'>
										<XIcon className='size-4' /> 取消
									</button>
									<button type='button' onClick={saveEditing} disabled={isSaving} className='flex h-9 items-center gap-1 rounded-md bg-[#075a7b] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50'>
										<SaveIcon className='size-4' /> 保存
									</button>
								</>
							) : (
								<button type='button' onClick={beginEditing} disabled={isSaving} className='flex h-9 items-center gap-1 rounded-md bg-[#075a7b] px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50'>
									<PencilIcon className='size-4' /> {isAuth ? '编辑' : '导入密钥'}
								</button>
							)}
							<button type='button' aria-label='缩小' onClick={() => setScale(value => Math.max(0.45, Number((value - 0.08).toFixed(2))))} className='grid size-9 place-items-center rounded-md border border-[#dce7ea] bg-white text-[#37535d] shadow-sm'>
								<MinusIcon className='size-4' />
							</button>
							<button type='button' aria-label='居中显示' onClick={resetView} className='grid size-9 place-items-center rounded-md border border-[#dce7ea] bg-white text-[#37535d] shadow-sm'>
								<LocateFixedIcon className='size-4' />
							</button>
							<button type='button' aria-label='放大' onClick={() => setScale(value => Math.min(1.35, Number((value + 0.08).toFixed(2))))} className='grid size-9 place-items-center rounded-md border border-[#dce7ea] bg-white text-[#37535d] shadow-sm'>
								<PlusIcon className='size-4' />
							</button>
						</div>
					</div>

					<div
						ref={viewportRef}
						className={cn(
							'h-[calc(100vh-206px)] min-h-[680px] touch-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(7,90,123,0.08)_0,rgba(7,90,123,0)_34%),linear-gradient(#edf4f2_1px,transparent_1px),linear-gradient(90deg,#edf4f2_1px,transparent_1px)] bg-[size:100%_100%,36px_36px,36px_36px]',
							editing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
						)}
						onPointerDown={startCanvasDrag}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
						onWheel={handleCanvasWheel}>
						<motion.div className='relative origin-top-left' animate={{ x: pan.x, y: pan.y, scale }} transition={{ type: 'spring', stiffness: 180, damping: 26 }} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
							<svg className='absolute inset-0 h-full w-full overflow-visible' viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
								{alignmentGuide && (
									<line
										x1={alignmentGuide.x}
										y1={alignmentGuide.fromY}
										x2={alignmentGuide.x}
										y2={alignmentGuide.toY}
										stroke='#d29931'
										strokeWidth='2'
										strokeDasharray='6 6'
										strokeLinecap='round'
									/>
								)}
								{partnerLinks.map(link => {
									const left = link.from.x <= link.to.x ? link.from : link.to
									const right = left.id === link.from.id ? link.to : link.from
									const y = (left.y + right.y) / 2 + PERSON_HEIGHT / 2
									const x1 = left.x + PERSON_WIDTH
									const x2 = right.x
									if (x2 <= x1) return null
									return <line key={link.id} x1={x1} y1={y} x2={x2} y2={y} stroke='#b98768' strokeWidth='2.6' strokeLinecap='round' />
								})}
								{links.map(link => {
									const isActive = link.childId === selected.id || children.some(child => child.id === link.childId)
									const handleX = (link.fromX + link.toX) / 2
									const linkPath = `M ${link.fromX} ${link.fromY + 12} V ${link.midY} H ${link.toX} V ${link.toY - 12}`
									return (
										<g key={`${link.childId}-${link.fromX}-${link.toX}`}>
											{editing && <path d={linkPath} fill='none' stroke='transparent' strokeWidth='18' className='cursor-ns-resize' onPointerDown={event => startLinkDrag(event, link)} />}
											<path d={linkPath} fill='none' stroke={isActive ? '#075a7b' : '#d8e5e7'} strokeWidth={isActive ? 2.4 : 1.6} strokeLinecap='round' strokeLinejoin='round' />
											{editing && (
												<circle cx={handleX} cy={link.midY} r='9' fill='#fff' stroke='#075a7b' strokeWidth='2' className='cursor-ns-resize' onPointerDown={event => startLinkDrag(event, link)} />
											)}
										</g>
									)
								})}
							</svg>

							{positionedPeople.map(person => (
								<div
									key={person.id}
									className={cn('absolute', editing && 'cursor-move')}
									style={{ left: person.x, top: person.y }}
									onPointerDown={event => startPersonDrag(event, person)}>
									<PersonCard person={person} selected={person.id === selected.id} onSelect={selectPerson} />
								</div>
							))}
						</motion.div>
					</div>
				</section>

				<aside className='rounded-md border border-[#dce7ea] bg-white/88 p-4 shadow-[0_18px_70px_rgba(30,63,72,0.1)] backdrop-blur max-xl:grid max-xl:grid-cols-3 max-xl:gap-4 max-md:block max-md:space-y-4'>
					<div className='max-xl:col-span-3 max-md:mb-4'>
						<div className='flex items-center justify-between gap-4'>
							<div>
								<p className='text-xs text-[#718990]'>当前聚焦</p>
								<h2 className='mt-1 text-2xl font-semibold text-[#173b46]'>{selected.name}</h2>
							</div>
							<PersonCard person={selected} selected size='large' onSelect={selectPerson} />
						</div>
						{selected.note && <p className='mt-3 rounded-md bg-[#f9f3dc] px-3 py-2 text-sm text-[#7a5b13]'>{selected.note}</p>}
						{editing && <button type='button' onClick={() => openEditor(selected.id)} className='mt-3 flex h-9 items-center gap-1 rounded-md border border-[#dce7ea] px-3 text-sm text-[#37535d]'><PencilIcon className='size-4' /> 编辑人物资料</button>}
					</div>

					<RelationGroup title='上一代' people={parents} selectedId={selected.id} onSelect={selectPerson} />
					<RelationGroup title='同一代' people={sameGeneration} selectedId={selected.id} onSelect={selectPerson} />
					<RelationGroup title='下一代' people={children} selectedId={selected.id} onSelect={selectPerson} />
					<button type='button' onClick={resetSavedTree} disabled={isSaving} className='mt-4 flex h-9 items-center gap-1 text-xs text-[#718990] hover:text-[#075a7b] disabled:cursor-not-allowed disabled:opacity-50'>
						<RotateCcwIcon className='size-3.5' /> 恢复初始族谱
					</button>
				</aside>
			</div>

			{editorId && (
				<div className='fixed inset-0 z-[70] grid place-items-center bg-[#16303a]/35 p-4' role='dialog' aria-modal='true' aria-label='编辑人物资料'>
					<div className='w-full max-w-md rounded-md bg-white p-5 shadow-2xl'>
						<div className='flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-[#173b46]'>编辑人物资料</h2>
							<button type='button' aria-label='关闭' onClick={() => setEditorId(null)} className='grid size-8 place-items-center rounded-md text-[#718990] hover:bg-[#edf4f2]'><XIcon className='size-4' /></button>
						</div>
						<div className='mt-5 space-y-4'>
							<label className='block text-sm font-medium text-[#37535d]'>
								姓名
								<input value={editorDraft.name} onChange={event => setEditorDraft(current => ({ ...current, name: event.target.value }))} className='mt-1.5 h-10 w-full rounded-md border border-[#dce7ea] px-3 text-sm outline-none focus:border-[#075a7b]' />
							</label>
							<div>
								<p className='text-sm font-medium text-[#37535d]'>性别</p>
								<div className='mt-1.5 grid grid-cols-2 gap-2'>
									<button type='button' onClick={() => setEditorDraft(current => ({ ...current, gender: 'male' }))} className={cn('h-9 rounded-md border text-sm', editorDraft.gender === 'male' ? 'border-[#075a7b] bg-[#eaf4f7] text-[#075a7b]' : 'border-[#dce7ea] text-[#718990]')}>男性</button>
									<button type='button' onClick={() => setEditorDraft(current => ({ ...current, gender: 'female' }))} className={cn('h-9 rounded-md border text-sm', editorDraft.gender === 'female' ? 'border-[#c09a7f] bg-[#fbf2eb] text-[#9d745a]' : 'border-[#dce7ea] text-[#718990]')}>女性</button>
								</div>
							</div>
							<label className='block text-sm font-medium text-[#37535d]'>
								人物说明
								<textarea value={editorDraft.note} onChange={event => setEditorDraft(current => ({ ...current, note: event.target.value }))} rows={4} className='mt-1.5 w-full resize-y rounded-md border border-[#dce7ea] px-3 py-2 text-sm outline-none focus:border-[#075a7b]' />
							</label>
							<div>
								<p className='text-sm font-medium text-[#37535d]'>照片</p>
								<div className='mt-1.5 flex items-center gap-3'>
									<div className='grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-[#edf4f2] text-[#718990]'>
										{editorDraft.photo ? <img src={editorDraft.photo} alt='人物照片预览' className='size-full object-cover' /> : <UserRoundIcon className='size-7' />}
									</div>
									<input ref={photoInputRef} type='file' accept='image/*' className='hidden' onChange={handlePhotoChange} />
									<button type='button' onClick={() => photoInputRef.current?.click()} className='flex h-9 items-center gap-1 rounded-md border border-[#dce7ea] px-3 text-sm text-[#37535d]'><ImagePlusIcon className='size-4' /> 上传照片</button>
									{editorDraft.photo && <button type='button' onClick={() => setEditorDraft(current => ({ ...current, photo: '' }))} className='grid size-9 place-items-center rounded-md border border-[#dce7ea] text-[#a34d4d]' aria-label='移除照片'><Trash2Icon className='size-4' /></button>}
								</div>
							</div>
						</div>
						<div className='mt-6 flex items-center justify-between gap-2'>
							<button type='button' onClick={deletePerson} className='flex h-9 items-center gap-1 rounded-md border border-[#e8c3c3] px-3 text-sm text-[#a34d4d] hover:bg-[#fff3f3]'>
								<Trash2Icon className='size-4' /> 删除人物
							</button>
							<div className='flex gap-2'>
							<button type='button' onClick={() => setEditorId(null)} className='h-9 rounded-md border border-[#dce7ea] px-4 text-sm text-[#37535d]'>取消</button>
							<button type='button' onClick={savePerson} disabled={!editorDraft.name.trim()} className='flex h-9 items-center gap-1 rounded-md bg-[#075a7b] px-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50'><CheckIcon className='size-4' /> 确认</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{profilePerson && !editing && (
				<div
					className='fixed inset-0 z-[65] grid place-items-center bg-[#16303a]/35 p-4'
					role='dialog'
					aria-modal='true'
					aria-label={`${profilePerson.name} 人物资料`}
					onMouseDown={() => setProfileId(null)}>
					<div className='w-full max-w-[620px] rounded-md bg-white p-5 shadow-2xl' onMouseDown={event => event.stopPropagation()}>
						<div className='flex items-center justify-between gap-4 border-b border-[#dce7ea] pb-3'>
							<div>
								<p className='text-xs text-[#718990]'>人物资料</p>
								<h2 className='mt-1 text-xl font-semibold text-[#173b46]'>{profilePerson.name}</h2>
							</div>
							<button type='button' aria-label='关闭人物资料' onClick={() => setProfileId(null)} className='grid size-8 place-items-center rounded-md text-[#718990] hover:bg-[#edf4f2]'>
								<XIcon className='size-4' />
							</button>
						</div>
						<div className='mt-5 grid grid-cols-[216px_minmax(0,1fr)] gap-5 max-sm:grid-cols-1'>
							<div className='grid h-72 w-[216px] max-sm:w-full place-items-center overflow-hidden rounded-md bg-[#edf4f2] text-[#718990]'>
								{profilePerson.photo ? (
									<img src={profilePerson.photo} alt={`${profilePerson.name} 的照片`} className='size-full object-cover' />
								) : (
									<UserRoundIcon className='size-14' strokeWidth={1.5} />
								)}
							</div>
							<div className='min-w-0'>
								<p className='text-sm font-medium text-[#37535d]'>人物简介</p>
								<p className='mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#526b73]'>{profilePerson.note || '暂未填写人物简介。'}</p>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
