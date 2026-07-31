export type BabyDiaryEntry = {
	id: string
	datetime: string
	title: string
	description: string
	images: string[]
}

export type BabyDiaryState = {
	entries: BabyDiaryEntry[]
}
