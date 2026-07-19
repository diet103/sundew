// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormDefinition, Question } from '@shared/schema';
import { hasOptions } from '@shared/schema';
import { Q_FOUND, specimenIntake } from '@shared/seed';
import { ErrorSummary } from './ErrorSummary';
import { FormRenderer } from './FormRenderer';
import { useFillState } from './useFillState';

function questionByTitle(def: FormDefinition, title: string): Question {
    for (const section of def.sections) {
        for (const question of section.questions) {
            if (question.title === title) return question;
        }
    }
    throw new Error(`No question titled "${title}"`);
}

function optionIdByLabel(def: FormDefinition, questionTitle: string, optionLabel: string): string {
    const question = questionByTitle(def, questionTitle);
    if (!hasOptions(question)) throw new Error(`"${questionTitle}" has no options`);
    const option = question.options.find((o) => o.label === optionLabel);
    if (option === undefined) throw new Error(`No option labeled "${optionLabel}"`);
    return option.id;
}

function Harness({ definition }: { definition: FormDefinition }) {
    const fill = useFillState(definition);
    return (
        <div>
            <ErrorSummary errors={fill.summaryErrors} definition={definition} />
            <FormRenderer
                definition={definition}
                answers={fill.answers}
                onAnswer={fill.setAnswer}
                errors={fill.errors}
            />
            <button type="button" onClick={() => fill.validate()}>
                Submit
            </button>
            <button type="button" onClick={() => fill.reset()}>
                Reset
            </button>
            <output data-testid="answers-json">{JSON.stringify(fill.answers)}</output>
        </div>
    );
}

function readAnswers(): Record<string, unknown> {
    const json = screen.getByTestId('answers-json').textContent ?? '{}';
    return JSON.parse(json) as Record<string, unknown>;
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
});

describe('FormRenderer visibility', () => {
    it('hides conditional sections until their rule matches', () => {
        render(<Harness definition={specimenIntake()} />);
        expect(screen.getByRole('heading', { name: 'Field report' })).toBeInTheDocument();
        expect(screen.queryByText('Botanical notes')).not.toBeInTheDocument();
        expect(screen.queryByText('Arachnid notes')).not.toBeInTheDocument();
    });

    it('reveals the matching section in document order after answering the radio', () => {
        render(<Harness definition={specimenIntake()} />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
        expect(titles).toEqual(['Field report', 'Botanical notes', 'Wrap-up']);
        expect(screen.queryByText('Arachnid notes')).not.toBeInTheDocument();
    });
});

describe('validation', () => {
    it('shows inline errors and summary links that focus the control', () => {
        const definition = specimenIntake();
        render(<Harness definition={definition} />);
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

        // Two visible required questions: the date and the radio.
        expect(screen.getAllByText('This question is required')).toHaveLength(2);
        expect(screen.getByText('Fix 2 problems')).toBeInTheDocument();

        const dateId = questionByTitle(definition, 'Date observed').id;
        const dateControl = document.getElementById(`${dateId}-control`);
        expect(dateControl).toHaveAttribute('aria-invalid', 'true');
        expect(dateControl?.getAttribute('aria-describedby')).toContain(`${dateId}-error`);

        const dateLink = screen.getByRole('link', { name: /Date observed/ });
        expect(dateLink).toHaveAttribute('href', `#${dateId}-control`);
        fireEvent.click(dateLink);
        expect(dateControl).toHaveFocus();

        // Group controls (fieldsets) are focusable via tabIndex for the summary.
        fireEvent.click(screen.getByRole('link', { name: /What did you find/ }));
        expect(document.getElementById(`${Q_FOUND}-control`)).toHaveFocus();

        // Answering clears that question's inline error.
        fireEvent.change(dateControl as HTMLInputElement, { target: { value: '2026-07-18' } });
        expect(document.getElementById(`${dateId}-error`)).toBeNull();
    });
});

describe('field round-trips', () => {
    it('toggles checkbox membership and drops the answer when emptied', () => {
        const definition = specimenIntake();
        render(<Harness definition={definition} />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        const conditionsId = questionByTitle(definition, 'Growing conditions').id;

        fireEvent.click(screen.getByRole('checkbox', { name: 'Bog' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Windowsill' }));
        expect(screen.getByRole('checkbox', { name: 'Bog' })).toBeChecked();
        expect(readAnswers()[conditionsId]).toEqual([
            optionIdByLabel(definition, 'Growing conditions', 'Bog'),
            optionIdByLabel(definition, 'Growing conditions', 'Windowsill'),
        ]);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Bog' }));
        expect(screen.getByRole('checkbox', { name: 'Bog' })).not.toBeChecked();
        expect(readAnswers()[conditionsId]).toEqual([
            optionIdByLabel(definition, 'Growing conditions', 'Windowsill'),
        ]);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Windowsill' }));
        expect(conditionsId in readAnswers()).toBe(false);
    });

    it('selects a rating and clears it via the clear button', () => {
        const definition = specimenIntake();
        render(<Harness definition={definition} />);
        const ratingId = questionByTitle(definition, 'How exciting was the find?').id;
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
        expect(readAnswers()[ratingId]).toBe(4);

        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(ratingId in readAnswers()).toBe(false);
        expect(screen.getByRole('radio', { name: '4' })).not.toBeChecked();
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    });

    it('maps the select placeholder back to an undefined answer', () => {
        const definition = specimenIntake();
        render(<Harness definition={definition} />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        const trapId = questionByTitle(definition, 'Trap type').id;
        const stickyId = optionIdByLabel(definition, 'Trap type', 'Sticky leaf');
        const select = screen.getByLabelText('Trap type');

        fireEvent.change(select, { target: { value: stickyId } });
        expect(readAnswers()[trapId]).toBe(stickyId);

        fireEvent.change(select, { target: { value: '' } });
        expect(trapId in readAnswers()).toBe(false);
        expect(select).toHaveValue('');
    });
});

// Draft persistence moved out of useFillState: migration and store logic are
// covered in drafts/draftStore.test.ts, the wired-up behavior in drafts tests.
