import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isLight = theme === "light" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full size-9 shrink-0"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      title="Alternar tema"
    >
      {isLight ? (
        <Moon className="h-[1.1rem] w-[1.1rem] text-muted-foreground" />
      ) : (
        <Sun className="h-[1.1rem] w-[1.1rem] text-muted-foreground" />
      )}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}
