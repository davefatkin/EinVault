import { describe, expect, it } from 'vitest';
import en from './en';
import zhCN from './zh-CN';
import { LOCALE_LABELS, parseAcceptLanguage, resolveLocale, t } from './index';

describe('Simplified Chinese locale', () => {
	it('recognizes browser and saved locale codes', () => {
		expect(resolveLocale('zh-CN')).toBe('zh-CN');
		expect(resolveLocale('zh-cn')).toBe('zh-CN');
		expect(resolveLocale('zh')).toBe('zh-CN');
		expect(resolveLocale('zh-SG')).toBe('zh-CN');
		expect(resolveLocale('zh-Hans')).toBe('zh-CN');
		expect(resolveLocale('zh-Hans-CN')).toBe('zh-CN');
		expect(resolveLocale('zh-TW')).toBe('en');
		expect(resolveLocale('zh-HK')).toBe('en');
		expect(resolveLocale('zh-Hant')).toBe('en');
		expect(resolveLocale('zh-Hant-TW')).toBe('en');
		expect(parseAcceptLanguage('zh-TW,en;q=0.8')).toBe('en');
		expect(parseAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh-CN');
		expect(LOCALE_LABELS['zh-CN']).toBe('简体中文');
	});
	it('matches the complete English catalog and its interpolation parameters', () => {
		const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
		expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
		for (const key of Object.keys(en) as (keyof typeof en)[]) {
			expect(zhCN[key].trim()).not.toBe('');
			expect(placeholders(zhCN[key]), key).toEqual(placeholders(en[key]));
		}
		expect(t('zh-CN', 'overview.greeting', { name: 'Ein' })).toBe('你好，Ein');
	});
});
