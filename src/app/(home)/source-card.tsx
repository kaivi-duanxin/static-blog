'use client'

import Card from '@/components/card'
import { CARD_SPACING } from '@/consts'
import { useCenterStore } from '@/hooks/use-center'
import SourceFilledSVG from '@/svgs/source-filled.svg'
import { useRouter } from 'next/navigation'
import { useConfigStore } from './stores/config-store'
import { HomeDraggableLayer } from './home-draggable-layer'

export default function SourceCard() {
	const center = useCenterStore()
	const router = useRouter()
	const { cardStyles } = useConfigStore()
	const styles = cardStyles.sourceCard
	const hiCardStyles = cardStyles.hiCard
	const socialButtonsStyles = cardStyles.socialButtons
	const shareCardStyles = cardStyles.shareCard

	const x =
		styles.offsetX !== null
			? center.x + styles.offsetX
			: center.x + hiCardStyles.width / 2 - socialButtonsStyles.width + shareCardStyles.width + CARD_SPACING + 72
	const y =
		styles.offsetY !== null
			? center.y + styles.offsetY
			: center.y + hiCardStyles.height / 2 + CARD_SPACING + socialButtonsStyles.height + CARD_SPACING + 12

	return (
		<HomeDraggableLayer cardKey='sourceCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='p-3 max-sm:static'>
				<button type='button' onClick={() => router.push('/source')} className='group flex h-full w-full flex-col items-center justify-center gap-2 rounded-[inherit]'>
					<div className='relative grid size-14 place-items-center rounded-md bg-[#075a7b] text-white shadow-[0_12px_24px_rgba(7,90,123,0.24)]'>
						<SourceFilledSVG className='size-8' />
						<span className='absolute -right-1 -bottom-1 h-4 w-4 rounded-full border-2 border-white bg-[#c09a7f]' />
					</div>
					<span className='text-sm font-medium text-[#173b46]'>来源</span>
				</button>
			</Card>
		</HomeDraggableLayer>
	)
}
