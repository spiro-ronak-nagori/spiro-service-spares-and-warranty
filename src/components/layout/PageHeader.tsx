import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import spiroLogo from '@/assets/spiro-logo.png';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  backTo,
  onBack,
  rightAction,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-top',
        className
      )}
    >
      <div className="flex h-14 items-center gap-3 px-4">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="-ml-2 h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Go back</span>
          </Button>
        )}

        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 min-w-0 flex-1 focus:outline-none"
        >
          <img src={spiroLogo} alt="Spiro" className="h-8 w-8 object-contain flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate text-left">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate text-left">
                {subtitle}
              </p>
            )}
          </div>
        </button>
        
        {rightAction && (
          <div className="flex-shrink-0">
            {rightAction}
          </div>
        )}
      </div>
    </header>
  );
}
