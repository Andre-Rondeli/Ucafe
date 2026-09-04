import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invocarFuncao } from '@/lib/funcoes'
import { base64urlParaBytes } from '@/lib/webpush'
import { useAuth } from '@/hooks/useAuth'
import { MARCA } from '@/lib/marca'

/**
 * Avisos do app (hora de recomprar) e a inscrição do celular
 * para receber push.
 *
 * O aviso mora no banco e a tela lê dali — o push é só a entrega. Quem nunca aceitou
 * notificação continua vendo tudo ao abrir o app; quem aceitou recebe com o app fechado.
 * A RLS garante que cada um lê só os seus.
 */

export interface Aviso {
  id: string
  tipo: string
  titulo: string
  corpo: string
  url: string | null
  criadoEm: string
  lidoEm: string | null
  enviadoEm: string | null
}

interface LinhaAviso {
  id: string
  tipo: string
  titulo: string
  corpo: string
  url: string | null
  criado_em: string
  lido_em: string | null
  enviado_em: string | null
}

export function useAvisos() {
  return useQuery({
    queryKey: ['avisos'],
    queryFn: async (): Promise<Aviso[]> => {
      const { data, error } = await supabase
        .from('avisos')
        .select('id, tipo, titulo, corpo, url, criado_em, lido_em, enviado_em')
        .order('criado_em', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data as LinhaAviso[]).map((linha) => ({
        id: linha.id,
        tipo: linha.tipo,
        titulo: linha.titulo,
        corpo: linha.corpo,
        url: linha.url,
        criadoEm: linha.criado_em,
        lidoEm: linha.lido_em,
        enviadoEm: linha.enviado_em,
      }))
    },
    // o motorista fica com a tela aberta na rua: aviso de carga nova precisa aparecer
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * Para onde o aviso leva ao ser tocado.
 *
 * O tipo manda mais que a `url` gravada: o aviso de recompra nasceu apontando para
 * `/clientes` — a lista de CADASTRO —, e quem recebia "6 clientes na hora de recomprar"
 * caía numa carteira inteira sem saber quais eram os seis. Traduzir aqui conserta também
 * os avisos que já estão gravados no banco com a url antiga.
 */
export function destinoDoAviso(aviso: Pick<Aviso, 'tipo' | 'url'>): string {
  if (aviso.tipo === 'recompra') return '/recompra'
  return aviso.url ?? '/'
}

export function naoLidos(avisos: Aviso[] | undefined): number {
  return (avisos ?? []).filter((aviso) => aviso.lidoEm === null).length
}

export function useMarcarAvisoLido() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('avisos')
        .update({ lido_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  })
}

export function useMarcarTodosLidos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('avisos')
        .update({ lido_em: new Date().toISOString() })
        .is('lido_em', null)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  })
}

// ---------------------------------------------------------------- push no celular

export interface EstadoPush {
  /** O navegador tem Web Push? (iOS só a partir do app instalado na tela de início.) */
  suportado: boolean
  /** 'default' = nunca perguntou · 'granted' = aceitou · 'denied' = negou no navegador. */
  permissao: NotificationPermission | 'indisponivel'
  /** Já existe assinatura deste aparelho? */
  inscrito: boolean
  /** false no navegador de desenvolvimento: o service worker só registra em produção. */
  temServiceWorker: boolean
}

function suportaPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function useEstadoPush() {
  return useQuery({
    queryKey: ['push-estado'],
    queryFn: async (): Promise<EstadoPush> => {
      if (!suportaPush()) {
        return {
          suportado: false,
          permissao: 'indisponivel',
          inscrito: false,
          temServiceWorker: false,
        }
      }
      const registro = await navigator.serviceWorker.getRegistration()
      const assinatura = registro ? await registro.pushManager.getSubscription() : null
      return {
        suportado: true,
        permissao: Notification.permission,
        inscrito: !!assinatura,
        temServiceWorker: !!registro,
      }
    },
    staleTime: 10_000,
  })
}

/**
 * Inscreve ESTE aparelho.
 *
 * A chave pública VAPID vem da Edge Function em vez de variável de build: trocar a chave
 * não pode exigir deploy do app. A assinatura é do aparelho, não da pessoa — cada celular
 * gera a sua, e por isso a tabela tem uma linha por endpoint.
 */
export function useInscreverPush() {
  const queryClient = useQueryClient()
  const { usuarioId } = useAuth()
  return useMutation({
    mutationFn: async () => {
      if (!suportaPush()) {
        throw new Error(
          'Este navegador não recebe aviso. No iPhone, instale o ${MARCA} na Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.',
        )
      }
      if (!usuarioId) throw new Error('Sessão expirada — entre de novo.')

      const registro = await navigator.serviceWorker.getRegistration()
      if (!registro) {
        throw new Error(
          'O aviso no celular funciona no app publicado (instalado na Tela de Início). No ambiente de desenvolvimento o service worker não roda.',
        )
      }

      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        throw new Error(
          'Você recusou o aviso neste aparelho. Para liberar: ajustes do navegador → Notificações → permitir para o ${MARCA}.',
        )
      }

      const { chave } = await invocarFuncao<{ chave: string }>('avisos', { acao: 'chave-publica' })
      const assinatura =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64urlParaBytes(chave) as unknown as BufferSource,
        }))

      const bruta = assinatura.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      if (!bruta.endpoint || !bruta.keys?.p256dh || !bruta.keys?.auth) {
        throw new Error('O navegador devolveu uma assinatura incompleta. Tente de novo.')
      }

      // upsert por endpoint: reinscrever o mesmo aparelho não cria linha nova, e
      // `desativada_em: null` ressuscita a assinatura que o serviço de push tinha derrubado
      const { error } = await supabase.from('push_assinaturas').upsert(
        {
          user_id: usuarioId,
          endpoint: bruta.endpoint,
          p256dh: bruta.keys.p256dh,
          auth: bruta.keys.auth,
          aparelho: navigator.userAgent.slice(0, 120),
          desativada_em: null,
          ultimo_erro: null,
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-estado'] }),
  })
}

/** Desliga o aviso neste aparelho: tira do navegador e apaga a assinatura do banco. */
export function useDesinscreverPush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const registro = await navigator.serviceWorker.getRegistration()
      const assinatura = registro ? await registro.pushManager.getSubscription() : null
      if (!assinatura) return
      const endpoint = assinatura.endpoint
      await assinatura.unsubscribe()
      const { error } = await supabase.from('push_assinaturas').delete().eq('endpoint', endpoint)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-estado'] }),
  })
}

/** Manda um aviso de teste para o próprio celular — prova a ponta inteira de uma vez. */
export function useTestarPush() {
  return useMutation({
    mutationFn: () =>
      invocarFuncao<{ enviados: number; falhas: number; sem_assinatura: number; motivos: string[] }>(
        'avisos',
        { acao: 'testar' },
      ),
  })
}
