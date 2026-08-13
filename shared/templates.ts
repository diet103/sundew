import type { FormDefinition } from './schema';
import { SCHEMA_VERSION } from './schema';

// Starting points for the template gallery. Only TemplateGalleryDialog may
// import this module: it rides in that dialog's lazy chunk, off the entry
// and builder budgets. Every template must parse and publish clean - a
// registry test locks that invariant.
//
// Fixed ids per template (prefix distinguishes the family) so docs are
// stable test fixtures, same convention as shared/seed.ts.

function ids(prefix: string) {
    return {
        sid: (n: number) => `${prefix}5ec0-0000-4000-8000-${String(n).padStart(12, '0')}`,
        qid: (n: number) => `${prefix}0000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        oid: (q: number, n: number) =>
            `${prefix}${String(q).padStart(4, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`,
    };
}

export interface TemplateEntry {
    id: string;
    name: string;
    description: string;
    make: () => FormDefinition;
}

function eventRsvp(): FormDefinition {
    const { sid, qid, oid } = ids('7e01');
    const ACCEPTS = oid(3, 1);
    const PLUS_ONE_YES = oid(6, 1);
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Event RSVP',
        description: 'Let us know if you can make it. Two minutes, tops.',
        sections: [
            {
                id: sid(1),
                title: 'Your details',
                questions: [
                    {
                        id: qid(1),
                        type: 'shortText',
                        format: 'text',
                        title: 'Name',
                        placeholder: 'First and last name',
                        required: true,
                    },
                    {
                        id: qid(2),
                        type: 'shortText',
                        format: 'email',
                        title: 'Email',
                        placeholder: 'you@example.com',
                        required: true,
                    },
                    {
                        id: qid(3),
                        type: 'radio',
                        title: 'Will you attend?',
                        required: true,
                        options: [
                            { id: ACCEPTS, label: 'Joyfully accepts' },
                            { id: oid(3, 2), label: 'Regretfully declines' },
                            { id: oid(3, 3), label: 'Not sure yet' },
                        ],
                    },
                ],
            },
            {
                id: sid(2),
                title: 'Meal and party',
                visibleWhen: { mode: 'all', rules: [{ when: qid(3), operator: 'equals', value: ACCEPTS }] },
                questions: [
                    {
                        id: qid(4),
                        type: 'select',
                        title: 'Meal choice',
                        required: true,
                        options: [
                            { id: oid(4, 1), label: 'Chicken' },
                            { id: oid(4, 2), label: 'Fish' },
                            { id: oid(4, 3), label: 'Vegetarian' },
                            { id: oid(4, 4), label: 'Vegan' },
                        ],
                    },
                    {
                        id: qid(5),
                        type: 'checkbox',
                        title: 'Dietary notes',
                        required: false,
                        options: [
                            { id: oid(5, 1), label: 'Gluten-free' },
                            { id: oid(5, 2), label: 'Nut allergy' },
                            { id: oid(5, 3), label: 'Dairy-free' },
                        ],
                    },
                    {
                        id: qid(6),
                        type: 'radio',
                        title: 'Bringing a plus one?',
                        required: true,
                        options: [
                            { id: PLUS_ONE_YES, label: 'Yes' },
                            { id: oid(6, 2), label: 'No' },
                        ],
                    },
                    {
                        id: qid(7),
                        type: 'shortText',
                        format: 'text',
                        title: 'Plus one name',
                        required: true,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: qid(6), operator: 'equals', value: PLUS_ONE_YES }],
                        },
                    },
                ],
            },
            {
                id: sid(3),
                title: 'One more thing',
                questions: [
                    {
                        id: qid(8),
                        type: 'longText',
                        title: 'Note for the hosts',
                        maxLength: 500,
                        required: false,
                    },
                ],
            },
        ],
        settings: { confirmationMessage: 'Thanks · see you there.' },
    };
}

function customerFeedback(): FormDefinition {
    const { sid, qid, oid } = ids('7e02');
    const FOLLOW_YES = oid(4, 1);
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Customer feedback',
        description: 'Tell us how it went. The form adapts to your answers.',
        sections: [
            {
                id: sid(1),
                title: 'Overall',
                questions: [
                    {
                        id: qid(1),
                        type: 'rating',
                        title: 'How likely are you to recommend us?',
                        scale: 10,
                        lowLabel: 'Not likely',
                        highLabel: 'Very likely',
                        required: true,
                    },
                    {
                        id: qid(2),
                        type: 'checkbox',
                        title: 'Which parts did you use?',
                        required: false,
                        options: [
                            { id: oid(2, 1), label: 'Ordering' },
                            { id: oid(2, 2), label: 'Delivery' },
                            { id: oid(2, 3), label: 'Support' },
                            { id: oid(2, 4), label: 'Returns' },
                        ],
                    },
                ],
            },
            {
                id: sid(2),
                title: 'What happened',
                description: 'You picked 6 or below, so we want details.',
                visibleWhen: { mode: 'all', rules: [{ when: qid(1), operator: 'atMost', value: '6' }] },
                questions: [
                    {
                        id: qid(3),
                        type: 'longText',
                        title: 'What should we fix first?',
                        required: true,
                    },
                    {
                        id: qid(4),
                        type: 'radio',
                        title: 'Can we follow up with you?',
                        required: true,
                        options: [
                            { id: FOLLOW_YES, label: 'Yes' },
                            { id: oid(4, 2), label: 'No' },
                        ],
                    },
                    {
                        id: qid(5),
                        type: 'shortText',
                        format: 'email',
                        title: 'Email for the follow-up',
                        required: true,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: qid(4), operator: 'equals', value: FOLLOW_YES }],
                        },
                    },
                ],
            },
            {
                id: sid(3),
                title: 'Spread the word',
                visibleWhen: { mode: 'all', rules: [{ when: qid(1), operator: 'atLeast', value: '9' }] },
                questions: [
                    {
                        id: qid(6),
                        type: 'longText',
                        title: 'Anything we can share publicly?',
                        required: false,
                    },
                ],
            },
        ],
        settings: { confirmationMessage: 'Thanks · every answer gets read.' },
    };
}

function jobApplication(): FormDefinition {
    const { sid, qid, oid } = ids('7e03');
    const ROLE_DESIGN = oid(3, 2);
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Job application',
        description: 'Applications are read by a person, not a parser.',
        sections: [
            {
                id: sid(1),
                title: 'Basics',
                questions: [
                    {
                        id: qid(1),
                        type: 'shortText',
                        format: 'text',
                        title: 'Name',
                        placeholder: 'First and last name',
                        required: true,
                    },
                    {
                        id: qid(2),
                        type: 'shortText',
                        format: 'email',
                        title: 'Email',
                        required: true,
                    },
                    {
                        id: qid(3),
                        type: 'select',
                        title: 'Which role?',
                        required: true,
                        options: [
                            { id: oid(3, 1), label: 'Engineering' },
                            { id: ROLE_DESIGN, label: 'Design' },
                            { id: oid(3, 3), label: 'Operations' },
                        ],
                    },
                    {
                        id: qid(4),
                        type: 'shortText',
                        format: 'date',
                        title: 'Available from',
                        required: false,
                    },
                ],
            },
            {
                id: sid(2),
                title: 'Experience',
                questions: [
                    {
                        id: qid(5),
                        type: 'shortText',
                        format: 'number',
                        title: 'Years of relevant experience',
                        min: 0,
                        max: 50,
                        required: true,
                    },
                    {
                        id: qid(6),
                        type: 'checkbox',
                        title: 'Where are you strongest?',
                        minSelected: 1,
                        required: true,
                        options: [
                            { id: oid(6, 1), label: 'Frontend' },
                            { id: oid(6, 2), label: 'Backend' },
                            { id: oid(6, 3), label: 'Infrastructure' },
                            { id: oid(6, 4), label: 'Data' },
                            { id: oid(6, 5), label: 'Design systems' },
                            { id: oid(6, 6), label: 'Writing' },
                        ],
                    },
                    {
                        id: qid(7),
                        type: 'shortText',
                        format: 'text',
                        title: 'Portfolio link',
                        placeholder: 'https://',
                        required: true,
                        visibleWhen: {
                            mode: 'all',
                            rules: [{ when: qid(3), operator: 'equals', value: ROLE_DESIGN }],
                        },
                    },
                ],
            },
            {
                id: sid(3),
                title: 'In your words',
                questions: [
                    {
                        id: qid(8),
                        type: 'longText',
                        title: 'Why this role?',
                        maxLength: 1500,
                        required: true,
                    },
                ],
            },
        ],
        settings: { confirmationMessage: 'Application received · we reply to everyone.' },
    };
}

function bugReport(): FormDefinition {
    const { sid, qid, oid } = ids('7e04');
    const ONLY_ONCE = oid(3, 3);
    return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Bug report',
        description: 'The more precise the report, the faster the fix.',
        sections: [
            {
                id: sid(1),
                title: 'The bug',
                questions: [
                    {
                        id: qid(1),
                        type: 'shortText',
                        format: 'text',
                        title: 'Summary',
                        placeholder: 'One line',
                        required: true,
                    },
                    {
                        id: qid(2),
                        type: 'select',
                        title: 'Severity',
                        required: true,
                        options: [
                            { id: oid(2, 1), label: 'Blocking' },
                            { id: oid(2, 2), label: 'Annoying' },
                            { id: oid(2, 3), label: 'Cosmetic' },
                        ],
                    },
                    {
                        id: qid(3),
                        type: 'radio',
                        title: 'Does it reproduce?',
                        required: true,
                        options: [
                            { id: oid(3, 1), label: 'Every time' },
                            { id: oid(3, 2), label: 'Sometimes' },
                            { id: ONLY_ONCE, label: 'Only once' },
                        ],
                    },
                ],
            },
            {
                id: sid(2),
                title: 'Reproduction',
                visibleWhen: {
                    mode: 'all',
                    rules: [{ when: qid(3), operator: 'notEquals', value: ONLY_ONCE }],
                },
                questions: [
                    {
                        id: qid(4),
                        type: 'longText',
                        title: 'Steps to reproduce',
                        required: true,
                    },
                ],
            },
            {
                id: sid(3),
                title: 'Environment',
                questions: [
                    {
                        id: qid(5),
                        type: 'checkbox',
                        title: 'Where have you seen it?',
                        required: false,
                        options: [
                            { id: oid(5, 1), label: 'macOS' },
                            { id: oid(5, 2), label: 'Windows' },
                            { id: oid(5, 3), label: 'Linux' },
                            { id: oid(5, 4), label: 'iOS' },
                            { id: oid(5, 5), label: 'Android' },
                        ],
                    },
                    {
                        id: qid(6),
                        type: 'shortText',
                        format: 'date',
                        title: 'First noticed',
                        required: false,
                    },
                    {
                        id: qid(7),
                        type: 'rating',
                        title: 'How much is it in your way?',
                        scale: 5,
                        lowLabel: 'Barely',
                        highLabel: "Can't work",
                        required: false,
                    },
                ],
            },
        ],
        settings: { confirmationMessage: 'Logged · thank you for the detail.' },
    };
}

export const TEMPLATES: TemplateEntry[] = [
    {
        id: 'event-rsvp',
        name: 'Event RSVP',
        description: 'Attendance, meal choice, and a plus one that only appears when it should.',
        make: eventRsvp,
    },
    {
        id: 'customer-feedback',
        name: 'Customer feedback',
        description: 'A 10-point recommend scale that branches to fixes or praise.',
        make: customerFeedback,
    },
    {
        id: 'job-application',
        name: 'Job application',
        description: 'Basics, experience with real validation, and a role-aware portfolio ask.',
        make: jobApplication,
    },
    {
        id: 'bug-report',
        name: 'Bug report',
        description: 'Severity, reproduction steps when they exist, and an impact rating.',
        make: bugReport,
    },
];
