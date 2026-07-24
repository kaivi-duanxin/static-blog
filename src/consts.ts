export const INIT_DELAY = 0.3
export const ANIMATION_DELAY = 0.1
export const CARD_SPACING = 36
export const CARD_SPACING_SM = 24
export const BLOG_SLUG_KEY = process.env.BLOG_SLUG_KEY || ''
const GITHUB_BRANCH = process.env.NEXT_PUBLIC_GITHUB_BRANCH || 'main'
export const LOCAL_SAVE_ENABLED = process.env.NEXT_PUBLIC_LOCAL_SAVE === 'true' && GITHUB_BRANCH !== 'main'

/**
 * GitHub 仓库配置
 */
export const GITHUB_CONFIG = {
	OWNER: process.env.NEXT_PUBLIC_GITHUB_OWNER || 'kaivi-duanxin',
	REPO: process.env.NEXT_PUBLIC_GITHUB_REPO || 'static-blog',
	BRANCH: GITHUB_BRANCH,
	APP_ID: process.env.NEXT_PUBLIC_GITHUB_APP_ID || '-',
	ENCRYPT_KEY: process.env.NEXT_PUBLIC_GITHUB_ENCRYPT_KEY || 'wudishiduomejimo',
} as const
