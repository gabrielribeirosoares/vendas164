import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  Car,
  CheckCircle2,
  HelpCircle,
  Package,
  Sparkles,
  Store,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TOUR_STORAGE_KEY = "minipre_onboarding_completed_v2";

interface TourStep {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  highlights: string[];
  badge: string;
  selector?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Início & Catálogo",
    subtitle: "Navegação principal da plataforma.",
    description:
      "Clique no logo do cabeçalho a qualquer momento para retornar à página principal e ver todas as pré-vendas e lançamentos abertos.",
    icon: <Car className="size-7 text-primary" />,
    badge: "Passo 1 de 5",
    selector: '[data-tour="header-logo"]',
    highlights: [
      "Retorne ao catálogo com 1 clique",
      "Veja as miniaturas em destaque",
      "Consulte preços e cotas disponíveis",
    ],
  },
  {
    title: "Minhas Reservas",
    subtitle: "Acompanhe seus pedidos e prazos.",
    description:
      "Acesse este menu para ver todas as cotas que você reservou, cronômetros de sinal restantes, saldos a pagar e fotos das miniaturas.",
    icon: <BookmarkCheck className="size-7 text-success" />,
    badge: "Passo 2 de 5",
    selector: '[data-tour="header-reservas"]',
    highlights: [
      "Cronômetros de prazo em tempo real",
      "Saldo devedor e sinal pago detalhados",
      "Botão direto de conversa no WhatsApp do vendedor",
    ],
  },
  {
    title: "Lojas que você Segue",
    subtitle: "Catálogo de vendedores vinculados.",
    description:
      "Acesse a lista de todas as lojas onde você é cliente para navegar pelos catálogos exclusivos e realizar novas reservas.",
    icon: <Store className="size-7 text-primary" />,
    badge: "Passo 3 de 5",
    selector: '[data-tour="header-lojas"]',
    highlights: [
      "Lista rápida das suas lojas preferidas",
      "Acesso com 1 clique ao catálogo da loja",
      "Status de seguindo ativo",
    ],
  },
  {
    title: "Minha Loja (Vendedor)",
    subtitle: "Gestão do seu próprio negócio.",
    description:
      "Se você também é um vendedor, clique aqui para cadastrar novas pré-vendas, personalizar as cores e marca da sua loja e gerenciar pedidos.",
    icon: <Package className="size-7 text-warning" />,
    badge: "Passo 4 de 5",
    selector: '[data-tour="header-minha-loja"]',
    highlights: [
      "Cadastro rápido de pré-vendas (Preço, Sinal, Cotas)",
      "Personalização com logotipo e cores",
      "Devolução automática de cotas ao cancelar",
    ],
  },
  {
    title: "Seu Perfil Pessoal",
    subtitle: "Atualize seus dados de contato.",
    description:
      "Edite seu nome e número de WhatsApp com seletor de bandeiras de países e máscara internacional para garantir a confirmação de suas reservas.",
    icon: <User className="size-7 text-accent-foreground" />,
    badge: "Passo 5 de 5",
    selector: '[data-tour="header-perfil"]',
    highlights: [
      "Suporte a números do Brasil e internacionais",
      "Atualização rápida do seu nome de cliente",
      "Vínculo automático às suas reservas",
    ],
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  forceOpen?: boolean;
  onClose?: () => void;
  userId?: string | null;
}

// Encontra o próximo passo cujo elemento de destaque EXISTE no DOM
function findNextVisibleStep(fromStep: number): number {
  for (let i = fromStep + 1; i < TOUR_STEPS.length; i++) {
    const step = TOUR_STEPS[i];
    if (!step.selector) return i; // Sem selector = sempre visível
    if (document.querySelector(step.selector)) return i;
  }
  // Se não encontrar nenhum passo adiante, tenta voltar ao próprio
  return fromStep;
}

function getTourStorageKey(userId?: string | null) {
  // Chave POR USUÁRIO para que cada conta tenha seu próprio controle
  if (userId) return `minipre_onboarding_completed_${userId}`;
  return TOUR_STORAGE_KEY;
}

export function OnboardingTour({ forceOpen, onClose, userId }: OnboardingTourProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<React.CSSProperties>({
    position: "fixed",
    top: "80px",
    left: "50%",
    transform: "translateX(-50%)",
  });

  const storageKey = getTourStorageKey(userId);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setCurrentStep(0);
      return;
    }

    // Só mostrar auto-tour se o usuário está logado
    if (!userId) return;

    const hasCompleted = localStorage.getItem(storageKey);
    if (!hasCompleted) {
      const timer = setTimeout(() => {
        setOpen(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [forceOpen, userId, storageKey]);

  // Atualizar a posição do retângulo de destaque e da caixa flutuante
  useEffect(() => {
    if (!open) {
      setTargetRect(null);
      return;
    }

    function updateSpotlight() {
      const step = TOUR_STEPS[currentStep];
      if (!step.selector) {
        setTargetRect(null);
        setPopoverPos({
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: `${Math.min(window.innerWidth - 32, 420)}px`,
        });
        return;
      }

      const el = document.querySelector<HTMLElement>(step.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });

        // Calcular a posição horizontal centralizada no elemento com limites da tela
        const cardWidth = Math.min(window.innerWidth - 32, 420);
        let centerX = rect.left + rect.width / 2;
        const minX = cardWidth / 2 + 16;
        const maxX = window.innerWidth - cardWidth / 2 - 16;
        centerX = Math.max(minX, Math.min(centerX, maxX));

        // Posicionar o card abaixo do item destacado
        // Garantir um top mínimo de 80px para que o card nunca fique cortado no topo
        let top = Math.max(80, rect.top + rect.height + 16);
        // Se o card ultrapassar o rodapé da tela, posicionar acima do elemento
        if (top + 340 > window.innerHeight && rect.top > window.innerHeight / 2) {
          top = Math.max(80, rect.top - 350);
        }

        setPopoverPos({
          position: "fixed",
          top: `${top}px`,
          left: `${centerX}px`,
          transform: "translateX(-50%)",
          width: `${cardWidth}px`,
        });
      } else {
        // O elemento não existe no DOM (ex: botão "Lojas" não aparece se o usuário não segue nenhuma loja)
        // Pular automaticamente para o próximo passo disponível
        setTargetRect(null);
        const nextAvailable = findNextVisibleStep(currentStep);
        if (nextAvailable !== currentStep) {
          setCurrentStep(nextAvailable);
        } else {
          // Fallback: centralizar na tela se não houver mais passos
          setPopoverPos({
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: `${Math.min(window.innerWidth - 32, 420)}px`,
          });
        }
      }
    }

    updateSpotlight();
    const timer = setTimeout(updateSpotlight, 150);
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [open, currentStep]);

  function handleComplete() {
    localStorage.setItem(storageKey, "true");
    setOpen(false);
    setTargetRect(null);
    if (onClose) onClose();
  }

  function handleNext() {
    const next = findNextVisibleStep(currentStep);
    if (next !== currentStep) {
      setCurrentStep(next);
    } else {
      handleComplete();
    }
  }

  function handlePrev() {
    // Procura o passo anterior cujo elemento existe no DOM
    for (let i = currentStep - 1; i >= 0; i--) {
      const step = TOUR_STEPS[i];
      if (!step.selector || document.querySelector(step.selector)) {
        setCurrentStep(i);
        return;
      }
    }
  }

  if (!open) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <>
      {/* CAMADA DE MÁSCARA + RETÂNGULO DE DESTAQUE (overflow-hidden para não gerar scrollbar) */}
      <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
        {/* Máscara de Fundo Escurecido */}
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-300"
          onClick={handleComplete}
        />

        {/* RETÂNGULO ILUMINADO DE DESTAQUE NO ITEM DA TELA */}
        {targetRect && (
          <div
            className="fixed pointer-events-none z-[10000] rounded-xl border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.7),0_0_25px_rgba(225,29,72,0.8)] transition-all duration-300 ease-out"
            style={{
              top: Math.max(0, targetRect.top - 6),
              left: Math.max(0, targetRect.left - 6),
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
          >
            {/* Indicador pulsante nos cantos */}
            <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-primary animate-ping" />
            <span className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-primary animate-ping" />
          </div>
        )}
      </div>

      {/* CARD MODAL FLUTUANTE — FORA do overflow-hidden para NUNCA ser cortado */}
      <div
        style={popoverPos}
        className="z-[10001] pointer-events-auto rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto"
      >
        <button
          onClick={handleComplete}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 font-medium">
            <Sparkles className="size-3" />
            {step.badge}
          </Badge>

          {/* Indicador de Bolinhas */}
          <div className="flex items-center gap-1.5 mr-6">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentStep ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Ir para passo ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted/70 border border-border/50 shadow-inner">
            {step.icon}
          </div>
          <div>
            <h3 className="text-lg font-bold font-display text-foreground">{step.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{step.subtitle}</p>
          </div>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed">
          {step.description}
        </p>

        <div className="rounded-xl bg-muted/40 p-3 border border-border/40 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Recursos principais:</p>
          <ul className="space-y-1.5 text-xs">
            {step.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground/90 font-medium">
                <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleComplete}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Pular tour
          </Button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={handlePrev} className="gap-1 text-xs h-9">
                <ArrowLeft className="size-3.5" />
                Anterior
              </Button>
            )}

            <Button type="button" variant="default" size="sm" onClick={handleNext} className="gap-1 text-xs h-9 font-semibold px-4">
              {currentStep === TOUR_STEPS.length - 1 ? (
                <>
                  Entendi! Começar <CheckCircle2 className="size-3.5" />
                </>
              ) : (
                <>
                  Próximo <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function TourTriggerButton({ className }: { className?: string }) {
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setTourOpen(true)}
        className={`gap-1.5 text-xs text-muted-foreground hover:text-primary ${className || ""}`}
      >
        <HelpCircle className="size-3.5 text-primary" />
        <span>Tour guiado</span>
      </Button>
      <OnboardingTour forceOpen={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  );
}
