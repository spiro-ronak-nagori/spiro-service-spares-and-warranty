import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Star } from 'lucide-react';
import { toast } from 'sonner';

interface FeedbackQuestion {
  id: string;
  question_text: string;
  question_type: string;
  min_label: string | null;
  max_label: string | null;
  sort_order: number;
}

export default function FeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workshopName, setWorkshopName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  useEffect(() => {
    if (token) loadFeedback();
  }, [token]);

  const loadFeedback = async () => {
    try {
      // Use edge function to load data (bypasses RLS for public access)
      const { data, error } = await supabase.functions.invoke('load-feedback', {
        body: { token },
      });

      if (error) throw error;

      if (data?.error === 'already_submitted') {
        setErrorState('You have already submitted your feedback. Thank you!');
        return;
      }
      if (data?.error === 'expired') {
        setErrorState('This feedback link has expired.');
        return;
      }
      if (data?.error) {
        setErrorState('This feedback link is invalid.');
        return;
      }

      setWorkshopName(data.workshop_name || 'Workshop');
      setRegNo(data.reg_no || '');
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Error loading feedback:', err);
      setErrorState('Something went wrong. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!token) return;

    const unanswered = questions.filter(q => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      toast.error('Please answer all questions before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      const responses = questions.map(q => ({
        question_id: q.id,
        numeric_value: q.question_type === 'TEXT' ? null : Number(answers[q.id]),
        text_value: q.question_type === 'TEXT' ? String(answers[q.id]) : null,
      }));

      const { data, error } = await supabase.functions.invoke('submit-feedback', {
        body: { token, responses },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error(err.message || 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id] !== undefined && answers[q.id] !== '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{errorState}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto text-primary mb-4" />
            <h2 className="text-xl font-bold mb-2">Thank you!</h2>
            <p className="text-muted-foreground">
              Your feedback has been submitted successfully. We appreciate your time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Star className="h-5 w-5" />
          <h1 className="text-lg font-bold">Service Feedback</h1>
        </div>
        <p className="text-sm opacity-90">{workshopName}</p>
        {regNo && (
          <p className="text-xs opacity-75 mt-1">Vehicle: {regNo}</p>
        )}
      </div>

      {/* Questions */}
      <div className="p-4 space-y-5 max-w-md mx-auto pb-32">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            index={idx + 1}
            question={q}
            value={answers[q.id]}
            onChange={(val) => setAnswers(prev => ({ ...prev, [q.id]: val }))}
          />
        ))}
      </div>

      {/* Submit button - fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <div className="max-w-md mx-auto">
          <Button
            className="w-full h-12 text-base"
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: FeedbackQuestion;
  value: string | number | undefined;
  onChange: (val: string | number) => void;
}) {
  const isText = question.question_type === 'TEXT';
  const isNPS = question.question_type === 'NPS_0_10';
  const min = isNPS ? 0 : 1;
  const max = isNPS ? 10 : 5;
  const minLabel = question.min_label || (isNPS ? 'Not likely' : '');
  const maxLabel = question.max_label || (isNPS ? 'Very likely' : '');

  if (isText) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-4">
            <span className="text-muted-foreground mr-1">{index}.</span>
            {question.question_text}
          </p>
          <Textarea
            placeholder="Enter your comments here..."
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium mb-4">
          <span className="text-muted-foreground mr-1">{index}.</span>
          {question.question_text}
        </p>

        <div className="space-y-3">
          <div className="px-1">
            <Slider
              min={min}
              max={max}
              step={1}
              value={typeof value === 'number' ? [value] : [Math.floor((min + max) / 2)]}
              onValueChange={([v]) => onChange(v)}
              className="w-full"
            />
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>

          <div className="text-center">
            {typeof value === 'number' ? (
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {value}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Slide to rate</span>
            )}
          </div>

          {isNPS && (
            <div className="flex justify-between px-0.5">
              {Array.from({ length: 11 }, (_, i) => (
                <span key={i} className="text-[10px] text-muted-foreground w-4 text-center">{i}</span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
