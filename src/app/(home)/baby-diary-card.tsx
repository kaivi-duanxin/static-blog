'use client'

import { CalendarHeartIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Card from '@/components/card'
import { CARD_SPACING } from '@/consts'
import { useCenterStore } from '@/hooks/use-center'
import { HomeDraggableLayer } from './home-draggable-layer'
import { useConfigStore } from './stores/config-store'

export default function BabyDiaryCard() {
	const center = useCenterStore()
	const router = useRouter()
	const { cardStyles } = useConfigStore()
	const styles = cardStyles.babyDiaryCard
	const hiCardStyles = cardStyles.hiCard
	const socialButtonsStyles = cardStyles.socialButtons

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x - hiCardStyles.width / 2 - styles.width - CARD_SPACING
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y + hiCardStyles.height / 2 + socialButtonsStyles.height + CARD_SPACING * 2

	return (
		<HomeDraggableLayer cardKey='babyDiaryCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='p-3 max-sm:static'>
				<button type='button' onClick={() => router.push('/baby-diary')} className='group flex h-full w-full flex-col items-center justify-center gap-2 rounded-[inherit]'>
					<div className='grid size-14 place-items-center rounded-md bg-[#c7696b] text-white shadow-[0_12px_24px_rgba(199,105,107,0.24)]'><CalendarHeartIcon className='size-8' /></div>
					<span className='text-sm font-medium text-[#173b46]'>φφ日记</span>
				</button>
			</Card>
		</HomeDraggableLayer>
	)
}
