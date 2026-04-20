import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, STORAGE_KEY } from '../../i18n';
import LanguageToggle from './LanguageToggle';

function renderToggle() {
    return render(
        <I18nProvider>
            <LanguageToggle />
        </I18nProvider>,
    );
}

describe('LanguageToggle', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders with EN label by default', () => {
        renderToggle();
        expect(screen.getByRole('button')).toHaveTextContent('EN');
    });

    it('toggles to Bengali on click', async () => {
        const user = userEvent.setup();
        renderToggle();

        await user.click(screen.getByRole('button'));

        expect(screen.getByRole('button')).toHaveTextContent('বা');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('bn');
    });

    it('toggles back to English on second click', async () => {
        const user = userEvent.setup();
        renderToggle();

        await user.click(screen.getByRole('button'));
        await user.click(screen.getByRole('button'));

        expect(screen.getByRole('button')).toHaveTextContent('EN');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    });

    it('starts in Bengali when localStorage has bn', () => {
        localStorage.setItem(STORAGE_KEY, 'bn');
        renderToggle();
        expect(screen.getByRole('button')).toHaveTextContent('বা');
    });
});
