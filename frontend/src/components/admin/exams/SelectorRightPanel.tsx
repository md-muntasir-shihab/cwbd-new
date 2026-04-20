import { useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { useQuestionSelector } from './QuestionSelectorContext';
import type { SelectedQuestion } from '../../../types/questionBank';

/* ── Difficulty badge helper ── */

const difficultyBadge = (d: string) => {
    const cls =
        d === 'hard'
            ? 'bg-rose-500/10 text-rose-300'
            : d === 'medium'
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-emerald-500/10 text-emerald-300';
    return (
        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>
            {d}
        </span>
    );
};

/* ── Sortable question item ── */

interface SortableItemProps {
    question: SelectedQuestion;
    onMarksChange: (bankQuestionId: string, marks: number) => void;
    onRemove: (bankQuestionId: string) => void;
}

function SortableQuestionItem({ question, onMarksChange, onRemove }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: question.bankQuestionId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 ${isDragging
                ? 'bg-indigo-50/60 dark:bg-indigo-900/20 shadow-lg z-10 relative'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                } transition-colors`}
        >
            {/* Drag handle */}
            <button
                type="button"
                className="mt-1 shrink-0 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Drag to reorder"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="w-4 h-4" />
            </button>

            {/* Question content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-200 line-clamp-2">
                    {question.question_en || question.question_bn || 'Untitled question'}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400">
                        {question.subject}
                    </span>
                    {difficultyBadge(question.difficulty)}
                </div>
            </div>

            {/* Marks input */}
            <div className="shrink-0 flex items-center gap-1.5">
                <label htmlFor={`marks-${question.bankQuestionId}`} className="sr-only">
                    Marks for question
                </label>
                <input
                    id={`marks-${question.bankQuestionId}`}
                    type="number"
                    min={0}
                    step={0.25}
                    value={question.marks}
                    onChange={(e) =>
                        onMarksChange(
                            question.bankQuestionId,
                            Math.max(0, parseFloat(e.target.value) || 0),
                        )
                    }
                    aria-label={`Marks for question`}
                    className="w-16 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-center text-slate-700 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">marks</span>
            </div>

            {/* Remove button */}
            <button
                type="button"
                onClick={() => onRemove(question.bankQuestionId)}
                aria-label="Remove question"
                className="mt-1 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </li>
    );
}

/* ── Main component ── */

export default function SelectorRightPanel() {
    const { state, dispatch } = useQuestionSelector();
    const { selectedQuestions, totalQuestions, totalMarks } = state;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const fromIndex = selectedQuestions.findIndex(
                (q) => q.bankQuestionId === active.id,
            );
            const toIndex = selectedQuestions.findIndex(
                (q) => q.bankQuestionId === over.id,
            );

            if (fromIndex !== -1 && toIndex !== -1) {
                dispatch({ type: 'REORDER', fromIndex, toIndex });
            }
        },
        [selectedQuestions, dispatch],
    );

    const handleMarksChange = useCallback(
        (bankQuestionId: string, marks: number) => {
            dispatch({ type: 'SET_MARKS', bankQuestionId, marks });
        },
        [dispatch],
    );

    const handleRemove = useCallback(
        (bankQuestionId: string) => {
            dispatch({ type: 'REMOVE_QUESTION', bankQuestionId });
        },
        [dispatch],
    );

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ── */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/60">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Selected Questions
                </h3>
            </div>

            {/* ── Sortable list ── */}
            <div className="flex-1 overflow-y-auto">
                {selectedQuestions.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                        <p>
                            No questions selected yet.
                            <br />
                            Add questions from the left panel.
                        </p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={selectedQuestions.map((q) => q.bankQuestionId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <ul>
                                {selectedQuestions.map((q) => (
                                    <SortableQuestionItem
                                        key={q.bankQuestionId}
                                        question={q}
                                        onMarksChange={handleMarksChange}
                                        onRemove={handleRemove}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* ── Summary bar ── */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/40">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {totalQuestions} {totalQuestions === 1 ? 'question' : 'questions'}
                </span>
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    Total: {totalMarks} marks
                </span>
            </div>
        </div>
    );
}
