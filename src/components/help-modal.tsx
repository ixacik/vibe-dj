import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail, MessageCircle, Github, ExternalLink } from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const contactMethods = [
    {
      icon: Mail,
      label: 'Email',
      value: 'support@vibedj.app',
      href: 'mailto:support@vibedj.app',
      description: 'Best for detailed questions',
    },
    {
      icon: MessageCircle,
      label: 'Discord',
      value: 'VibeDJ Community',
      href: 'https://discord.gg/vibedj',
      description: 'Join our community for quick help',
    },
    {
      icon: Github,
      label: 'GitHub',
      value: 'Report issues',
      href: 'https://github.com/vibedj/app/issues',
      description: 'Technical issues and feature requests',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Need Help?</DialogTitle>
          <DialogDescription>
            We're here to help! Reach out through any of these channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {contactMethods.map((method) => (
            <a
              key={method.label}
              href={method.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors group"
            >
              <div className="mt-0.5">
                <method.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="font-medium text-sm">{method.label}</p>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm text-muted-foreground">{method.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{method.description}</p>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-center text-muted-foreground">
            Response time is usually within 24 hours. For urgent issues, Discord is recommended.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}