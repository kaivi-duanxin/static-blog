export type SourcePerson = {
	id: string
	name: string
	gender: 'male' | 'female'
	generation: number
	parents?: string[]
	partnerIds?: string[]
	note?: string
}

export const sourcePeople: SourcePerson[] = [
	{ id: 'g1-grandfather', name: '曾祖公', gender: 'male', generation: 1, partnerIds: ['g1-grandmother'], note: '一世祖' },
	{ id: 'g1-grandmother', name: '梁氏', gender: 'female', generation: 1, partnerIds: ['g1-grandfather'] },

	{ id: 'g2-rongxiang', name: '李荣祥', gender: 'male', generation: 2, parents: ['g1-grandfather', 'g1-grandmother'], partnerIds: ['g2-spouse'] },
	{ id: 'g2-spouse', name: '梁氏', gender: 'female', generation: 2, partnerIds: ['g2-rongxiang'] },
	{ id: 'g2-ronghua', name: '李荣华', gender: 'male', generation: 2, parents: ['g1-grandfather', 'g1-grandmother'] },
	{ id: 'g2-rongshu', name: '李荣树', gender: 'male', generation: 2, parents: ['g1-grandfather', 'g1-grandmother'] },

	{ id: 'g3-changjin', name: '李昌进', gender: 'male', generation: 3, parents: ['g2-rongxiang', 'g2-spouse'], partnerIds: ['g3-spouse'] },
	{ id: 'g3-spouse', name: '曾氏', gender: 'female', generation: 3, partnerIds: ['g3-changjin'] },
	{ id: 'g3-changda', name: '李昌达', gender: 'male', generation: 3, parents: ['g2-rongxiang', 'g2-spouse'] },
	{ id: 'g3-changde', name: '李昌德', gender: 'male', generation: 3, parents: ['g2-rongxiang', 'g2-spouse'] },

	{ id: 'g4-dazhun', name: '李大准', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'], partnerIds: ['g4-spouse'] },
	{ id: 'g4-spouse', name: '罗氏', gender: 'female', generation: 4, partnerIds: ['g4-dazhun'] },
	{ id: 'g4-dahai', name: '李大海', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'] },
	{ id: 'g4-datong', name: '李大通', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'] },
	{ id: 'g4-dalang', name: '李大浪', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'] },
	{ id: 'g4-daze', name: '李大泽', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'] },
	{ id: 'g4-dahan', name: '李大汉', gender: 'male', generation: 4, parents: ['g3-changjin', 'g3-spouse'] },

	{ id: 'g5-xingshi', name: '李兴仕', gender: 'male', generation: 5, parents: ['g4-dazhun', 'g4-spouse'], partnerIds: ['g5-spouse'] },
	{ id: 'g5-spouse', name: '黄小女', gender: 'female', generation: 5, partnerIds: ['g5-xingshi'] },

	{ id: 'g6-fuyu', name: '李辅玉', gender: 'male', generation: 6, parents: ['g5-xingshi', 'g5-spouse'], partnerIds: ['g6-spouse'] },
	{ id: 'g6-spouse', name: '妻氏', gender: 'female', generation: 6, partnerIds: ['g6-fuyu'] },

	{ id: 'g7-shitai', name: '李石太', gender: 'male', generation: 7, parents: ['g6-fuyu', 'g6-spouse'], partnerIds: ['g7-spouse'] },
	{ id: 'g7-spouse', name: '庄石溪', gender: 'female', generation: 7, partnerIds: ['g7-shitai'] },
	{ id: 'g7-danu', name: '李大女', gender: 'female', generation: 7, parents: ['g6-fuyu', 'g6-spouse'] },
	{ id: 'g7-shiping', name: '李士平', gender: 'male', generation: 7, parents: ['g6-fuyu', 'g6-spouse'] },

	{ id: 'g8-kai', name: '李凯', gender: 'male', generation: 8, parents: ['g7-shitai', 'g7-spouse'], partnerIds: ['g8-duanxin'], note: '当前支系' },
	{ id: 'g8-duanxin', name: '段昕', gender: 'female', generation: 8, partnerIds: ['g8-kai'] },
	{ id: 'g8-zhuo', name: '李卓', gender: 'male', generation: 8, parents: ['g7-shitai', 'g7-spouse'], partnerIds: ['g8-lijixiang'] },
	{ id: 'g8-lijixiang', name: '李吉祥', gender: 'female', generation: 8, partnerIds: ['g8-zhuo'] },
	{ id: 'g8-liufanghong', name: '周桥红', gender: 'male', generation: 8, parents: ['g7-danu'] },
	{ id: 'g8-liufangxue', name: '周桥雪', gender: 'male', generation: 8, parents: ['g7-danu'] },
	{ id: 'g8-fengjie', name: '李凤杰', gender: 'female', generation: 8, parents: ['g7-shiping'] }
]
