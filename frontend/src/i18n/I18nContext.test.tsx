import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useI18n, STORAGE_KEY } from './I18nContext';

function TestConsumer() {
    const { language, setLanguage, t } = useI18n();
    return (
        <div>
            <span data-testid="lang">{language}</span>
            <span data-testid="translated">{t('common.loading')}</span>
            <span data-testid="with-params">{t('bulkActions.confirmBulkDelete', { count: '5' })}</span>
            <span data-testid="missing-key">{t('nonexistent.key')}</span>
            <button data-testid="switch-bn" onClick={() => setLanguage('bn')}>BN</button>
            <button data-testid="switch-en" onClick={() => setLanguage('en')}>EN</button>
        </div>
    );
}

describe('I18nContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to English when no stored preference', () => {
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );
        expect(screen.getByTestId('lang').textContent).toBe('en');
        expect(screen.getByTestId('translated').textContent).toBe('Loading...');
    });

    it('translates keys with parameter interpolation', () => {
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );
        expect(screen.getByTestId('with-params').textContent).toBe(
            'Are you sure you want to delete 5 selected question(s)?',
        );
    });

    it('returns the key itself for missing translations', () => {
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );
        expect(screen.getByTestId('missing-key').textContent).toBe('nonexistent.key');
    });

    it('switches to Bengali and persists to localStorage', async () => {
        const user = userEvent.setup();
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );

        await user.click(screen.getByTestId('switch-bn'));

        expect(screen.getByTestId('lang').textContent).toBe('bn');
        expect(screen.getByTestId('translated').textContent).toBe('লোড হচ্ছে...');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('bn');
    });

    it('restores language from localStorage on mount', () => {
        localStorage.setItem(STORAGE_KEY, 'bn');
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );
        expect(screen.getByTestId('lang').textContent).toBe('bn');
        expect(screen.getByTestId('translated').textContent).toBe('লোড হচ্ছে...');
    });

    it('switches back to English from Bengali', async () => {
        const user = userEvent.setup();
        localStorage.setItem(STORAGE_KEY, 'bn');
        render(
            <I18nProvider>
                <TestConsumer />
            </I18nProvider>,
        );

        await user.click(screen.getByTestId('switch-en'));

        expect(screen.getByTestId('lang').textContent).toBe('en');
        expect(screen.getByTestId('translated').textContent).toBe('Loading...');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    });

    it('throws when useI18n is used outside provider', () => {
        expect(() => render(<TestConsumer />)).toThrow(
            'useI18n must be used within an I18nProvider',
        );
    });
});
