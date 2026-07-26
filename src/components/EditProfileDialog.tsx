import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";

interface EditProfileDialogProps {
  user: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ user, open, onOpenChange }: EditProfileDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    const initialName = profile?.name ?? user?.user_metadata?.name ?? "";
    const initialPhone = profile?.phone ?? user?.user_metadata?.phone ?? "";
    setName(initialName);
    setPhone(initialPhone);
  }, [profile, user, open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Por favor, informe seu nome.");
    setSaving(true);

    const cleanName = name.trim();
    const cleanPhone = phone.trim() || null;

    try {
      // 1. Salva na tabela profiles
      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          name: cleanName,
          email: user.email,
          phone: cleanPhone,
        },
        { onConflict: "id" }
      );

      if (profileErr) throw profileErr;

      // 2. Salva também nos metadados do Supabase Auth para ter redundância
      await supabase.auth.updateUser({
        data: { name: cleanName, phone: cleanPhone },
      });

      queryClient.invalidateQueries();
      toast.success("Perfil atualizado com sucesso!");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      toast.error("Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md panel border-border/60">
        <DialogHeader>
          <DialogTitle className="text-xl">Editar Perfil Pessoal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="prof-email">E-mail</Label>
            <Input id="prof-email" value={user?.email || ""} disabled className="bg-muted/50 font-mono text-sm" />
            <p className="text-xs text-muted-foreground">O e-mail da sua conta não pode ser alterado.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-name">Nome completo</Label>
            <Input
              id="prof-name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-phone">WhatsApp</Label>
            <PhoneInput id="prof-phone" value={phone} onChange={setPhone} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar Perfil
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
