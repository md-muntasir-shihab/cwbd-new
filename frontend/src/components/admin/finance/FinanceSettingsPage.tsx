import { useState, useEffect } from 'react';
import { useFcSettings, useFcUpdateSettings } from '../../../hooks/useFinanceCenterQueries';
import { FcSettings } from '../../../types/finance';
import { Settings, Save, Plus, X, RefreshCw, AlertTriangle, DollarSign, FileText, Shield, Zap, Receipt, CreditCard } from 'lucide-react';

export default function FinanceSettingsPage() {
    const { data: settings, isLoading } = useFcSettings();
    const update = useFcUpdateSettings();
    const [form, setForm] = useState<Partial<FcSettings>>({});
    const [newCenter, setNewCenter] = useState('');

    useEffect(() => { if (settings) setForm(settings); }, [settings]);

    const set = <K extends keyof FcSettings>(key: K, value: FcSettings[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const addCostCenter = () => {
        const trimmed = newCenter.trim();
        if (!trimmed) return;
        const centers = [...(form.costCenters ?? [])];
        if (!centers.includes(trimmed)) centers.push(trimmed);
        set('costCenters', centers);
        setNewCenter('');
    };

    const removeCostCenter = (c: string) => set('costCenters', (form.costCenters ?? []).filter(x => x !== c));

    const handleSave = () => {
        const { _id, key, lastEditedByAdminId, ...payload } = form as FcSettings;
        update.mutate(payload);
    };

    if (isLoading) return (
        <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-slate-500">Loading settings…</span>
        </div>
    );

    const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition-all';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
                        <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Finance Settings</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Currency, invoicing, approvals, automation, and cost tracking</p>
                    </div>
                </div>
                <button onClick={handleSave} disabled={update.isPending}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl disabled:opacity-50 transition-all">
                    {update.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {update.isPending ? 'Saving...' : 'Save'}
                </button>
            </div>

            {update.isSuccess && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">✅ Settings saved.</div>}
            {update.isError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Failed to save.</div>}

            <div className="grid gap-5 md:grid-cols-2">
                {/* General */}
                <Section icon={<Settings className="h-4 w-4" />} title="General" description="Currency and export configuration">
                    <Field label="Default Currency"><input value={form.defaultCurrency ?? 'BDT'} onChange={e => set('defaultCurrency', e.target.value)} className={inputCls} /></Field>
                    <Field label="Report Currency Label"><input value={form.reportCurrencyLabel ?? 'BDT'} onChange={e => set('reportCurrencyLabel', e.target.value)} className={inputCls} /></Field>
                    <Field label="Receipt Required Above (BDT)"><input type="number" min={0} value={form.receiptRequiredAboveAmount ?? 0} onChange={e => set('receiptRequiredAboveAmount', +e.target.value)} className={inputCls} /></Field>
                    <Field label="Export Footer Note"><input value={form.exportFooterNote ?? ''} onChange={e => set('exportFooterNote', e.target.value)} className={inputCls} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Export Locale"><input value={form.exportLocale ?? 'en-BD'} onChange={e => set('exportLocale', e.target.value)} className={inputCls} /></Field>
                        <Field label="Export Date Format"><input value={form.exportDateFormat ?? 'YYYY-MM-DD'} onChange={e => set('exportDateFormat', e.target.value)} className={inputCls} /></Field>
                    </div>
                    <Field label="Default Payment Method">
                        <select value={form.defaultPaymentMethod ?? 'manual'} onChange={e => set('defaultPaymentMethod', e.target.value as FcSettings['defaultPaymentMethod'])} className={inputCls}>
                            {['manual', 'cash', 'bkash', 'nagad', 'bank', 'card', 'gateway', 'upay', 'rocket'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                        </select>
                    </Field>
                </Section>

                {/* Approval & Features */}
                <Section icon={<Shield className="h-4 w-4" />} title="Approval & Features" description="Control approval workflows and feature toggles">
                    <Toggle label="Require Approval for Expense" description="Expenses need admin approval before posting" checked={form.requireApprovalForExpense ?? false} onChange={v => set('requireApprovalForExpense', v)} />
                    <Toggle label="Require Approval for Income" description="Income entries need admin approval" checked={form.requireApprovalForIncome ?? false} onChange={v => set('requireApprovalForIncome', v)} />
                    <Toggle label="Enable Budget Module" description="Track budgets and spending limits" checked={form.enableBudgets ?? false} onChange={v => set('enableBudgets', v)} />
                    <Toggle label="Enable Recurring Engine" description="Auto-generate recurring transactions" checked={form.enableRecurringEngine ?? false} onChange={v => set('enableRecurringEngine', v)} />
                </Section>

                {/* Automation */}
                <Section icon={<Zap className="h-4 w-4" />} title="Automation" description="Auto-posting rules for transactions">
                    <Toggle label="Auto-post Subscription Revenue" description="Automatically record subscription payments as income" checked={form.autoPostSubscriptionRevenue ?? true} onChange={v => set('autoPostSubscriptionRevenue', v)} />
                    <Toggle label="Auto-post Campaign Expenses" description="Record campaign costs as expenses automatically" checked={form.autoPostCampaignExpenses ?? true} onChange={v => set('autoPostCampaignExpenses', v)} />
                    <Toggle label="Auto-post Invoice Payments" description="Record invoice payments when marked as paid" checked={form.autoPostInvoicePayments ?? true} onChange={v => set('autoPostInvoicePayments', v)} />
                </Section>

                {/* Invoice Policy */}
                <Section icon={<Receipt className="h-4 w-4" />} title="Invoice Policy" description="Invoice numbering and tax configuration">
                    <Field label="Invoice Prefix"><input value={form.invoicePrefix ?? 'CW-INV'} onChange={e => set('invoicePrefix', e.target.value)} className={inputCls} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Number Padding"><input type="number" min={3} max={12} value={form.invoiceNumberPadding ?? 6} onChange={e => set('invoiceNumberPadding', +e.target.value)} className={inputCls} /></Field>
                        <Field label="Default VAT / Tax (%)"><input type="number" min={0} max={100} step={0.01} value={form.taxRatePercent ?? 0} onChange={e => set('taxRatePercent', +e.target.value)} className={inputCls} /></Field>
                    </div>
                    {/* Invoice preview */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preview</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300">{form.invoicePrefix ?? 'CW-INV'}-{'0'.repeat(Math.max((form.invoiceNumberPadding ?? 6) - 1, 0))}1</p>
                    </div>
                </Section>

                {/* Communication Costs */}
                <Section icon={<CreditCard className="h-4 w-4" />} title="Communication Costs" description="Per-message cost tracking for SMS and email">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="SMS Cost / Message (BDT)"><input type="number" min={0} step={0.01} value={form.smsCostPerMessageBDT ?? 0} onChange={e => set('smsCostPerMessageBDT', +e.target.value)} className={inputCls} /></Field>
                        <Field label="Email Cost / Message (BDT)"><input type="number" min={0} step={0.01} value={form.emailCostPerMessageBDT ?? 0} onChange={e => set('emailCostPerMessageBDT', +e.target.value)} className={inputCls} /></Field>
                    </div>
                    {/* Cost comparison visual */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-blue-50 p-3 text-center dark:bg-blue-500/10">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">💬 1000 SMS</p>
                            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">৳{((form.smsCostPerMessageBDT ?? 0.35) * 1000).toFixed(0)}</p>
                        </div>
                        <div className="rounded-xl bg-purple-50 p-3 text-center dark:bg-purple-500/10">
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold">📧 1000 Emails</p>
                            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">৳{((form.emailCostPerMessageBDT ?? 0.05) * 1000).toFixed(0)}</p>
                        </div>
                    </div>
                </Section>

                {/* Cost Centers */}
                <Section icon={<FileText className="h-4 w-4" />} title="Cost Centers" description="Organize expenses by department or category">
                    <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                        {(form.costCenters ?? []).map(c => (
                            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400">
                                {c}
                                <button onClick={() => removeCostCenter(c)} className="text-indigo-400 hover:text-indigo-600 transition-colors"><X size={12} /></button>
                            </span>
                        ))}
                        {(form.costCenters ?? []).length === 0 && <span className="text-xs text-slate-400 italic">No cost centers defined yet</span>}
                    </div>
                    <div className="flex gap-2">
                        <input value={newCenter} onChange={e => setNewCenter(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCostCenter())} placeholder="Add cost center..." className={inputCls} />
                        <button onClick={addCostCenter} className="shrink-0 rounded-xl bg-indigo-100 px-3 py-2.5 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:hover:bg-indigo-500/30 transition-colors">
                            <Plus size={16} />
                        </button>
                    </div>
                </Section>
            </div>
        </div>
    );
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">{icon}</div>
                <div><h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</h3><p className="text-[10px] text-slate-500 dark:text-slate-400">{description}</p></div>
            </div>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">{label}</label>
            {children}
        </div>
    );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
            </div>
            <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5'}`} />
            </button>
        </div>
    );
}
