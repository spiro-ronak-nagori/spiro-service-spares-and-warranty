import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, Save, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

interface FeedbackQuestion {
  id: string;
  question_text: string;
  question_type: 'SCALE_1_5' | 'NPS_0_10' | 'TEXT';
  is_active: boolean;
  sort_order: number;
  template_id: string;
  min_label: string | null;
  max_label: string | null;
}

interface FeedbackTemplate {
  id: string;
  name: string;
  is_active: boolean;
}

const QUESTION_TYPES = [
  { value: 'SCALE_1_5', label: 'Scale 1-5' },
  { value: 'NPS_0_10', label: 'NPS 0-10' },
  { value: 'TEXT', label: 'Free Text' },
];

export default function FeedbackEditorPage() {
  const { profile } = useAuth();
  const [template, setTemplate] = useState<FeedbackTemplate | null>(null);
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState<FeedbackQuestion | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';

  useEffect(() => {
    if (isSuperAdmin) fetchData();
  }, [isSuperAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch active template
      const { data: templates, error: tErr } = await supabase
        .from('feedback_form_templates')
        .select('*')
        .eq('is_active', true)
        .limit(1);
      if (tErr) throw tErr;
      const tmpl = templates?.[0] as FeedbackTemplate | undefined;
      if (!tmpl) {
        setIsLoading(false);
        return;
      }
      setTemplate(tmpl);

      // Fetch questions
      const { data: qData, error: qErr } = await supabase
        .from('feedback_form_questions')
        .select('*')
        .eq('template_id', tmpl.id)
        .order('sort_order');
      if (qErr) throw qErr;
      setQuestions((qData || []) as FeedbackQuestion[]);
    } catch (err) {
      console.error('Error fetching feedback form:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuestion = (id: string, updates: Partial<FeedbackQuestion>) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const handleAddQuestion = () => {
    if (!template) return;
    const maxOrder = Math.max(0, ...questions.map((q) => q.sort_order));
    const newQ: FeedbackQuestion = {
      id: `new_${Date.now()}`,
      question_text: '',
      question_type: 'SCALE_1_5',
      is_active: true,
      sort_order: maxOrder + 1,
      template_id: template.id,
      min_label: null,
      max_label: null,
    };
    setQuestions((qs) => [...qs, newQ]);
  };

  const handleDeleteQuestion = () => {
    if (!deletingQuestion) return;
    setQuestions((qs) => qs.filter((q) => q.id !== deletingQuestion.id));
    setDeletingQuestion(null);
    toast.success('Question removed (save to apply)');
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQ = [...questions];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newQ.length) return;
    [newQ[index], newQ[swapIndex]] = [newQ[swapIndex], newQ[index]];
    newQ.forEach((q, i) => (q.sort_order = i + 1));
    setQuestions(newQ);
  };

  const handleSave = async () => {
    if (!template) return;
    setIsSaving(true);
    try {
      for (const q of questions) {
        if (!q.question_text.trim()) {
          toast.error('All questions must have text');
          setIsSaving(false);
          return;
        }
      }

      // 1. Create a new template version
      const { data: newTemplate, error: tErr } = await supabase
        .from('feedback_form_templates')
        .insert({ name: template.name, is_active: true })
        .select('id')
        .single();
      if (tErr || !newTemplate) throw tErr || new Error('Failed to create template version');

      // 2. Insert all questions under the new template
      const questionRows = questions.map((q, i) => ({
        template_id: newTemplate.id,
        question_text: q.question_text.trim(),
        question_type: q.question_type as any,
        is_active: q.is_active,
        sort_order: i + 1,
        min_label: q.min_label,
        max_label: q.max_label,
      }));

      const { error: qErr } = await supabase
        .from('feedback_form_questions')
        .insert(questionRows);
      if (qErr) throw qErr;

      // 3. Deactivate the old template
      await supabase
        .from('feedback_form_templates')
        .update({ is_active: false } as any)
        .eq('id', template.id);

      toast.success('Feedback form saved (new version created)');
      setShowSaveConfirm(false);
      fetchData(); // refresh to load new template
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4"><Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Super Admin access required.</p></CardContent></Card></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Feedback Form Editor"
        showBack
        backTo="/console"
        rightAction={
          <Button size="sm" onClick={() => setShowSaveConfirm(true)}>
            <Save className="h-4 w-4 mr-1" />Save
          </Button>
        }
      />
      <div className="p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-8 w-full" /></CardContent></Card>
          ))
        ) : !template ? (
          <Card><CardContent className="py-12 text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No active feedback template found</p>
          </CardContent></Card>
        ) : (
          <>
            {questions.map((q, index) => (
              <Card key={q.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => moveQuestion(index, 'up')}
                        >▲</button>
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={index === questions.length - 1}
                          onClick={() => moveQuestion(index, 'down')}
                        >▼</button>
                      </div>
                      <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Active</Label>
                        <Switch
                          checked={q.is_active}
                          onCheckedChange={(checked) => updateQuestion(q.id, { is_active: checked })}
                        />
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeletingQuestion(q)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Input
                    placeholder="Question text"
                    value={q.question_text}
                    onChange={(e) => updateQuestion(q.id, { question_text: e.target.value })}
                  />

                  <Select value={q.question_type} onValueChange={(v) => updateQuestion(q.id, { question_type: v as any })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {q.question_type !== 'TEXT' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Min label (e.g., Poor)"
                        value={q.min_label || ''}
                        onChange={(e) => updateQuestion(q.id, { min_label: e.target.value || null })}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Max label (e.g., Excellent)"
                        value={q.max_label || ''}
                        onChange={(e) => updateQuestion(q.id, { max_label: e.target.value || null })}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" className="w-full" onClick={handleAddQuestion}>
              <Plus className="h-4 w-4 mr-2" />Add Question
            </Button>
          </>
        )}
      </div>

      <ConfirmationDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title="Save Feedback Form"
        description="This will create a new version of the feedback form. Existing feedback responses will remain linked to the previous version."
        confirmLabel={isSaving ? 'Saving...' : 'Save New Version'}
        onConfirm={handleSave}
      />

      <ConfirmationDialog
        open={!!deletingQuestion}
        onOpenChange={(open) => !open && setDeletingQuestion(null)}
        title="Remove Question"
        description={deletingQuestion ? `Remove "${deletingQuestion.question_text || 'this question'}"?` : ''}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDeleteQuestion}
      />
    </AppLayout>
  );
}
