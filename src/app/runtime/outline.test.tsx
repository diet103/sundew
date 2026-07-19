// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useMemo } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateVisibility } from '@shared/visibility';
import { specimenIntake } from '@shared/seed';
import { FillOutline } from './FillOutline';
import { FormRenderer } from './FormRenderer';
import { useFillState } from './useFillState';

// Mirrors the FillPage wiring: one visibility evaluation feeds both the
// outline and the renderer, so the outline always matches the visible form.
function Harness() {
    const definition = useMemo(() => specimenIntake(), []);
    const state = useFillState(definition);
    const visibility = evaluateVisibility(definition, state.answers);
    return (
        <div>
            <FillOutline definition={definition} visibility={visibility} />
            <FormRenderer
                definition={definition}
                answers={state.answers}
                onAnswer={state.setAnswer}
                visibility={visibility}
            />
        </div>
    );
}

function outline() {
    return within(screen.getByRole('navigation', { name: 'Form outline' }));
}

afterEach(cleanup);

describe('FillOutline', () => {
    it('lists only visible sections and questions, numbered in visible order', () => {
        const { container } = render(<Harness />);
        const rows = container.querySelectorAll('.fill-outline-srow');
        expect(rows).toHaveLength(2);
        expect(outline().getByRole('button', { name: /1\..*Field report/ })).toBeInTheDocument();
        expect(outline().getByRole('button', { name: /2\..*Wrap-up/ })).toBeInTheDocument();
        expect(outline().queryByRole('button', { name: /Botanical notes/ })).toBeNull();
        // Hidden sections keep their questions out of the outline too.
        expect(outline().queryByRole('button', { name: 'Trap type' })).toBeNull();
        expect(outline().getByRole('button', { name: 'Observer name' })).toBeInTheDocument();
    });

    it('adds revealed sections the moment an answer shows them', () => {
        const { container } = render(<Harness />);
        fireEvent.click(screen.getByRole('radio', { name: 'A plant' }));
        const rows = container.querySelectorAll('.fill-outline-srow');
        expect(rows).toHaveLength(3);
        // The revealed section slots into visible order: Wrap-up renumbers.
        expect(
            outline().getByRole('button', { name: /2\..*Botanical notes/ }),
        ).toBeInTheDocument();
        expect(outline().getByRole('button', { name: /3\..*Wrap-up/ })).toBeInTheDocument();
        expect(outline().getByRole('button', { name: 'Trap type' })).toBeInTheDocument();
    });
});
