// Fixed BCT quiz definition.  Only J3 Team Leads may edit this content.
// Image keys map to /public/quiz-images/{key}.png
const BCT_QUIZ: QuizDefinition = {
    id: 'bct-quiz',
    title: 'ASOT | BCT Confirmation Quiz',
    timeLimitMinutes: 10,
    instructions: [
        'You have 10 minutes to complete this quiz.',
        'Do not search for answers.',
        'All control-related questions refer to default controls.',
    ],
    sections: [
        {
            id: 'arma-ace',
            title: 'ARMA / ACE Basics',
            questions: [
                { id: 'aa-1', type: 'text', question: 'How do you put your weapon on your back?' },
                { id: 'aa-2', type: 'text', question: 'How do you interact with things in the world using ACE? (controls)' },
                { id: 'aa-3', type: 'text', question: 'How do you interact with things to do with yourself using ACE? (controls)' },
                { id: 'aa-4', type: 'text', question: 'What is the DUI radar used for?' },
            ],
        },
        {
            id: 'grid-refs',
            title: 'Grid References and Maps',
            questions: [
                { id: 'gr-1', type: 'text', question: 'What are the 3 different sizes of grid references mostly used?' },
                { id: 'gr-2', type: 'image_question', question: 'What is the 4-figure grid reference for the highlighted square?', image: 'grid_ref_image_1' },
                { id: 'gr-3', type: 'image_question', question: 'What is the 6-figure grid reference for the highlighted square?', image: 'grid_ref_image_2' },
                { id: 'gr-4', type: 'image_question', question: 'What is the 8-figure grid reference for the highlighted square?', image: 'grid_ref_image_3' },
            ],
        },
        {
            id: 'tfar',
            title: 'TFAR (Task Force Arrowhead Radio)',
            questions: [
                { id: 'tf-1', type: 'image_question', question: 'Describe what each labelled control does/displays on the infantry radio (1–6).', image: 'radio_diagram' },
                { id: 'tf-2', type: 'text', question: 'Explain how you set up channel/frequency on the infantry radio.' },
                { id: 'tf-3', type: 'text', question: 'What additional equipment is required to set radio frequency?' },
                { id: 'tf-4', type: 'text', question: 'What category is that equipment found in within the arsenal?' },
            ],
        },
        {
            id: 'ace-medical',
            title: 'ACE Medical',
            questions: [
                { id: 'am-1', type: 'text', question: 'What are the 2 ways you can access the medical menu?' },
                { id: 'am-2', type: 'text', question: 'What is used to stop bleeding immediately?' },
            ],
        },
        {
            id: 'section-basics',
            title: 'Section Basics',
            questions: [
                {
                    id: 'sb-1',
                    type: 'multiple_choice',
                    question: 'If an enemy patrol approaches and has not seen you, can you open fire immediately?',
                    options: ['True', 'False'],
                    correctOption: 1, // False
                },
                { id: 'sb-2', type: 'image_question', question: 'Name this formation.', image: 'formation_1' },
                { id: 'sb-3', type: 'image_question', question: 'Name this formation.', image: 'formation_2' },
                { id: 'sb-4', type: 'image_question', question: 'Name this formation.', image: 'formation_3' },
                { id: 'sb-5', type: 'image_question', question: 'Name this formation.', image: 'formation_4' },
            ],
        },
        {
            id: 'weapons',
            title: 'Weapons Knowledge',
            questions: [
                { id: 'wk-1', type: 'text', question: 'How do you check your magazine round count?' },
                { id: 'wk-2', type: 'text', question: 'What controls clear a weapon jam?' },
                { id: 'wk-3', type: 'text', question: 'What tool is required to dig trenches?' },
                { id: 'wk-4', type: 'text', question: "What is back blast and why must you call 'Back blast clear'?" },
                { id: 'wk-5', type: 'text', question: 'What are the 2 ways you can throw grenades?' },
            ],
        },
        {
            id: 'movement',
            title: 'Section and Infantry Movement',
            questions: [
                { id: 'mv-1', type: 'text', question: 'What is the purpose of bounding as pairs or in fireteams?' },
            ],
        },
    ],
}

export default BCT_QUIZ

// Lookup helpers
export function getQuizById(id: string): QuizDefinition | null {
    if (id === BCT_QUIZ.id) return BCT_QUIZ
    return null
}

export function getQuizQuestion(quiz: QuizDefinition, questionId: string): QuizQuestion | null {
    for (const section of quiz.sections) {
        const q = section.questions.find(q => q.id === questionId)
        if (q) return q
    }
    return null
}
