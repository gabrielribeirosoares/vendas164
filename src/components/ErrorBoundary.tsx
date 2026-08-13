import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full panel border-border/60">
            <CardContent className="p-6 text-center space-y-4">
              <h2 className="text-xl font-bold">Algo deu errado</h2>
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar esta página. Tente atualizar ou voltar ao início.
              </p>
              <Button onClick={() => window.location.reload()}>Recarregar</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
