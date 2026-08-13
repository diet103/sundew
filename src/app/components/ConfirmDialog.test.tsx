// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(() => {
    cleanup();
});

function renderDialog(overrides: { onConfirm?: () => void; onCancel?: () => void } = {}) {
    const onConfirm = overrides.onConfirm ?? vi.fn();
    const onCancel = overrides.onCancel ?? vi.fn();
    render(
        <ConfirmDialog
            title="Delete this thing?"
            body="This cannot be undone."
            confirmLabel="Delete thing"
            danger
            onConfirm={onConfirm}
            onCancel={onCancel}
        />,
    );
    return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
    it('focuses Cancel first: the safe answer to a destructive question', () => {
        renderDialog();
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    it('confirms and cancels through the buttons', () => {
        const { onConfirm, onCancel } = renderDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Delete thing' }));
        expect(onConfirm).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('closes on Escape and on a scrim click, but not on a dialog click', () => {
        const { onCancel } = renderDialog();
        const dialog = screen.getByRole('dialog', { name: 'Delete this thing?' });
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);

        fireEvent.pointerDown(dialog);
        expect(onCancel).toHaveBeenCalledTimes(1);
        const scrim = dialog.parentElement!;
        fireEvent.pointerDown(scrim);
        expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it('traps Tab between its two buttons', () => {
        renderDialog();
        const dialog = screen.getByRole('dialog', { name: 'Delete this thing?' });
        const cancel = screen.getByRole('button', { name: 'Cancel' });
        const confirm = screen.getByRole('button', { name: 'Delete thing' });

        // Shift+Tab from the first focusable wraps to the last.
        cancel.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
        expect(confirm).toHaveFocus();
        // Tab from the last wraps back to the first.
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(cancel).toHaveFocus();
    });
});
