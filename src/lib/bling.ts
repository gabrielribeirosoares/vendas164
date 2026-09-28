import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export interface BlingProductItem {
  id: number;
  nome: string;
  codigo?: string;
  preco: number;
  estoque?: { saldoVirtualTotal?: number };
  imagemURL?: string;
  descricaoCurta?: string;
}

const storeSchema = z.object({ storeId: z.string().uuid() });

async function assertOwner(supabase: import('@supabase/supabase-js').SupabaseClient, userId: string, storeId: string) {
  const { data, error } = await supabase.from('stores').select('id').eq('id', storeId).eq('owner_id', userId).maybeSingle();
  if (error || !data) throw new Error('Você não tem permissão para gerenciar esta integração.');
}

export const blingStatusServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.storeId);
    return (await import('./bling.server')).getConnectionStatus(data.storeId);
  });

export const beginBlingConnectionServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.storeId);
    return (await import('./bling.server')).beginConnection(data.storeId);
  });

export const disconnectBlingServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.storeId);
    return (await import('./bling.server')).disconnectConnection(data.storeId);
  });

export const fetchBlingProductsServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSchema.extend({ page: z.number().int().min(1).max(10000).default(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.storeId);
    return (await import('./bling.server')).loadProducts(data.storeId, data.page);
  });

export const fetchBlingProductImageServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => storeSchema.extend({
    productId: z.number().int().positive(),
    fallbackUrl: z.string().url().max(4096).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.storeId);
    return (await import('./bling.server')).loadProductImage(data.storeId, data.productId, data.fallbackUrl);
  });
