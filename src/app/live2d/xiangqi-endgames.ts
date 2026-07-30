export type XiangqiEndgame = {
	id: number
	title: string
	difficulty: string
	description: string
	fen: string
}

// PEN/FEN positions use uppercase for red and lowercase for black. Red moves first.
export const XIANGQI_ENDGAMES: XiangqiEndgame[] = [
	{
		id: 1,
		title: '炮车破阵',
		difficulty: '中级',
		description: '九子残局。红方车炮兵对黑方炮兵，先建立持续攻势。',
		fen: '3aka3/9/4c4/4p4/9/3P5/4R4/3C5/9/4K4 w'
	},
	{
		id: 2,
		title: '双兵压阵',
		difficulty: '中级',
		description: '十子残局。黑马加入防线，车炮组合需要更准确的配合。',
		fen: '3aka3/9/2n1c4/4p4/9/3P5/4R4/3C5/9/4K4 w'
	},
	{
		id: 3,
		title: '马炮连环',
		difficulty: '中级+',
		description: '十一子残局。红方双兵过河，攻守节奏开始变得关键。',
		fen: '3aka3/9/2n1c4/4p4/4P4/3P5/4R4/3C5/9/4K4 w'
	},
	{
		id: 4,
		title: '攻守转换',
		difficulty: '中级+',
		description: '十二子残局。黑方双仕补全九宫，不能只靠强行将军。',
		fen: '3aka3/4a4/2n1c4/4p4/4P4/3P5/4R4/3C5/9/4K4 w'
	},
	{
		id: 5,
		title: '双车攻城',
		difficulty: '进阶',
		description: '十三子残局。红马作为支点，寻找炮车马的联动入口。',
		fen: '3aka3/4a4/2n1c4/4p4/4P4/3P5/4R4/2NC5/9/4K4 w'
	},
	{
		id: 6,
		title: '中炮残局',
		difficulty: '进阶',
		description: '十四子残局。黑车进入战场，红方必须兼顾底线和攻势。',
		fen: '3aka3/4a4/2n1c4/2r1p4/4P4/3P5/4R4/2NC5/9/4K4 w'
	},
	{
		id: 7,
		title: '车马协同',
		difficulty: '进阶',
		description: '十五子残局。红方双马牵制黑将，计算交换后的残局价值。',
		fen: '3aka3/4a4/2n1c4/2r1p4/4P4/3P5/3NR4/2NC5/9/4K4 w'
	},
	{
		id: 8,
		title: '铁门栓',
		difficulty: '困难',
		description: '十七子残局。红方补齐仕相，防守资源与进攻资源同样重要。',
		fen: '3aka3/4a4/2n1c4/2r1p4/4P4/3P5/3NR4/2NC5/3A5/3AK4 w'
	},
	{
		id: 9,
		title: '多子争胜',
		difficulty: '困难',
		description: '十八子残局。双兵与双马同时存在，每次兑子都会改变局势。',
		fen: '3aka3/4a4/2n1c4/2r1p4/3PP4/3P5/3NR4/2NC5/3A5/3AK4 w'
	},
	{
		id: 10,
		title: '全局决胜',
		difficulty: '挑战',
		description: '十九子残局。双方双车尚存，耐心计算将军、交换与反击。',
		fen: '3aka3/4a4/2n1c4/1r2p4/3PP4/3P5/2RNR4/2NC5/3A5/3AK4 w'
	}
]
