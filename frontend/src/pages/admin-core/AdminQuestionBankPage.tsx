import AdminGuardShell from '../../components/admin/AdminGuardShell';
import QuestionBankConsole from '../../components/admin/questionBank/QuestionBankConsole';

export default function AdminQuestionBankPage() {
    return (
        <AdminGuardShell
            title="Question Bank"
            description="Manage questions, bilingual content, and import tools."
            requiredModule="question_bank"
        >
            <QuestionBankConsole />
        </AdminGuardShell>
    );
}
