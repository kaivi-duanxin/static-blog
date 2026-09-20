import type { Metadata } from 'next'
import BookReader from './book-reader'

export const metadata: Metadata = {
	title: 'Kaivi Books',
	description: 'Kaivi 的个人书籍翻页阅读器'
}

export default function BookPage() {
	return <BookReader />
}
