import type { FormDefinition } from './schema';
import { SCHEMA_VERSION } from './schema';

// Fixed ids so the seeded doc is stable across sessions and usable as a test fixture.
const sid = (n: number) => `5eed5ec0-0000-4000-8000-${String(n).padStart(12, '0')}`;
const qid = (n: number) => `5eed0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oid = (q: number, n: number) =>
    `5eed${String(q).padStart(4, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const OPT_PLANT = oid(3, 1);
export const OPT_SPIDER = oid(3, 2);
export const OPT_OTHER = oid(3, 3);
export const Q_FOUND = qid(3);

/**
 * The form a first-time guest lands in: a short field-logging sheet whose own
 * content demonstrates the marquee behaviors (branching sections, every core
 * question type) and whose help texts double as tutorial nudges.
 */
export function specimenIntake(): FormDefinition {
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Specimen intake',
        description:
            'A demo form, already wired with conditional logic. Everything here is editable: click a question to change it, drag to reorder, or add your own.',
        sections: [
            {
                id: sid(1),
                title: 'Field report',
                questions: [
                    {
                        id: qid(1),
                        type: 'shortText',
                        format: 'text',
                        title: 'Observer name',
                        description: 'Click this question to edit it. Everything on this sheet is yours to change.',
                        required: false,
                    },
                    {
                        id: qid(2),
                        type: 'shortText',
                        format: 'date',
                        title: 'Date observed',
                        required: true,
                    },
                    {
                        id: Q_FOUND,
                        type: 'radio',
                        title: 'What did you find?',
                        description: 'Answer choices can reveal follow-up questions. Watch the threads on the left.',
                        required: true,
                        options: [
                            { id: OPT_PLANT, label: 'A plant' },
                            { id: OPT_SPIDER, label: 'A spider' },
                            { id: OPT_OTHER, label: 'Something else' },
                        ],
                    },
                ],
            },
            {
                id: sid(2),
                title: 'Botanical notes',
                visibleWhen: { mode: 'all', rules: [{ when: Q_FOUND, operator: 'equals', value: OPT_PLANT }] },
                questions: [
                    {
                        id: qid(4),
                        type: 'select',
                        title: 'Trap type',
                        required: false,
                        options: [
                            { id: oid(4, 1), label: 'Snap trap' },
                            { id: oid(4, 2), label: 'Sticky leaf' },
                            { id: oid(4, 3), label: 'Pitfall' },
                            { id: oid(4, 4), label: 'No trap at all' },
                        ],
                    },
                    {
                        id: qid(5),
                        type: 'checkbox',
                        title: 'Growing conditions',
                        description: 'Check all that apply.',
                        required: false,
                        options: [
                            { id: oid(5, 1), label: 'Full sun' },
                            { id: oid(5, 2), label: 'Bog' },
                            { id: oid(5, 3), label: 'Terrarium' },
                            { id: oid(5, 4), label: 'Windowsill' },
                        ],
                    },
                ],
            },
            {
                id: sid(3),
                title: 'Arachnid notes',
                visibleWhen: { mode: 'all', rules: [{ when: Q_FOUND, operator: 'equals', value: OPT_SPIDER }] },
                questions: [
                    {
                        id: qid(6),
                        type: 'radio',
                        title: 'Did it jump?',
                        required: false,
                        options: [
                            { id: oid(6, 1), label: 'Yes' },
                            { id: oid(6, 2), label: 'No' },
                            { id: oid(6, 3), label: 'It vanished' },
                        ],
                    },
                ],
            },
            {
                id: sid(4),
                title: 'Wrap-up',
                questions: [
                    {
                        id: qid(7),
                        type: 'rating',
                        title: 'How exciting was the find?',
                        required: false,
                        scale: 5,
                    },
                    {
                        id: qid(8),
                        type: 'longText',
                        title: 'Field notes',
                        description: 'Try dragging this question above the rating. Alt+Arrow works too.',
                        required: false,
                    },
                ],
            },
        ],
        settings: {
            confirmationMessage: 'Logged. Thanks for the field report.',
        },
    };
}
